/** Enemy behaviour: movement and intent selection. Intents are committed and directional (push an enemy, move its attack). */
import type { Level, Unit, Vec2, Intent } from './types';
import { DIRS8, add, cheb, dirTo, eq, key } from './types';
import { living, tileAt, unitAt, inBounds, blocksLos } from './grid';
import { findPath, reachable, pathFromReach } from './pathfind';
import { hasStatus } from './rules';
import type { Rng } from './rng';

export type Ev = import('./types').SimEvent[];

/** Is there a clean straight 8-direction line from a to b (no blocking tiles between, no units between)? Returns dir or null. */
export function straightLine(l: Level, a: Vec2, b: Vec2, maxRange: number): Vec2 | null {
  const dx = b.x - a.x, dy = b.y - a.y;
  if (dx === 0 && dy === 0) return null;
  if (!(dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy))) return null;
  const n = Math.max(Math.abs(dx), Math.abs(dy)); if (n > maxRange) return null;
  const d = { x: Math.sign(dx), y: Math.sign(dy) };
  let p = { ...a };
  for (let i = 1; i < n; i++) { p = add(p, d); if (blocksLos(l, p) || unitAt(l, p)) return null; }
  return d;
}

function nearestParty(l: Level, u: Unit): { target: Unit; dist: number } | undefined {
  let best: { target: Unit; dist: number } | undefined;
  for (const p of living(l, 'party')) {
    if (hasStatus(p, 'hidden')) continue;
    const path = findPath(l, u.pos, p.pos, { unit: u, adjacent: true, openDoors: u.def.flags?.includes('opensDoors') });
    const dist = path ? path.length : 999 + cheb(u.pos, p.pos);
    if (!best || dist < best.dist) best = { target: p, dist };
  }
  return best;
}

function moveAlong(l: Level, u: Unit, path: Vec2[], budget: number, ev: Ev): Vec2[] {
  const taken: Vec2[] = [];
  let cost = 0;
  for (const step of path) {
    const t = tileAt(l, step)!;
    const c = t.kind === 'water' && !u.def.flags?.includes('aquatic') ? 2 : 1;
    if (cost + c > budget) break;
    if (unitAt(l, step)) break;
    if (t.prop?.kind === 'door' && !t.prop.open) {
      if (u.def.flags?.includes('opensDoors')) { t.prop.open = true; ev.push({ t: 'prop', pos: step, prop: t.prop, change: 'open' }); } else break;
    }
    if (t.kind === 'chasm' && !u.def.flags?.includes('flying')) break;
    if (t.fire > 0 && !u.def.flags?.includes('explodes')) break; // enemies avoid stepping into fire (readable rule)
    cost += c;
    if (u.def.flags?.includes('oilTrail')) { const from = tileAt(l, u.pos)!; if (from.kind === 'stone' && !from.prop) { from.kind = 'oil'; ev.push({ t: 'tile', pos: { ...u.pos }, kind: 'oil' }); } }
    u.facing = dirTo(u.pos, step);
    u.pos = { ...step }; taken.push({ ...step });
  }
  if (taken.length) ev.push({ t: 'move', id: u.id, path: taken, kind: 'walk' });
  return taken;
}

const strike = (dir: Vec2, dmg: number, kind: Intent['kind'] = 'strike', range = 1, label?: string): Intent =>
  ({ kind, dir, range, damage: dmg, label: label ?? `${kind === 'grab' ? 'Grab' : 'Strike'} ${dmg}` });

/** Choose a direction toward an adjacent party unit (prefer lowest HP). */
function adjacentTarget(l: Level, u: Unit): Unit | undefined {
  let best: Unit | undefined;
  for (const p of living(l, 'party')) if (cheb(p.pos, u.pos) === 1 && !hasStatus(p, 'hidden')) if (!best || p.hp < best.hp) best = p;
  return best;
}

function effectiveMove(u: Unit): number {
  if (hasStatus(u, 'rooted')) return 0;
  const hunting = u.intent?.kind === 'wait' ? 2 : 1;
  return u.move * hunting;
}

/** Ranged: find a reachable tile with a straight line to a party unit. Prefer current tile, then nearer tiles, then farther from the party. */
function findFiringTile(l: Level, u: Unit, range: number, budget: number): { pos: Vec2; dir: Vec2; path: Vec2[] } | undefined {
  const party = living(l, 'party').filter(p => !hasStatus(p, 'hidden'));
  for (const p of party) { const d = straightLine(l, u.pos, p.pos, range); if (d) return { pos: u.pos, dir: d, path: [] }; }
  const reach = reachable(l, u.pos, budget, { unit: u, openDoors: u.def.flags?.includes('opensDoors') });
  let best: { pos: Vec2; dir: Vec2; path: Vec2[]; score: number } | undefined;
  for (const r of reach.values()) {
    const t = tileAt(l, r.pos)!; if (t.fire > 0 || t.kind === 'chasm') continue;
    for (const p of party) {
      // temporarily evaluate from r.pos: need the unit not to block its own line; unitAt excludes self since we test from r.pos (self is elsewhere)
      const d = straightLine(l, r.pos, p.pos, range); if (!d) continue;
      const dist = cheb(r.pos, p.pos);
      const score = -r.cost + dist * 0.5 + (dist <= 1 ? -5 : 0);
      if (!best || score > best.score) best = { pos: r.pos, dir: d, path: pathFromReach(reach, r.pos, u.pos), score };
    }
  }
  return best;
}

/** Move this enemy and set its new intent. Called during the enemy phase after strikes have resolved. */
export function enemyAct(l: Level, u: Unit, rng: Rng, ev: Ev, turn: number): void {
  if (!u.alive) return;
  const ai = u.def.ai ?? 'melee';
  const budget = effectiveMove(u);
  const opens = u.def.flags?.includes('opensDoors');
  const setIntent = (it: Intent | undefined) => { u.intent = it; ev.push({ t: 'intent', id: u.id, intent: it }); };

  switch (ai) {
    case 'none': setIntent(undefined); return;
    case 'melee':
    case 'grab': {
      const near = nearestParty(l, u);
      if (!near) { setIntent({ kind: 'wait', dir: { x: 0, y: 0 }, range: 0, damage: 0, label: 'Waiting (no one in reach)' }); return; }
      if (near.dist >= 999) { setIntent({ kind: 'wait', dir: { x: 0, y: 0 }, range: 0, damage: 0, label: 'Cannot reach you' }); return; }
      if (cheb(u.pos, near.target.pos) > 1 && budget > 0) {
        const path = findPath(l, u.pos, near.target.pos, { unit: u, adjacent: true, openDoors: opens });
        if (path) moveAlong(l, u, path, budget, ev);
      }
      const tgt = adjacentTarget(l, u);
      if (tgt) { u.facing = dirTo(u.pos, tgt.pos); setIntent(strike(u.facing, u.def.attack, ai === 'grab' ? 'grab' : 'strike')); }
      else setIntent({ kind: 'wait', dir: { x: 0, y: 0 }, range: 0, damage: 0, label: 'Closing in (×2 move)' });
      return;
    }
    case 'ranged':
    case 'pusher': {
      const range = u.def.attackRange;
      const fire = findFiringTile(l, u, range, budget);
      if (fire) {
        if (fire.path.length) moveAlong(l, u, fire.path, budget, ev);
        // re-check line from the actual position
        const party = living(l, 'party');
        let dir: Vec2 | null = null;
        for (const p of party) { dir = straightLine(l, u.pos, p.pos, range); if (dir) break; }
        if (dir) {
          u.facing = dir;
          if (ai === 'pusher') setIntent({ kind: 'blast', dir, range, damage: u.def.attack, label: `Blast: push 2, ${u.def.attack} dmg` });
          else setIntent({ kind: 'shoot', dir, range, damage: u.def.attack, label: `Shoot ${u.def.attack}` });
          return;
        }
      }
      // couldn't find a shot: approach
      const near = nearestParty(l, u);
      if (near && budget > 0) { const path = findPath(l, u.pos, near.target.pos, { unit: u, adjacent: true, openDoors: opens }); if (path) moveAlong(l, u, path.slice(0, Math.max(0, path.length - 2)), budget, ev); }
      setIntent({ kind: 'wait', dir: { x: 0, y: 0 }, range: 0, damage: 0, label: 'Closing in (×2 move)' });
      return;
    }
    case 'healer': {
      // Heal the most wounded ally within 3; otherwise keep distance.
      const allies = living(l, 'enemy').filter(a => a !== u && a.hp < a.maxHp && cheb(a.pos, u.pos) <= 3);
      allies.sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp));
      const near = nearestParty(l, u);
      if (near && near.dist <= 2 && budget > 0) {
        // step away from the party
        const reach = reachable(l, u.pos, budget, { unit: u, openDoors: opens });
        let best: Vec2 | undefined; let bd = -1;
        for (const r of reach.values()) { const t = tileAt(l, r.pos)!; if (t.fire > 0) continue; const d = Math.min(...living(l, 'party').map(p => cheb(p.pos, r.pos))); if (d > bd) { bd = d; best = r.pos; } }
        if (best) moveAlong(l, u, pathFromReach(reach, best, u.pos), budget, ev);
      }
      const allies2 = living(l, 'enemy').filter(a => a !== u && a.hp < a.maxHp && cheb(a.pos, u.pos) <= 3).sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp));
      if (allies2.length) { setIntent({ kind: 'heal', dir: dirTo(u.pos, allies2[0].pos), range: 3, damage: 2, label: `Heal ${allies2[0].name} 2`, targetId: allies2[0].id }); return; }
      const tgt = adjacentTarget(l, u);
      if (tgt) { setIntent(strike(dirTo(u.pos, tgt.pos), u.def.attack)); return; }
      setIntent({ kind: 'wait', dir: { x: 0, y: 0 }, range: 0, damage: 0, label: 'Keeping back (no one to heal)' });
      return;
    }
    case 'ferryman': {
      // Alternate: pull a party member along a line (toward him, and toward the edge), or strike if adjacent.
      const tgt = adjacentTarget(l, u);
      if (tgt && turn % 2 === 0) { setIntent(strike(dirTo(u.pos, tgt.pos), u.def.attack, 'strike', 1, `Strike ${u.def.attack}`)); return; }
      const party = living(l, 'party');
      let dir: Vec2 | null = null;
      for (const p of party) { dir = straightLine(l, u.pos, p.pos, 4); if (dir) break; }
      if (!dir && budget > 0) {
        const fire = findFiringTile(l, u, 4, budget);
        if (fire) { moveAlong(l, u, fire.path, budget, ev); for (const p of party) { dir = straightLine(l, u.pos, p.pos, 4); if (dir) break; } }
      }
      if (dir) { u.facing = dir; setIntent({ kind: 'pull', dir, range: 4, damage: 1, label: 'Chain: pull 2 toward him, 1 dmg' }); return; }
      const near = nearestParty(l, u);
      if (near && budget > 0) { const path = findPath(l, u.pos, near.target.pos, { unit: u, adjacent: true }); if (path) moveAlong(l, u, path, budget, ev); }
      const t2 = adjacentTarget(l, u);
      if (t2) setIntent(strike(dirTo(u.pos, t2.pos), u.def.attack)); else setIntent({ kind: 'wait', dir: { x: 0, y: 0 }, range: 0, damage: 0, label: 'Hauling the chain (no target)' });
      return;
    }
    case 'tallow': {
      // Heals every Spent within 3 by 3; every 3rd turn summons. Strikes if adjacent.
      const tgt = adjacentTarget(l, u);
      if (turn % 3 === 0) { setIntent({ kind: 'summon', dir: { x: 0, y: 0 }, range: 3, damage: 0, label: 'Wakes a Spent from the wall' }); return; }
      if (tgt && turn % 3 === 1) { setIntent(strike(dirTo(u.pos, tgt.pos), u.def.attack)); return; }
      setIntent({ kind: 'heal', dir: { x: 0, y: 0 }, range: 3, damage: 3, label: 'Heals every Spent within 3 by 3' });
      return;
    }
    case 'prelate': {
      if (turn % 3 === 0) { setIntent({ kind: 'summon', dir: { x: 0, y: 0 }, range: 2, damage: 0, label: 'Calls a Stoker to his side' }); return; }
      const party = living(l, 'party'); let dir: Vec2 | null = null;
      for (const p of party) { dir = straightLine(l, u.pos, p.pos, 4); if (dir) break; }
      if (!dir && budget > 0) { const fire = findFiringTile(l, u, 4, budget); if (fire) { moveAlong(l, u, fire.path, budget, ev); for (const p of party) { dir = straightLine(l, u.pos, p.pos, 4); if (dir) break; } } }
      if (dir) { u.facing = dir; setIntent({ kind: 'shoot', dir, range: 4, damage: 3, label: 'Kindling: 3 fire along the line' }); return; }
      setIntent({ kind: 'wait', dir: { x: 0, y: 0 }, range: 0, damage: 0, label: 'Praying (no target in line)' });
      return;
    }
    case 'hearth': {
      setIntent({ kind: 'summon', dir: { x: 0, y: 0 }, range: 0, damage: 0, label: 'Dreaming: wakes two fevers' });
      return;
    }
  }
}

/** Re-aim an enemy's committed attack at a provoker (Roar / Bulwark). */
export function reaim(l: Level, u: Unit, provoker: Unit, ev: Ev): boolean {
  if (!u.intent || u.intent.kind === 'wait' || u.intent.kind === 'heal' || u.intent.kind === 'summon') return false;
  if (u.intent.kind === 'strike' || u.intent.kind === 'grab') {
    if (cheb(u.pos, provoker.pos) !== 1) return false;
    u.intent = { ...u.intent, dir: dirTo(u.pos, provoker.pos) }; u.facing = u.intent.dir;
  } else {
    const d = straightLine(l, u.pos, provoker.pos, u.intent.range); if (!d) return false;
    u.intent = { ...u.intent, dir: d }; u.facing = d;
  }
  ev.push({ t: 'intent', id: u.id, intent: u.intent });
  return true;
}

export { DIRS8, inBounds, key, eq };
