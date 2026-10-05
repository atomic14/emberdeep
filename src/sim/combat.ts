/** Turn engine: player actions, abilities, enemy phase, combat start/end. */
import type { Level, Unit, Vec2, SimEvent, Phase, UnitDef, Intent } from './types';
import { DIRS8, add, cheb, dirTo, eq, key, sub } from './types';
import { living, tileAt, unitAt, walkable, neighbours8, roomAt, inBounds } from './grid';
import { findPath, reachable, pathFromReach } from './pathfind';
import { hasLos, updateVisibility, line } from './los';
import {
  damage, push, shock, igniteTile, extinguish, breakBarrel, breakPillar, breakDoor, openDoor, heal, landOn, toppleBrazier,
  addStatus, removeStatus, hasStatus, isFlanked, fireTick, statusTick, ventTick, intentTiles, explode, kill, type Ev,
} from './rules';
import { enemyAct, reaim, straightLine } from './ai';
import { ABILITIES } from '../content/abilities';
import { ENEMY_DEFS } from '../content/units';
import { Rng } from './rng';

export interface CombatState {
  phase: Phase;
  turn: number;
  aware: Set<string>;      // enemy ids in this fight
  lanternRadius: number;
  rng: Rng;
  log: string[];
  idleTurns?: number;
  disengaged?: boolean;
  exploreSteps?: number;
}

let nextUnitId = 1;
export function resetIds(n = 1) { nextUnitId = n; }
export function currentId() { return nextUnitId; }
export function makeUnit(def: UnitDef, pos: Vec2, name?: string): Unit {
  return {
    id: `${def.id}_${nextUnitId++}`, def, name: name ?? def.name, faction: def.faction, pos: { ...pos }, facing: { x: 0, y: 1 },
    hp: def.hp, maxHp: def.hp, armour: def.armour, armourBroken: false, move: def.move, moveLeft: def.move, acted: false,
    cooldowns: {}, statuses: [], alive: true, boons: [], mods: {}, kills: 0,
  };
}

export function newCombatState(seed: number, lanternRadius = 6): CombatState {
  return { phase: 'explore', turn: 0, aware: new Set(), lanternRadius, rng: new Rng(seed), log: [] };
}

// ---------------------------------------------------------------- visibility & awareness

export function refreshVisibility(l: Level, cs: CombatState) {
  updateVisibility(l, living(l, 'party').map(p => p.pos), cs.lanternRadius);
}

/** Enemies that can currently see a party member (within lantern radius or standing on a lit tile with LoS). */
export function enemiesThatSee(l: Level, cs: CombatState): Unit[] {
  const out: Unit[] = [];
  for (const e of living(l, 'enemy')) {
    if (e.def.ai === 'none') continue;
    const t = tileAt(l, e.pos)!;
    for (const p of living(l, 'party')) {
      const d = cheb(e.pos, p.pos);
      const sight = t.visible || (t.lit && d <= cs.lanternRadius * 2);
      if (sight && hasLos(l, e.pos, p.pos)) { out.push(e); break; }
    }
  }
  return out;
}

/** Begin combat with the given enemies (plus any others in the same rooms). */
export function startCombat(l: Level, cs: CombatState, seen: Unit[], ev: Ev, reason = 'They have seen your light.') {
  if (cs.phase !== 'explore') { for (const e of seen) if (!cs.aware.has(e.id)) { cs.aware.add(e.id); ev.push({ t: 'spawn', id: e.id }); } return; }
  cs.phase = 'player'; cs.turn = 1;
  const rooms = new Set(seen.map(e => tileAt(l, e.pos)!.room));
  for (const e of living(l, 'enemy')) if (seen.includes(e) || (rooms.has(tileAt(l, e.pos)!.room) && tileAt(l, e.pos)!.room >= 0)) cs.aware.add(e.id);
  for (const p of living(l, 'party')) { p.moveLeft = p.move + (p.mods['move'] ?? 0); p.acted = false; p.movedFrom = undefined; }
  ev.push({ t: 'combatStart', reason });
  ev.push({ t: 'turn', phase: 'player' });
}

export function awareEnemies(l: Level, cs: CombatState): Unit[] { return living(l, 'enemy').filter(e => cs.aware.has(e.id)); }

function checkCombatEnd(l: Level, cs: CombatState, ev: Ev): boolean {
  if (cs.phase === 'explore' || cs.phase === 'won' || cs.phase === 'lost') return false;
  if (living(l, 'party').length === 0) { cs.phase = 'lost'; ev.push({ t: 'combatEnd', won: false }); return true; }
  if (awareEnemies(l, cs).length === 0) {
    cs.phase = 'explore'; cs.aware.clear();
    for (const p of living(l, 'party')) { p.movedFrom = undefined; p.acted = false; p.moveLeft = p.move; for (const k of Object.keys(p.cooldowns)) p.cooldowns[k] = 0; for (const s of [...p.statuses]) if (s.kind !== 'burning') removeStatus(p, s.kind, ev); }
    ev.push({ t: 'combatEnd', won: !cs.disengaged }); cs.disengaged = false;
    return true;
  }
  return false;
}

// ---------------------------------------------------------------- player: movement

export function moveRange(l: Level, u: Unit) {
  return reachable(l, u.pos, u.moveLeft, { unit: u });
}

/** Threatened tiles: union of all aware enemies' intent tiles. */
export function threatTiles(l: Level, cs: CombatState): Map<string, { by: Unit; dmg: number }[]> {
  const m = new Map<string, { by: Unit; dmg: number }[]>();
  for (const e of awareEnemies(l, cs)) {
    if (!e.intent) continue;
    for (const p of intentTiles(l, e)) { const k = key(p); const arr = m.get(k) ?? []; arr.push({ by: e, dmg: e.intent.damage }); m.set(k, arr); }
  }
  return m;
}

export function moveUnit(l: Level, cs: CombatState, u: Unit, dest: Vec2, ev: Ev): boolean {
  if (cs.phase !== 'player' || !u.alive || u.faction !== 'party' || u.acted) return false;
  if (hasStatus(u, 'rooted')) { ev.push({ t: 'text', text: `${u.name.split(' ')[0]} is held fast.`, style: 'warn' }); return false; }
  const reach = moveRange(l, u); const r = reach.get(key(dest)); if (!r) return false;
  const path = pathFromReach(reach, dest, u.pos);
  if (!u.movedFrom) u.movedFrom = { ...u.pos };
  const before = ev.length;
  u.moveLeft -= r.cost; if (path.length) u.facing = dirTo(path.length > 1 ? path[path.length - 2] : u.pos, dest);
  u.pos = { ...dest };
  ev.push({ t: 'move', id: u.id, path, kind: 'walk' });
  landOn(l, u, ev);
  // moving through fire or into a hazard commits the move (no undo)
  if (ev.slice(before).some(e => e.t === 'damage' || e.t === 'die')) u.movedFrom = undefined;
  refreshVisibility(l, cs);
  joinNewEnemies(l, cs, ev);
  return true;
}

export function canUndo(u: Unit) { return !!u.movedFrom && !u.acted && u.alive; }
export function undoMove(l: Level, cs: CombatState, u: Unit, ev: Ev): boolean {
  if (!canUndo(u)) return false;
  const from = u.movedFrom!; if (unitAt(l, from)) return false;
  ev.push({ t: 'move', id: u.id, path: [from], kind: 'dash' });
  u.pos = { ...from }; u.moveLeft = u.move + (u.mods['move'] ?? 0); u.movedFrom = undefined;
  refreshVisibility(l, cs);
  return true;
}

/** Enemies from other rooms that now see the party join the fight. */
function joinNewEnemies(l: Level, cs: CombatState, ev: Ev) {
  if (cs.phase !== 'player' && cs.phase !== 'enemy') return;
  for (const e of enemiesThatSee(l, cs)) if (!cs.aware.has(e.id)) { cs.aware.add(e.id); ev.push({ t: 'spawn', id: e.id }); ev.push({ t: 'text', text: `${e.name} joins the fight.`, style: 'warn' }); }
}

// ---------------------------------------------------------------- player: attacks and abilities

export function attackDamage(l: Level, u: Unit, target: Unit): { dmg: number; flanked: boolean } {
  let dmg = u.def.attack + (u.mods['attack'] ?? 0);
  const flanked = u.def.attackRange === 1 && isFlanked(l, u, target);
  if (flanked) dmg += u.def.id === 'rogue' ? dmg : 1;
  return { dmg, flanked };
}

/** Valid basic-attack targets for a unit from its current position. */
export function attackTargets(l: Level, u: Unit): Unit[] {
  const out: Unit[] = [];
  for (const e of living(l, u.faction === 'party' ? 'enemy' : 'party')) {
    if (u.def.attackRange === 1) { if (cheb(u.pos, e.pos) === 1) out.push(e); }
    else if (cheb(u.pos, e.pos) <= u.def.attackRange && hasLos(l, u.pos, e.pos) && tileAt(l, e.pos)!.visible) out.push(e);
  }
  return out;
}

export function basicAttack(l: Level, cs: CombatState, u: Unit, target: Unit, ev: Ev): boolean {
  if (cs.phase !== 'player' || u.acted || !u.alive || !target.alive) return false;
  if (!attackTargets(l, u).includes(target)) return false;
  const { dmg } = attackDamage(l, u, target);
  u.facing = dirTo(u.pos, target.pos); u.acted = true; u.movedFrom = undefined;
  u.lastAction = `striking ${target.name}`;
  ev.push({ t: 'attack', id: u.id, targetPos: target.pos });
  if (u.def.attackRange > 1) ev.push({ t: 'projectile', from: u.pos, to: target.pos, kind: u.def.id === 'mage' ? 'spark' : 'arrow' });
  damage(l, target, dmg, ev, { kind: 'hit', sourceId: u.id, cause: `${u.name}` });
  if (hasStatus(u, 'hidden')) removeStatus(u, 'hidden', ev);
  afterAction(l, cs, ev);
  return true;
}

/** Props a unit can strike directly: barrels break (oil), braziers topple (fire). */
export function attackableProps(l: Level, u: Unit): Vec2[] {
  const out: Vec2[] = [];
  const r = u.def.attackRange;
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const p = add(u.pos, { x: dx, y: dy }); if ((!dx && !dy) || !inBounds(l, p)) continue;
    const t = tileAt(l, p)!; const pr = t.prop; if (!pr || pr.broken || !(pr.kind === 'barrel' || pr.kind === 'brazier')) continue;
    if (!t.explored) continue;
    if (r > 1 && !(t.visible && hasLos(l, u.pos, p))) continue;
    out.push(p);
  }
  return out;
}
export function attackProp(l: Level, cs: CombatState, u: Unit, pos: Vec2, ev: Ev): boolean {
  if (!u.alive || !attackableProps(l, u).some(p => eq(p, pos))) return false;
  const combat = cs.phase === 'player';
  if (combat && u.acted) return false;
  const t = tileAt(l, pos)!; const pr = t.prop!;
  u.facing = dirTo(u.pos, pos);
  ev.push({ t: 'attack', id: u.id, targetPos: pos });
  if (u.def.attackRange > 1) ev.push({ t: 'projectile', from: u.pos, to: pos, kind: u.def.id === 'mage' ? 'spark' : 'arrow' });
  if (pr.kind === 'barrel') { breakBarrel(l, pos, ev); u.lastAction = 'breaking a barrel'; }
  else { toppleBrazier(l, pos, dirTo(u.pos, pos), ev); u.lastAction = 'knocking over a brazier'; }
  if (combat) { u.acted = true; u.movedFrom = undefined; }
  refreshVisibility(l, cs);
  if (cs.phase === 'explore') { const seen = enemiesThatSee(l, cs); if (seen.length) startCombat(l, cs, seen, ev, 'The noise carries.'); }
  else afterAction(l, cs, ev);
  return true;
}

export interface Target { pos: Vec2; unit?: Unit }

/** Tiles a given ability can target from the unit's position. */
export function abilityTargets(l: Level, u: Unit, abilityId: string): Vec2[] {
  const a = ABILITIES[abilityId]; if (!a) return [];
  if (u.cooldowns[abilityId] > 0) return [];
  const out: Vec2[] = [];
  const range = a.range + (u.mods[abilityId + '_range'] ?? 0);
  if (a.shape === 'self') return [u.pos];
  for (let dy = -range; dy <= range; dy++) for (let dx = -range; dx <= range; dx++) {
    const p = add(u.pos, { x: dx, y: dy }); if ((dx === 0 && dy === 0) || !inBounds(l, p)) continue;
    const t = tileAt(l, p)!; if (t.kind === 'wall' || t.kind === 'void') continue;
    if (!t.explored) continue;
    if (a.shape === 'line') { if (!(dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy))) continue; if (Math.max(Math.abs(dx), Math.abs(dy)) !== 1) continue; }
    if (a.needsLos && !hasLos(l, u.pos, p)) continue;
    const un = unitAt(l, p);
    switch (a.targets) {
      case 'unit': if (!un || !t.visible) continue; break;
      case 'enemy': if (!un || un.faction === u.faction || !t.visible) continue; break;
      case 'ally': if (!un || un.faction !== u.faction) continue; break;
      case 'empty': if (un || !walkable(l, p, u)) continue; break;
      case 'any': if (!un && !(t.prop && ['pillar', 'barrel', 'door', 'brazier'].includes(t.prop.kind) && !t.prop.broken)) continue; break;
      case 'tile': break;
    }
    out.push(p);
  }
  return out;
}

/** Tiles affected by an ability aimed at target (for previews). */
export function abilityFootprint(l: Level, u: Unit, abilityId: string, target: Vec2): Vec2[] {
  const a = ABILITIES[abilityId];
  switch (a?.shape) {
    case 'line': { const d = dirTo(u.pos, target); const out: Vec2[] = []; let p = u.pos; for (let i = 0; i < a.range + (u.mods[abilityId + '_range'] ?? 0); i++) { p = add(p, d); const t = tileAt(l, p); if (!t || t.kind === 'wall' || t.kind === 'void') break; out.push(p); if (t.prop && ((t.prop.kind === 'door' && !t.prop.open) || (t.prop.kind === 'pillar' && !t.prop.broken))) break; } return out; }
    case 'area': { const out: Vec2[] = []; for (const d of [{ x: 0, y: 0 }, ...DIRS8]) { const p = add(target, d); const t = tileAt(l, p); if (t && t.kind !== 'wall' && t.kind !== 'void') out.push(p); } return out; }
    case 'tile': if (abilityId === 'volley') { const d = dirTo(u.pos, target); const perp = d.x === 0 || d.y === 0 ? { x: d.y, y: d.x } : { x: d.x, y: 0 }; const side = d.x === 0 || d.y === 0 ? perp : { x: 0, y: d.y }; return [target, add(target, side), sub(target, side)].filter(p => { const t = tileAt(l, p); return t && t.kind !== 'wall' && t.kind !== 'void'; }); } return [target];
    case 'self': return [u.pos];
    default: return [target];
  }
}

export function useAbility(l: Level, cs: CombatState, u: Unit, abilityId: string, target: Vec2, ev: Ev): boolean {
  const a = ABILITIES[abilityId]; if (!a || !u.alive) return false;
  if (cs.phase !== 'player') return false;
  const free = abilityId === 'shadowstep';
  if (u.acted && !free) return false;
  if ((u.cooldowns[abilityId] ?? 0) > 0) return false;
  const valid = abilityTargets(l, u, abilityId); if (!valid.some(p => eq(p, target))) return false;
  const tu = unitAt(l, target);
  const cdMod = u.mods[abilityId + '_cd'] ?? 0;
  const commit = () => { u.cooldowns[abilityId] = Math.max(1, a.cooldown + cdMod); if (!free) { u.acted = true; u.movedFrom = undefined; } u.lastAction = `using ${a.name}`; ev.push({ t: 'ability', id: u.id, ability: abilityId, targetPos: target }); if (!eq(target, u.pos)) u.facing = dirTo(u.pos, target); };
  const dmgMod = u.mods[abilityId + '_dmg'] ?? 0;
  const pushMod = u.mods[abilityId + '_push'] ?? 0;
  switch (abilityId) {
    case 'shield_bash': if (!tu) return false; commit(); damage(l, tu, 2 + dmgMod, ev, { sourceId: u.id, cause: u.name }); if (tu.alive) push(l, tu, dirTo(u.pos, tu.pos), 1 + pushMod, ev, u.id); break;
    case 'heave': if (!tu) return false; commit(); damage(l, tu, 2 + dmgMod, ev, { sourceId: u.id, cause: u.name }); if (tu.alive) push(l, tu, dirTo(u.pos, tu.pos), 2 + pushMod, ev, u.id); break;
    case 'sunder': {
      const t = tileAt(l, target)!;
      if (tu) { commit(); tu.armourBroken = true; damage(l, tu, 3 + dmgMod, ev, { sourceId: u.id, cause: u.name }); ev.push({ t: 'text', text: `${tu.name}'s armour is broken.`, style: 'info' }); }
      else if (t.prop && !t.prop.broken) { commit(); if (t.prop.kind === 'pillar') breakPillar(l, target, ev); else if (t.prop.kind === 'barrel') breakBarrel(l, target, ev); else if (t.prop.kind === 'door') breakDoor(l, target, ev); else if (t.prop.kind === 'brazier') { t.prop.broken = true; t.lit = false; ev.push({ t: 'prop', pos: target, prop: t.prop, change: 'break' }); igniteTile(l, target, ev, 2); } }
      else return false;
      break;
    }
    case 'hold': { commit(); for (const ally of living(l, 'party')) if (ally !== u && cheb(ally.pos, u.pos) === 1) addStatus(ally, 'guarded', 1, ev, undefined, u.id); break; }
    case 'bulwark': case 'roar': {
      commit(); if (abilityId === 'bulwark') addStatus(u, 'bulwark', 1, ev);
      const r = abilityId === 'roar' ? 4 : 3; let n = 0;
      for (const e of awareEnemies(l, cs)) if (cheb(e.pos, u.pos) <= r && reaim(l, e, u, ev)) n++;
      ev.push({ t: 'text', text: n ? `${n} enemies turn toward ${u.name.split(' ')[0]}.` : `Nothing turns.`, style: 'info' });
      break;
    }
    case 'gust': {
      commit(); const d = dirTo(u.pos, target); const tiles = abilityFootprint(l, u, abilityId, target);
      ev.push({ t: 'projectile', from: u.pos, to: tiles[tiles.length - 1] ?? target, kind: 'gust' });
      // push farthest first so units don't collide
      const units = tiles.map(p => unitAt(l, p)).filter((x): x is Unit => !!x).sort((a, b) => cheb(b.pos, u.pos) - cheb(a.pos, u.pos));
      for (const p of tiles) extinguish(l, p, ev);
      for (const un of units) push(l, un, d, 1 + pushMod, ev, u.id);
      break;
    }
    case 'kindle': { commit(); ev.push({ t: 'projectile', from: u.pos, to: target, kind: 'fire' }); igniteTile(l, target, ev, 2, 2 + dmgMod); break; }
    case 'spark': { if (!tu) return false; commit(); ev.push({ t: 'projectile', from: u.pos, to: target, kind: 'spark' }); shock(l, tu, 2 + dmgMod, ev, u.id); break; }
    case 'hook': { if (!tu) return false; commit(); ev.push({ t: 'projectile', from: u.pos, to: target, kind: 'hook' }); damage(l, tu, 1 + dmgMod, ev, { sourceId: u.id, cause: u.name }); if (tu.alive) push(l, tu, dirTo(tu.pos, u.pos), Math.min(2 + pushMod, cheb(tu.pos, u.pos) - 1), ev, u.id, 'pull'); break; }
    case 'smoke': { commit(); for (const p of abilityFootprint(l, u, abilityId, target)) { const t = tileAt(l, p)!; if (t.smoke === 0) ev.push({ t: 'smoke', pos: p, on: true }); t.smoke = 2; } break; }
    case 'shadowstep': { if (tu) return false; commit(); const from = u.pos; u.pos = { ...target }; ev.push({ t: 'move', id: u.id, path: [target], kind: 'dash' }); u.facing = dirTo(from, target); landOn(l, u, ev); break; }
    case 'pin': { if (!tu) return false; commit(); ev.push({ t: 'projectile', from: u.pos, to: target, kind: 'arrow' }); damage(l, tu, 2 + dmgMod, ev, { sourceId: u.id, cause: u.name }); if (tu.alive) addStatus(tu, 'rooted', 2, ev); break; }
    case 'volley': { commit(); for (const p of abilityFootprint(l, u, abilityId, target)) { ev.push({ t: 'projectile', from: u.pos, to: p, kind: 'arrow' }); const un = unitAt(l, p); if (un) damage(l, un, 2 + dmgMod, ev, { sourceId: u.id, cause: u.name }); } break; }
    case 'mark': { if (!tu) return false; commit(); addStatus(tu, 'marked', 3 + (u.mods['mark_turns'] ?? 0), ev); break; }
    default: return false;
  }
  if (hasStatus(u, 'hidden') && abilityId !== 'smoke') removeStatus(u, 'hidden', ev);
  refreshVisibility(l, cs);
  afterAction(l, cs, ev);
  return true;
}

/** Interact with a door/chest/etc. In combat this costs the action for doors. */
export function interact(l: Level, cs: CombatState, u: Unit, pos: Vec2, ev: Ev): boolean {
  const t = tileAt(l, pos); if (!t || !t.prop) return false;
  if (cheb(u.pos, pos) !== 1 && !eq(u.pos, pos)) return false;
  if (t.prop.kind === 'door') {
    if (cs.phase === 'player' && u.acted) return false;
    const ok = openDoor(l, pos, ev, !t.prop.open);
    if (ok && cs.phase === 'player') { u.acted = true; u.movedFrom = undefined; u.lastAction = t.prop.open ? 'opening a door' : 'holding a door shut'; }
    if (ok) { refreshVisibility(l, cs); if (cs.phase === 'explore') { const seen = enemiesThatSee(l, cs); if (seen.length) startCombat(l, cs, seen, ev, 'Something on the other side has seen your light.'); } else { joinNewEnemies(l, cs, ev); afterAction(l, cs, ev); } }
    return ok;
  }
  return false;
}

function afterAction(l: Level, cs: CombatState, ev: Ev) {
  checkCombatEnd(l, cs, ev);
}

// ---------------------------------------------------------------- enemy phase

export function endPlayerTurn(l: Level, cs: CombatState, ev: Ev): void {
  if (cs.phase !== 'player') return;
  cs.phase = 'enemy'; ev.push({ t: 'turn', phase: 'enemy' });
  for (const p of living(l, 'party')) { p.movedFrom = undefined; }
  statusTick(l, 'enemy', ev);
  // 1. Resolve committed intents (in id order for determinism)
  const enemies = awareEnemies(l, cs).sort((a, b) => a.id.localeCompare(b.id));
  for (const e of enemies) {
    if (!e.alive || !e.intent) continue;
    resolveIntent(l, cs, e, ev);
    if (checkCombatEnd(l, cs, ev)) return;
  }
  // 2. Environment
  fireTick(l, ev); ventTick(l, ev);
  if (checkCombatEnd(l, cs, ev)) return;
  // 3. Move and telegraph
  for (const e of awareEnemies(l, cs).sort((a, b) => a.id.localeCompare(b.id))) {
    if (!e.alive) continue;
    if (hasStatus(e, 'rooted')) { // rooted units keep aiming at an adjacent target if any, else wait
      const adj = living(l, 'party').find(p => cheb(p.pos, e.pos) === 1);
      if (adj && e.def.attackRange === 1) { e.intent = { kind: e.def.ai === 'grab' ? 'grab' : 'strike', dir: dirTo(e.pos, adj.pos), range: 1, damage: e.def.attack, label: `Strike ${e.def.attack}` }; }
      else if (e.def.attackRange > 1) { const d = living(l, 'party').map(p => straightLine(l, e.pos, p.pos, e.def.attackRange)).find(x => x); e.intent = d ? { kind: 'shoot', dir: d, range: e.def.attackRange, damage: e.def.attack, label: `Shoot ${e.def.attack}` } : { kind: 'wait', dir: { x: 0, y: 0 }, range: 0, damage: 0, label: 'Rooted: cannot move' }; }
      else e.intent = { kind: 'wait', dir: { x: 0, y: 0 }, range: 0, damage: 0, label: 'Rooted: cannot move' };
      ev.push({ t: 'intent', id: e.id, intent: e.intent });
      continue;
    }
    enemyAct(l, e, cs.rng, ev, cs.turn);
  }
  refreshVisibility(l, cs);
  joinNewEnemies(l, cs, ev);
  // 3b. Standoff: if nothing can reach or target anyone for two turns running, they lose your light.
  const aware = awareEnemies(l, cs);
  const allIdle = aware.length > 0 && aware.every(e => !e.intent || e.intent.kind === 'wait');
  cs.idleTurns = allIdle ? (cs.idleTurns ?? 0) + 1 : 0;
  if (cs.idleTurns >= 2) {
    for (const e of aware) { e.intent = undefined; ev.push({ t: 'intent', id: e.id, intent: undefined }); }
    cs.aware.clear(); cs.idleTurns = 0; cs.disengaged = true;
    ev.push({ t: 'text', text: 'They have lost your light. The room settles.', style: 'story' });
  }
  // 4. Player turn
  cs.turn++; cs.phase = 'player';
  statusTick(l, 'party', ev);
  for (const p of living(l, 'party')) { p.moveLeft = p.move + (p.mods['move'] ?? 0); p.acted = false; p.movedFrom = undefined; }
  if (!checkCombatEnd(l, cs, ev)) ev.push({ t: 'turn', phase: 'player' });
}

function resolveIntent(l: Level, cs: CombatState, e: Unit, ev: Ev) {
  const it = e.intent!;
  const tiles = intentTiles(l, e, it);
  switch (it.kind) {
    case 'strike': case 'grab': {
      const p = tiles[0]; if (!p) break;
      ev.push({ t: 'attack', id: e.id, targetPos: p });
      const u = unitAt(l, p);
      if (u) { damage(l, u, it.damage, ev, { sourceId: e.id, cause: e.name }); if (u.alive && it.kind === 'grab') addStatus(u, 'rooted', 2, ev); if (u.alive && e.def.id === 'stoker') igniteTile(l, u.pos, ev, 1, 0); }
      break;
    }
    case 'shoot': {
      const last = tiles[tiles.length - 1]; if (!last) break;
      ev.push({ t: 'attack', id: e.id, targetPos: last });
      ev.push({ t: 'projectile', from: e.pos, to: last, kind: e.def.id === 'spider' ? 'web' : e.def.id === 'prelate' ? 'fire' : 'arrow' });
      const u = unitAt(l, last);
      if (e.def.id === 'prelate') { for (const p of tiles) igniteTile(l, p, ev, 1, 0); }
      if (u) { damage(l, u, it.damage, ev, { sourceId: e.id, cause: e.name, kind: e.def.id === 'prelate' ? 'fire' : 'hit' }); if (u.alive && e.def.id === 'spider') addStatus(u, 'rooted', 2, ev); }
      break;
    }
    case 'pull': {
      const last = tiles[tiles.length - 1]; if (!last) break;
      ev.push({ t: 'attack', id: e.id, targetPos: last }); ev.push({ t: 'projectile', from: e.pos, to: last, kind: 'hook' });
      const u = unitAt(l, last);
      if (u) { damage(l, u, it.damage, ev, { sourceId: e.id, cause: e.name }); if (u.alive) push(l, u, dirTo(u.pos, e.pos), Math.min(2, cheb(u.pos, e.pos) - 1), ev, e.id, 'pull'); }
      break;
    }
    case 'blast': {
      ev.push({ t: 'attack', id: e.id, targetPos: tiles[tiles.length - 1] ?? e.pos }); ev.push({ t: 'projectile', from: e.pos, to: tiles[tiles.length - 1] ?? e.pos, kind: 'gust' });
      const units = tiles.map(p => unitAt(l, p)).filter((x): x is Unit => !!x).sort((a, b) => cheb(b.pos, e.pos) - cheb(a.pos, e.pos));
      for (const u of units) { damage(l, u, it.damage, ev, { sourceId: e.id, cause: e.name }); if (u.alive) push(l, u, it.dir, 2, ev, e.id); }
      break;
    }
    case 'heal': {
      if (e.def.ai === 'tallow') { for (const a of living(l, 'enemy')) if (a !== e && cheb(a.pos, e.pos) <= 3 && a.hp < a.maxHp) heal(a, it.damage, ev); }
      else { const t = it.targetId ? l.units.find(x => x.id === it.targetId && x.alive) : undefined; if (t) heal(t, it.damage, ev); }
      break;
    }
    case 'summon': {
      const spawnDef = e.def.ai === 'tallow' ? ENEMY_DEFS.spent : e.def.ai === 'prelate' ? ENEMY_DEFS.stoker : e.def.ai === 'hearth' ? cs.rng.pick([ENEMY_DEFS.dream_pale, ENEMY_DEFS.dream_spent, ENEMY_DEFS.dream_archer]) : ENEMY_DEFS.rat;
      const count = e.def.ai === 'hearth' ? 2 : 1;
      const cap = e.def.ai === 'hearth' ? 6 : 3;
      const minions = living(l, 'enemy').filter(x => x !== e && !x.def.flags?.includes('keeper')).length;
      for (let i = 0; i < count && minions + i < cap; i++) {
        const spots = spawnSpots(l, e.pos, e.def.ai === 'hearth' ? 5 : 2).filter(p => !living(l, 'party').some(u => cheb(u.pos, p) <= 1));
        if (!spots.length) break;
        const p = cs.rng.pick(spots);
        const nu = makeUnit(spawnDef, p); l.units.push(nu); cs.aware.add(nu.id);
        ev.push({ t: 'spawn', id: nu.id });
      }
      break;
    }
    default: break;
  }
}

function spawnSpots(l: Level, centre: Vec2, r: number): Vec2[] {
  const out: Vec2[] = [];
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const p = add(centre, { x: dx, y: dy }); if ((dx || dy) && inBounds(l, p) && walkable(l, p) && !unitAt(l, p) && tileAt(l, p)!.fire === 0) out.push(p); }
  return out;
}

// ---------------------------------------------------------------- exploration movement

/** Fires burn down over time outside combat (no spreading, no damage: that happens on landing). */
export function fireDecay(l: Level, ev: Ev) {
  for (let y = 0; y < l.h; y++) for (let x = 0; x < l.w; x++) {
    const t = l.tiles[y * l.w + x]; if (t.fire <= 0) continue;
    t.fire--;
    if (t.fire === 0) { ev.push({ t: 'fire', pos: { x, y }, on: false }); if (t.kind === 'oil') { t.kind = 'stone'; ev.push({ t: 'tile', pos: { x, y }, kind: 'stone' }); } }
  }
  for (let y = 0; y < l.h; y++) for (let x = 0; x < l.w; x++) { const t = l.tiles[y * l.w + x]; if (t.smoke > 0) { t.smoke--; if (t.smoke === 0) ev.push({ t: 'smoke', pos: { x, y }, on: false }); } }
}

/** Path penalty that keeps walkers out of fire and off heat vents, and reluctant about water, when there is any other way. */
export function hazardPenalty(l: Level) {
  return (p: Vec2) => { const t = tileAt(l, p)!; return (t.fire > 0 ? 1000 : 0) + (t.kind === 'vent' ? 60 : 0) + (t.kind === 'water' ? 1 : 0); };
}

/** Order of march: shields and breakers in front, the thief in the middle, ranged at the back. */
export const MARCH_RANK: Record<string, number> = { knight: 0, barbarian: 1, rogue: 2, ranger: 3, mage: 4 };
export function marchOrder(l: Level): Unit[] { return living(l, 'party').sort((a, b) => (MARCH_RANK[a.def.id] ?? 2) - (MARCH_RANK[b.def.id] ?? 2)); }

/** Move followers toward the leader in march order. Followers that have fallen behind take extra steps so the Lantern never splits. */
export function followStep(l: Level, leader: Unit, ev: Ev, vacated?: Vec2, extra = true): boolean {
  let moved = false;
  const followers = marchOrder(l).filter(u => u !== leader);
  let target = vacated;
  for (const f of followers) {
    const dist = cheb(f.pos, leader.pos);
    if (dist <= 1) { continue; }
    const steps = extra ? (dist > 4 ? 3 : dist > 2 ? 2 : 1) : 1;
    let firstVacated: Vec2 | undefined;
    for (let i = 0; i < steps; i++) {
      if (cheb(f.pos, leader.pos) <= 1) break;
      // first step: prefer the tile the unit ahead just left; later steps: any tile next to the leader
      const penalty = hazardPenalty(l);
      let path = (i === 0 && target && !unitAt(l, target)) ? findPath(l, f.pos, target, { unit: f, maxCost: 1040, penalty }) : null;
      if (!path || !path.length) path = findPath(l, f.pos, leader.pos, { unit: f, adjacent: true, maxCost: 1060, penalty });
      if (!path || !path.length) path = findPath(l, f.pos, leader.pos, { unit: f, adjacent: true, avoidUnits: false, maxCost: 1080, penalty });
      if (path && path.length && tileAt(l, path[0])!.fire > 0 && cheb(f.pos, leader.pos) <= 3) break; // better to lag a step than to walk into fire
      if (!path || !path.length) break;
      const step = path[0];
      if (unitAt(l, step)) break;
      const was = { ...f.pos }; f.facing = dirTo(f.pos, step); f.pos = { ...step };
      ev.push({ t: 'move', id: f.id, path: [step], kind: 'walk' }); moved = true;
      if (!firstVacated) firstVacated = was;
    }
    if (firstVacated) target = firstVacated;
  }
  return moved;
}

/** Step the party one tile along a path toward dest. Returns false when finished/blocked/interrupted. */
export function exploreStep(l: Level, cs: CombatState, leader: Unit, path: Vec2[], ev: Ev): { done: boolean; interrupted: boolean } {
  if (cs.phase !== 'explore' || !path.length) return { done: true, interrupted: false };
  const next = path[0];
  if (!walkable(l, next, leader) || unitAt(l, next) && unitAt(l, next)!.faction === 'enemy') return { done: true, interrupted: false };
  const prevLeader = { ...leader.pos };
  const blocker = unitAt(l, next);
  leader.facing = dirTo(leader.pos, next); leader.pos = { ...next };
  ev.push({ t: 'move', id: leader.id, path: [next], kind: 'walk' });
  if (blocker && blocker.faction === 'party') { blocker.pos = prevLeader; ev.push({ t: 'move', id: blocker.id, path: [prevLeader], kind: 'walk' }); }
  followStep(l, leader, ev, blocker ? undefined : prevLeader);
  for (const u of living(l, 'party')) landOn(l, u, ev);
  cs.exploreSteps = (cs.exploreSteps ?? 0) + 1;
  if (cs.exploreSteps % 3 === 0) fireDecay(l, ev);
  const room = roomAt(l, leader.pos); if (room && !room.entered) { room.entered = true; }
  refreshVisibility(l, cs);
  const seen = enemiesThatSee(l, cs);
  if (seen.length) { startCombat(l, cs, seen, ev); return { done: true, interrupted: true }; }
  path.shift();
  return { done: path.length === 0, interrupted: false };
}

export { intentTiles, findPath, reachable, pathFromReach, line, hasLos };
