/** Headless autoplayer: plays whole runs with a simple greedy policy to catch crashes and gauge balance. */
import { describe, it, expect } from 'vitest';
import type { Level, Unit, Vec2, SimEvent } from '../src/sim/types';
import { cheb, key } from '../src/sim/types';
import { tileAt, living, unitAt, walkable } from '../src/sim/grid';
import { generateFloor } from '../src/sim/dungeon';
import { newCombatState, startCombat, moveUnit, basicAttack, attackTargets, useAbility, abilityTargets, endPlayerTurn, exploreStep, threatTiles, moveRange, refreshVisibility, resetIds, enemiesThatSee, findPath, interact, attackDamage } from '../src/sim/combat';
import { PARTY_DEFS } from '../src/content/units';
import { CHOIR_PAGES } from '../src/content/story';
import { Rng } from '../src/sim/rng';

interface Stats { floors: number; fights: number; wins: number; deaths: number; turns: number; events: number; partyDeaths: string[]; hoursReached: number; crashed?: string }

function playFloor(L: Level, rng: Rng, st: Stats, maxTurns = 400): 'stairs' | 'dead' | 'stuck' {
  const cs = newCombatState(L.meta.seed, 6);
  refreshVisibility(L, cs);
  let guard = 0;
  while (guard++ < maxTurns) {
    const party = living(L, 'party'); if (!party.length) return 'dead';
    if (cs.phase === 'explore') {
      const leader = party[0];
      // target: nearest enemy-free frontier, else stairs
      const keeper = L.units.find(u => u.def.flags?.includes('keeper'));
      if (keeper && !keeper.alive) return 'stairs';
      const stairsIdx = L.tiles.findIndex(t => t.prop?.kind === 'stairs');
      const stairs = keeper ? keeper.pos : { x: stairsIdx % L.w, y: Math.floor(stairsIdx / L.w) };
      const here = tileAt(L, leader.pos)!;
      if (!keeper && (here.prop?.kind === 'stairs' || cheb(leader.pos, stairs) <= 1 && walkable(L, stairs))) return 'stairs';
      const path = findPath(L, leader.pos, stairs, { unit: leader, avoidUnits: false, openDoors: true, allowGoalOccupied: true });
      if (!path) return 'stuck';
      const next = path[0]; const t = tileAt(L, next)!;
      const ev: SimEvent[] = [];
      if (t.prop?.kind === 'door' && !t.prop.open) { interact(L, cs, leader, next, ev); st.events += ev.length; continue; }
      const r = exploreStep(L, cs, leader, [next], ev); st.events += ev.length;
      if (r.interrupted) { st.fights++; }
      continue;
    }
    if (cs.phase === 'player') {
      st.turns++;
      for (const u of living(L, 'party')) {
        if (u.acted) continue;
        const ev: SimEvent[] = [];
        // 1. attack if possible, preferring kills
        let targets = attackTargets(L, u);
        if (!targets.length) {
          // move toward nearest enemy, avoiding threatened tiles
          const threats = threatTiles(L, cs);
          const keeperU = living(L, 'enemy').find(e => e.def.flags?.includes('keeper') && cs.aware.has(e.id));
          const enemies = keeperU ? [keeperU] : living(L, 'enemy').filter(e => cs.aware.has(e.id));
          if (enemies.length) {
            const reach = moveRange(L, u);
            let best: { pos: Vec2; score: number } | undefined;
            for (const r of reach.values()) {
              const t = tileAt(L, r.pos)!; if (t.kind === 'chasm' || t.fire) continue;
              const d = Math.min(...enemies.map(e => cheb(e.pos, r.pos)));
              const inRange = u.def.attackRange === 1 ? d === 1 : d <= u.def.attackRange;
              const score = (inRange ? 10 : -d) - (threats.has(key(r.pos)) ? 6 : 0) - (t.kind === 'water' ? 1 : 0);
              if (!best || score > best.score) best = { pos: r.pos, score };
            }
            if (best && best.score > -99) moveUnit(L, cs, u, best.pos, ev);
          }
          targets = attackTargets(L, u);
        }
        if (!u.acted && targets.length) {
          // try an ability with a visible benefit first (push toward chasm / damage), else basic attack
          let used = false;
          for (const ab of u.def.abilities) {
            if ((u.cooldowns[ab] ?? 0) > 0) continue;
            const valid = abilityTargets(L, u, ab).filter(p => unitAt(L, p)?.faction === 'enemy');
            if (valid.length && rng.chance(0.6)) { const p = rng.pick(valid); if (useAbility(L, cs, u, ab, p, ev)) { used = true; break; } }
          }
          if (!used && !u.acted) { const tg = targets.sort((a, b) => (b.def.flags?.includes('keeper') ? 1 : 0) - (a.def.flags?.includes('keeper') ? 1 : 0) || a.hp - b.hp)[0]; basicAttack(L, cs, u, tg, ev); }
        }
        st.events += ev.length;
        if (cs.phase !== 'player') break;
      }
      if (cs.phase === 'player') { const ev: SimEvent[] = []; endPlayerTurn(L, cs, ev); st.events += ev.length; }
      if ((cs.phase as string) === 'explore') st.wins++;
      continue;
    }
    if (cs.phase === 'lost') return 'dead';
    if (cs.phase === 'won') return 'stairs';
  }
  return 'stuck';
}

function playRun(seed: number): Stats {
  const st: Stats = { floors: 0, fights: 0, wins: 0, deaths: 0, turns: 0, events: 0, partyDeaths: [], hoursReached: 0 };
  const rng = new Rng(seed);
  let party = [{ def: PARTY_DEFS.knight, name: 'Oriel', hp: 14, maxHp: 14 }, { def: PARTY_DEFS.barbarian, name: 'Brann', hp: 16, maxHp: 16 }, { def: PARTY_DEFS.mage, name: 'Ysolde', hp: 10, maxHp: 10 }];
  for (let hour = 1 as 1 | 2 | 3 | 4; hour <= 4; hour = (hour + 1) as any) {
    const floors = hour === 4 ? [4] : [1, 2, 4];
    for (const index of floors) {
      resetIds(1);
      let L: Level;
      try { L = generateFloor({ seed: seed * 100 + hour * 10 + index, hour, index, keeper: index === 4, fever: 0, partyDefs: party, eventIds: [], pagesLeft: Object.keys(CHOIR_PAGES).map(Number) }); }
      catch (e) { st.crashed = 'gen: ' + String(e); return st; }
      st.hoursReached = hour; st.floors++;
      let res: string;
      try { res = playFloor(L, rng, st); } catch (e) { st.crashed = `floor h${hour} f${index}: ${(e as Error).stack}`; return st; }
      for (const u of L.units.filter(x => x.faction === 'party' && !x.alive)) st.partyDeaths.push(`${u.name}@h${hour}f${index}`);
      party = L.units.filter(u => u.faction === 'party' && u.alive).map(u => ({ def: u.def, name: u.name, hp: Math.min(u.maxHp, u.hp + 3), maxHp: u.maxHp }));
      if (res === 'dead' || !party.length) { st.deaths++; return st; }
      if (res === 'stuck') { st.crashed = `stuck h${hour} f${index}`; return st; }
      if (index === 2) party = party.map(p => ({ ...p, hp: p.maxHp })); // shrine
    }
  }
  return st;
}

describe('autoplay', () => {
  it('plays 12 full runs without crashing', () => {
    const results = [];
    for (let seed = 1; seed <= 12; seed++) { const st = playRun(seed); results.push(st); if (st.crashed) console.log('CRASH seed', seed, st.crashed); }
    const crashed = results.filter(r => r.crashed && !r.crashed.startsWith('stuck'));
    const summary = results.map((r, i) => `seed ${i + 1}: hour ${r.hoursReached}, floors ${r.floors}, fights ${r.fights}/${r.wins} won, turns ${r.turns}, deaths ${r.partyDeaths.join(' ')}${r.crashed ? ' ' + r.crashed.split('\n')[0] : ''}`).join('\n');
    console.log(summary);
    expect(crashed, crashed.map(c => c.crashed).join('\n')).toHaveLength(0);
  }, 120000);
});
