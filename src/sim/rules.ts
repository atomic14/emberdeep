/** Combat rules: damage, pushes, fire, water, statuses. Pure functions over Level that emit SimEvents. */
import type { Level, Unit, Vec2, SimEvent, Prop, StatusKind, Intent } from './types';
import { DIRS4, DIRS8, add, cheb, eq } from './types';
import { connected, inBounds, slideable, tileAt, unitAt, living, neighbours8 } from './grid';
import { line } from './los';

export type Ev = SimEvent[];

export function hasStatus(u: Unit, k: StatusKind) { return u.statuses.some(s => s.kind === k); }
export function getStatus(u: Unit, k: StatusKind) { return u.statuses.find(s => s.kind === k); }
export function addStatus(u: Unit, k: StatusKind, turns: number, ev: Ev, power?: number, sourceId?: string) {
  const ex = getStatus(u, k);
  if (ex && k === 'rooted') return; // a held unit cannot be held harder: roots never chain
  if (ex) { ex.turns = Math.max(ex.turns, turns); if (power !== undefined) ex.power = Math.max(ex.power ?? 0, power); }
  else { u.statuses.push({ kind: k, turns, power, sourceId }); ev.push({ t: 'status', id: u.id, status: k, on: true }); }
}
export function removeStatus(u: Unit, k: StatusKind, ev: Ev) {
  const i = u.statuses.findIndex(s => s.kind === k);
  if (i >= 0) { u.statuses.splice(i, 1); ev.push({ t: 'status', id: u.id, status: k, on: false }); }
}

export function effectiveArmour(u: Unit): number {
  if (u.armourBroken) return 0;
  let a = u.armour + (u.mods['armour'] ?? 0);
  if (hasStatus(u, 'bulwark')) a += 2;
  return a;
}

export interface DamageOpts { kind?: 'hit' | 'fire' | 'shock' | 'slam' | 'fall' | 'explode'; sourceId?: string; ignoreArmour?: boolean; cause?: string }

/** Apply damage with armour, Mark, Hold interception. Returns actual HP lost. */
export function damage(l: Level, target: Unit, amount: number, ev: Ev, o: DamageOpts = {}): number {
  if (!target.alive || amount <= 0) return 0;
  const kind = o.kind ?? 'hit';
  // Hold: an adjacent guardian takes the hit instead (once).
  if (kind === 'hit' || kind === 'shock') {
    const g = getStatus(target, 'guarded');
    if (g && g.sourceId) {
      const guardian = l.units.find(u => u.id === g.sourceId && u.alive);
      if (guardian && cheb(guardian.pos, target.pos) === 1) {
        removeStatus(target, 'guarded', ev);
        guardian.lastAction = `taking a blow meant for ${target.name.split(' ')[0]}`;
        return damage(l, guardian, amount, ev, { ...o, cause: o.cause ?? 'a blow meant for another' });
      }
    }
  }
  if (hasStatus(target, 'marked')) amount += 1;
  const arm = o.ignoreArmour || kind === 'fire' || kind === 'fall' ? 0 : effectiveArmour(target);
  const absorbed = Math.min(arm, amount);
  const dealt = Math.max(0, amount - absorbed);
  target.hp -= dealt;
  ev.push({ t: 'damage', id: target.id, amount: dealt, absorbed, kind });
  if (target.hp <= 0 && target.faction === 'party' && (target.mods['wick'] ?? 0) > 0) { target.hp = 1; target.mods['wick'] = 0; ev.push({ t: 'text', text: `The Wick holds. ${target.name.split(' ')[0]} stays at 1.`, style: 'story' }); return dealt; }
  if (target.hp <= 0) kill(l, target, ev, o.cause ?? describeKind(kind), o.sourceId);
  return dealt;
}
function describeKind(k: string) {
  switch (k) { case 'fire': return 'burning'; case 'shock': return 'lightning in the water'; case 'slam': return 'slammed into stone'; case 'fall': return 'the dark below'; case 'explode': return 'an ember burst'; default: return 'wounds'; }
}

export function heal(target: Unit, amount: number, ev: Ev) {
  if (!target.alive) return;
  const before = target.hp; target.hp = Math.min(target.maxHp, target.hp + amount);
  ev.push({ t: 'damage', id: target.id, amount: target.hp - before, absorbed: 0, kind: 'heal' });
}

export function kill(l: Level, u: Unit, ev: Ev, cause: string, sourceId?: string) {
  if (!u.alive) return;
  u.alive = false; u.hp = 0; u.intent = undefined;
  if (sourceId) { const s = l.units.find(x => x.id === sourceId); if (s) s.kills++; }
  ev.push({ t: 'die', id: u.id, cause });
  if (u.def.flags?.includes('explodes')) explode(l, u.pos, 1, 2, ev, u.id);
}

/** Fire explosion in a chebyshev radius. */
export function explode(l: Level, centre: Vec2, radius: number, dmg: number, ev: Ev, sourceId?: string) {
  const tiles: Vec2[] = [];
  for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) tiles.push({ x: centre.x + dx, y: centre.y + dy });
  for (const p of tiles) {
    const t = tileAt(l, p); if (!t || t.kind === 'wall' || t.kind === 'void') continue;
    igniteTile(l, p, ev, 1);
    const u = unitAt(l, p); if (u) damage(l, u, dmg, ev, { kind: 'explode', sourceId, cause: 'an ember burst' });
  }
}

/** Set a tile on fire. Oil burns long and spreads; stone burns briefly; water never. Units present take fire damage. */
export function igniteTile(l: Level, p: Vec2, ev: Ev, stoneTurns = 1, unitDamage = 2): boolean {
  const t = tileAt(l, p); if (!t) return false;
  if (t.kind === 'wall' || t.kind === 'void' || t.kind === 'water' || t.kind === 'chasm' || t.kind === 'ice') return false;
  if (t.prop?.kind === 'barrel' && !t.prop.broken) { breakBarrel(l, p, ev); }
  if (t.prop?.kind === 'brazier' && !t.prop.broken) { t.prop.lit = true; t.lit = true; }
  const turns = t.kind === 'oil' ? 4 : stoneTurns;
  if (t.fire < turns) { const was = t.fire; t.fire = turns; if (was === 0) ev.push({ t: 'fire', pos: p, on: true }); }
  const u = unitAt(l, p);
  if (u && unitDamage > 0) { damage(l, u, unitDamage, ev, { kind: 'fire', cause: 'burning' }); if (u.alive) addStatus(u, 'burning', 2, ev); }
  return true;
}

export function extinguish(l: Level, p: Vec2, ev: Ev) {
  const t = tileAt(l, p); if (t && t.fire > 0) { t.fire = 0; ev.push({ t: 'fire', pos: p, on: false }); }
}

/** Oil barrel breaks: spills oil in a plus shape (on stone tiles only). */
export function breakBarrel(l: Level, p: Vec2, ev: Ev) {
  const t = tileAt(l, p); if (!t || !t.prop || t.prop.kind !== 'barrel' || t.prop.broken) return;
  t.prop.broken = true; ev.push({ t: 'prop', pos: p, prop: t.prop, change: 'break' });
  for (const d of [{ x: 0, y: 0 }, ...DIRS4]) {
    const q = add(p, d); const tq = tileAt(l, q);
    if (tq && tq.kind === 'stone' && !(tq.prop && tq.prop.kind !== 'barrel')) { tq.kind = 'oil'; ev.push({ t: 'tile', pos: q, kind: 'oil' }); }
  }
  t.prop = undefined; ev.push({ t: 'prop', pos: p, prop: undefined, change: 'remove' });
}

/** Brazier knocked over: it and the next tile in the push direction ignite. */
export function toppleBrazier(l: Level, p: Vec2, dir: Vec2, ev: Ev) {
  const t = tileAt(l, p); if (!t || !t.prop || t.prop.kind !== 'brazier' || t.prop.broken) return;
  t.prop.broken = true; t.prop.lit = false; t.lit = false; ev.push({ t: 'prop', pos: p, prop: t.prop, change: 'break' });
  igniteTile(l, p, ev, 2);
  igniteTile(l, add(p, dir), ev, 2);
  igniteTile(l, add(add(p, dir), dir), ev, 1);
}

/** Pillar struck: may crumble into rubble (blocking) — always does for simplicity. */
export function breakPillar(l: Level, p: Vec2, ev: Ev) {
  const t = tileAt(l, p); if (!t || !t.prop || t.prop.kind !== 'pillar' || t.prop.broken) return;
  t.prop = { kind: 'rubble' }; ev.push({ t: 'prop', pos: p, prop: t.prop, change: 'break' });
}

export function openDoor(l: Level, p: Vec2, ev: Ev, open = true) {
  const t = tileAt(l, p); if (!t || !t.prop || t.prop.kind !== 'door') return false;
  if (t.prop.open === open) return false;
  if (!open && unitAt(l, p)) return false;
  t.prop.open = open; ev.push({ t: 'prop', pos: p, prop: t.prop, change: open ? 'open' : 'close' });
  return true;
}
export function breakDoor(l: Level, p: Vec2, ev: Ev) {
  const t = tileAt(l, p); if (!t || !t.prop || t.prop.kind !== 'door') return;
  t.prop = undefined; ev.push({ t: 'prop', pos: p, prop: undefined, change: 'remove' });
}

/** What happens to a unit that ends up on a tile (after moving/being pushed). */
export function landOn(l: Level, u: Unit, ev: Ev, cause = 'the dark below') {
  if (!u.alive) return;
  const t = tileAt(l, u.pos); if (!t) return;
  if (t.kind === 'chasm' && !u.def.flags?.includes('flying')) {
    ev.push({ t: 'fall', id: u.id, pos: u.pos });
    kill(l, u, ev, cause);
    return;
  }
  if (t.fire > 0) { damage(l, u, 2, ev, { kind: 'fire', cause: 'burning' }); if (u.alive) addStatus(u, 'burning', 2, ev); }
  if (t.kind === 'water' && hasStatus(u, 'burning')) removeStatus(u, 'burning', ev);
  if (t.kind === 'oil' && hasStatus(u, 'burning')) igniteTile(l, u.pos, ev, 1, 0);
}

/**
 * Push a unit n tiles in dir. Stops at walls/units/props (slam: +1 damage to pushed unit per blocked tile, and 1 to a struck unit).
 * Braziers topple, barrels break, pillars take the slam. Chasms kill. Returns tiles travelled.
 */
export function push(l: Level, u: Unit, dir: Vec2, n: number, ev: Ev, sourceId?: string, kind: 'push' | 'pull' | 'slide' = 'push'): number {
  if (!u.alive || (dir.x === 0 && dir.y === 0)) return 0;
  if (u.def.flags?.includes('noPush')) { ev.push({ t: 'text', text: `${u.name} does not move.`, style: 'info' }); return 0; }
  const path: Vec2[] = [];
  let moved = 0;
  for (let i = 0; i < n; i++) {
    const next = add(u.pos, dir);
    const t = tileAt(l, next);
    if (!t || t.kind === 'wall' || t.kind === 'void') { slam(l, u, 1, ev, sourceId); break; }
    const other = unitAt(l, next);
    if (other) { slam(l, u, 1, ev, sourceId); damage(l, other, 1, ev, { kind: 'slam', sourceId, cause: 'slammed into stone' }); break; }
    if (t.prop && t.prop.kind === 'brazier' && !t.prop.broken) { toppleBrazier(l, next, dir, ev); slam(l, u, 1, ev, sourceId); break; }
    if (t.prop && t.prop.kind === 'barrel' && !t.prop.broken) { breakBarrel(l, next, ev); /* oil spills, unit continues into it */ }
    else if (t.prop && t.prop.kind === 'pillar' && !t.prop.broken) { slam(l, u, 2, ev, sourceId); breakPillar(l, next, ev); break; }
    else if (!slideable(l, next) && t.kind !== 'chasm') { slam(l, u, 1, ev, sourceId); break; }
    u.pos = next; path.push({ ...next }); moved++;
    if (t.kind === 'chasm' && !u.def.flags?.includes('flying')) break;
    if (t.kind === 'ice' && i === n - 1) { n++; } // ice: slide one extra
  }
  if (path.length) ev.push({ t: 'move', id: u.id, path, kind });
  if (hasStatus(u, 'rooted') && moved > 0) removeStatus(u, 'rooted', ev);
  landOn(l, u, ev);
  return moved;
}
function slam(l: Level, u: Unit, dmg: number, ev: Ev, sourceId?: string) { damage(l, u, dmg, ev, { kind: 'slam', sourceId, cause: 'slammed into stone' }); }

/** Lightning: damage the target; if it stands in water, everyone in that connected water is hit. */
export function shock(l: Level, target: Unit, dmg: number, ev: Ev, sourceId?: string) {
  const t = tileAt(l, target.pos);
  if (t && t.kind === 'water') {
    const pool = connected(l, target.pos, tt => tt.kind === 'water');
    ev.push({ t: 'shock', tiles: pool });
    const hit = pool.map(p => unitAt(l, p)).filter((x): x is Unit => !!x);
    for (const u of hit) damage(l, u, dmg + (u.def.id === 'drowned' ? 2 : 0), ev, { kind: 'shock', sourceId, cause: 'lightning in the water' });
  } else {
    ev.push({ t: 'shock', tiles: [target.pos] });
    damage(l, target, dmg, ev, { kind: 'shock', sourceId, cause: 'lightning' });
  }
}

/** Is `attacker`'s melee attack on `target` flanked? (an ally of attacker adjacent to target) */
export function isFlanked(l: Level, attacker: Unit, target: Unit): boolean {
  for (const u of living(l, attacker.faction)) if (u !== attacker && cheb(u.pos, target.pos) === 1) return true;
  return false;
}

/** Fire tick at end of enemy turn: spreads along oil, burns down, hurts standers. */
export function fireTick(l: Level, ev: Ev) {
  const spread: Vec2[] = [];
  for (let y = 0; y < l.h; y++) for (let x = 0; x < l.w; x++) {
    const t = l.tiles[y * l.w + x]; if (t.fire <= 0) continue;
    for (const d of DIRS4) { const q = { x: x + d.x, y: y + d.y }; const tq = tileAt(l, q); if (tq && tq.kind === 'oil' && tq.fire === 0) spread.push(q); }
  }
  for (const q of spread) igniteTile(l, q, ev, 1);
  for (let y = 0; y < l.h; y++) for (let x = 0; x < l.w; x++) {
    const t = l.tiles[y * l.w + x]; if (t.fire <= 0) continue;
    if (spread.some(s => s.x === x && s.y === y)) continue; // freshly lit this tick
    const u = unitAt(l, { x, y }); if (u) damage(l, u, 2, ev, { kind: 'fire', cause: 'burning' });
    t.fire--;
    if (t.fire === 0) { ev.push({ t: 'fire', pos: { x, y }, on: false }); if (t.kind === 'oil') { t.kind = 'stone'; ev.push({ t: 'tile', pos: { x, y }, kind: 'stone' }); } }
  }
  for (let y = 0; y < l.h; y++) for (let x = 0; x < l.w; x++) {
    const t = l.tiles[y * l.w + x]; if (t.smoke > 0) { t.smoke--; if (t.smoke === 0) ev.push({ t: 'smoke', pos: { x, y }, on: false }); }
  }
}

/** Status tick for one faction at the start of its turn. */
export function statusTick(l: Level, faction: Unit['faction'], ev: Ev) {
  for (const u of living(l, faction)) {
    for (const s of [...u.statuses]) {
      if (s.kind === 'burning') damage(l, u, 1, ev, { kind: 'fire', cause: 'burning' });
      s.turns--;
      if (s.turns <= 0) removeStatus(u, s.kind, ev);
    }
    for (const k of Object.keys(u.cooldowns)) if (u.cooldowns[k] > 0) u.cooldowns[k]--;
  }
}

/** Heat vents (Hour III): countdown; erupt on 0. */
export function ventTick(l: Level, ev: Ev) {
  for (let y = 0; y < l.h; y++) for (let x = 0; x < l.w; x++) {
    const t = l.tiles[y * l.w + x]; if (t.kind !== 'vent') continue;
    t.vent = (t.vent ?? 3) - 1;
    if (t.vent <= 0) { t.vent = 3; igniteTile(l, { x, y }, ev, 1, 3); }
    ev.push({ t: 'vent', pos: { x, y }, countdown: t.vent });
  }
}

/** Tiles struck by an intent given the unit's current position. */
export function intentTiles(l: Level, u: Unit, it: Intent = u.intent!): Vec2[] {
  if (!it) return [];
  switch (it.kind) {
    case 'strike': case 'grab': return [add(u.pos, it.dir)].filter(p => inBounds(l, p));
    case 'shoot': case 'pull': {
      // first unit along the line (or full line if none)
      const out: Vec2[] = []; let p = { ...u.pos };
      for (let i = 0; i < it.range; i++) {
        p = add(p, it.dir); const t = tileAt(l, p); if (!t || t.kind === 'wall' || t.kind === 'void') break;
        if (t.prop && ((t.prop.kind === 'door' && !t.prop.open) || (t.prop.kind === 'pillar' && !t.prop.broken))) break;
        out.push(p);
        if (unitAt(l, p)) break;
      }
      return out;
    }
    case 'blast': {
      const out: Vec2[] = []; let p = { ...u.pos };
      for (let i = 0; i < it.range; i++) { p = add(p, it.dir); if (!inBounds(l, p)) break; const t = tileAt(l, p)!; if (t.kind === 'wall') break; out.push(p); }
      return out;
    }
    case 'explode': return neighbours8(l, u.pos).concat([u.pos]);
    case 'heal': { const tgt = it.targetId ? l.units.find(x => x.id === it.targetId && x.alive) : undefined; return tgt ? [tgt.pos] : []; }
    default: return [];
  }
}

export { line, eq, DIRS8 };
export type { Prop };
