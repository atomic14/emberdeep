/** Procedural floor generation: rooms + corridors, hazards per Hour, props, spawns by threat budget. */
import type { Level, Room, Tile, Vec2, FloorMeta, Unit } from './types';
import { DIRS4, DIRS8, add, cheb, key } from './types';
import { makeTile, tileAt, inBounds, walkable, unitAt } from './grid';
import { findPath } from './pathfind';
import { Rng } from './rng';
import { ENEMY_DEFS, SPAWN_TABLES } from '../content/units';
import { makeUnit } from './combat';

export const HOUR_NAMES: Record<number, string> = { 1: 'The Cistern', 2: 'The Ossuary', 3: 'The Stokeworks', 4: 'The Warm Hour' };
export const KEEPER_FOR_HOUR: Record<number, string> = { 1: 'ferryman', 2: 'tallow', 3: 'prelate', 4: 'hearth' };

export interface GenOptions {
  seed: number;
  hour: 1 | 2 | 3 | 4;
  index: number;           // 1..3 normal, 4 = keeper
  fever: number;           // meta difficulty 0..n
  partyDefs: { def: Unit['def']; name: string; hp?: number; maxHp?: number; boons?: string[]; mods?: Record<string, number> }[];
  eventIds: string[];      // event ids available to place
  pagesLeft: number[];     // Choir page ids not yet found
  keeper?: boolean;        // keeper arena instead of a normal floor
}

function carveRoom(l: Level, r: Room) {
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) { const t = tileAt(l, { x, y })!; t.kind = 'stone'; t.room = r.id; }
}
function carveCorridor(l: Level, a: Vec2, b: Vec2, rng: Rng, roomId = -1) {
  // L-shaped corridor, random bend
  const mid = rng.chance(0.5) ? { x: b.x, y: a.y } : { x: a.x, y: b.y };
  for (const [p, q] of [[a, mid], [mid, b]] as [Vec2, Vec2][]) {
    const dx = Math.sign(q.x - p.x), dy = Math.sign(q.y - p.y);
    let c = { ...p };
    for (;;) {
      const t = tileAt(l, c); if (t && t.kind === 'wall') { t.kind = 'stone'; t.room = roomId; }
      if (c.x === q.x && c.y === q.y) break;
      c = { x: c.x + dx, y: c.y + dy };
    }
  }
}
const centre = (r: Room): Vec2 => ({ x: Math.floor(r.x + r.w / 2), y: Math.floor(r.y + r.h / 2) });
const overlaps = (a: Room, b: Room, pad = 2) => a.x - pad < b.x + b.w && a.x + a.w + pad > b.x && a.y - pad < b.y + b.h && a.y + a.h + pad > b.y;

function blob(l: Level, rng: Rng, r: Room, kind: Tile['kind'], count: number, maxSize: number, avoid: (p: Vec2) => boolean) {
  for (let i = 0; i < count; i++) {
    let p = { x: rng.int(r.x + 1, r.x + r.w - 2), y: rng.int(r.y + 1, r.y + r.h - 2) };
    const size = rng.int(Math.max(2, maxSize - 3), maxSize);
    for (let s = 0; s < size; s++) {
      const t = tileAt(l, p);
      if (t && t.kind === 'stone' && t.room === r.id && !t.prop && !avoid(p)) t.kind = kind;
      const d = rng.pick(DIRS4); const q = add(p, d);
      const tq = tileAt(l, q); if (tq && tq.room === r.id) p = q;
    }
  }
}

function placeProp(l: Level, p: Vec2, prop: NonNullable<Tile['prop']>) { const t = tileAt(l, p); if (t) t.prop = prop; }

function roomFloorTiles(l: Level, r: Room, pred?: (t: Tile, p: Vec2) => boolean): Vec2[] {
  const out: Vec2[] = [];
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) { const t = tileAt(l, { x, y })!; if (t.room === r.id && t.kind !== 'wall' && (!pred || pred(t, { x, y }))) out.push({ x, y }); }
  return out;
}
const isEdge = (r: Room, p: Vec2) => p.x === r.x || p.y === r.y || p.x === r.x + r.w - 1 || p.y === r.y + r.h - 1;

/** Doors: where a corridor tile (room -1) touches a room tile. */
function placeDoors(l: Level, rng: Rng, hour: number) {
  for (let y = 1; y < l.h - 1; y++) for (let x = 1; x < l.w - 1; x++) {
    const t = l.tiles[y * l.w + x]; if (t.kind !== 'stone' || t.room !== -1) continue;
    // corridor tile adjacent (4-dir) to exactly one room tile and walls on the perpendicular sides
    for (const d of DIRS4) {
      const n = tileAt(l, { x: x + d.x, y: y + d.y });
      if (!n || n.room < 0 || n.kind === 'wall') continue;
      const perp = { x: d.y, y: d.x };
      const a = tileAt(l, { x: x + perp.x, y: y + perp.y }), b = tileAt(l, { x: x - perp.x, y: y - perp.y });
      if (a && b && a.kind === 'wall' && b.kind === 'wall') {
        // avoid doors next to doors
        let near = false; for (const dd of DIRS8) { const q = tileAt(l, { x: x + dd.x, y: y + dd.y }); if (q?.prop?.kind === 'door') near = true; }
        if (!near && rng.chance(hour === 1 ? 0.75 : 0.6)) t.prop = { kind: 'door', open: false };
      }
    }
  }
}

export function generateFloor(o: GenOptions): Level {
  const rng = new Rng(o.seed);
  const isKeeper = o.keeper ?? o.index === 4;
  const W = isKeeper ? 24 : 48, H = isKeeper ? 24 : 48;
  const meta: FloorMeta = { hour: o.hour, index: o.index, name: HOUR_NAMES[o.hour], isKeeper, seed: o.seed };
  const l: Level = { w: W, h: H, tiles: [], rooms: [], units: [], meta, start: { x: 2, y: 2 } };
  for (let i = 0; i < W * H; i++) l.tiles.push(makeTile('wall'));

  if (isKeeper) return generateArena(l, o, rng);

  // ---- rooms
  const target = rng.int(7, 9);
  let tries = 0;
  while (l.rooms.length < target && tries++ < 400) {
    const w = rng.int(5, 11), h = rng.int(5, 9);
    const r: Room = { id: l.rooms.length, x: rng.int(1, W - w - 2), y: rng.int(1, H - h - 2), w, h, role: 'empty', cleared: false, entered: false };
    if (l.rooms.some(q => overlaps(q, r))) continue;
    l.rooms.push(r); carveRoom(l, r);
  }
  // ---- connect: MST-ish by nearest unconnected, plus one or two extra loops
  const connectedSet = new Set<number>([0]);
  while (connectedSet.size < l.rooms.length) {
    let best: { a: Room; b: Room; d: number } | undefined;
    for (const a of l.rooms) if (connectedSet.has(a.id)) for (const b of l.rooms) if (!connectedSet.has(b.id)) { const d = cheb(centre(a), centre(b)); if (!best || d < best.d) best = { a, b, d }; }
    if (!best) break;
    carveCorridor(l, centre(best.a), centre(best.b), rng); connectedSet.add(best.b.id);
  }
  for (let i = 0; i < rng.int(1, 2); i++) { const a = rng.pick(l.rooms), b = rng.pick(l.rooms); if (a !== b && cheb(centre(a), centre(b)) < 24) carveCorridor(l, centre(a), centre(b), rng); }

  // ---- roles: start = leftmost-ish room, stairs = farthest by path
  const start = l.rooms.reduce((m, r) => (r.x + r.y < m.x + m.y ? r : m), l.rooms[0]);
  start.role = 'start'; l.start = centre(start);
  let far = start; let farD = -1;
  for (const r of l.rooms) { if (r === start) continue; const p = findPath(l, l.start, centre(r), { avoidUnits: false }); const d = p ? p.length : 0; if (d > farD) { farD = d; far = r; } }
  far.role = 'stairs';
  const rest = rng.shuffle(l.rooms.filter(r => r !== start && r !== far));
  const roles: Room['role'][] = ['event', 'treasure', 'combat', 'combat', 'combat', 'combat', 'combat'];
  if (o.index === 2) roles.splice(1, 0, 'shrine');
  if (o.pagesLeft.length && rng.chance(0.7)) roles.splice(2, 0, 'page');
  rest.forEach((r, i) => { r.role = roles[i] ?? 'combat'; });
  if (far.role === 'stairs' && rng.chance(0.6)) { /* stairs room also has a fight */ }

  // ---- hazards per hour
  for (const r of l.rooms) {
    const avoidCentreOf = r.role === 'start' || r.role === 'stairs' || r.role === 'shrine' || r.role === 'event' || r.role === 'treasure' || r.role === 'page';
    const avoid = (p: Vec2) => avoidCentreOf && cheb(p, centre(r)) <= 1;
    if (o.hour === 1) {
      if (rng.chance(0.75)) blob(l, rng, r, 'water', rng.int(1, 3), 9, avoid);
      if (rng.chance(0.35) && r.role === 'combat' && r.w >= 7) blob(l, rng, r, 'chasm', 1, 7, avoid);
    } else if (o.hour === 2) {
      if (rng.chance(0.7)) blob(l, rng, r, 'oil', rng.int(1, 2), 6, avoid);
      if (rng.chance(0.3) && r.role === 'combat' && r.w >= 7) blob(l, rng, r, 'chasm', 1, 6, avoid);
      if (rng.chance(0.3)) blob(l, rng, r, 'water', 1, 5, avoid);
    } else if (o.hour === 3) {
      if (rng.chance(0.6)) blob(l, rng, r, 'oil', 1, 5, avoid);
      if (rng.chance(0.5) && r.role === 'combat') blob(l, rng, r, 'vent', rng.int(1, 3), 2, avoid);
      if (rng.chance(0.4) && r.role === 'combat' && r.w >= 7) blob(l, rng, r, 'chasm', 1, 6, avoid);
    } else {
      if (rng.chance(0.5)) blob(l, rng, r, 'oil', 1, 5, avoid);
      if (rng.chance(0.5)) blob(l, rng, r, 'water', 1, 6, avoid);
      if (rng.chance(0.5) && r.role === 'combat') blob(l, rng, r, 'chasm', 1, 6, avoid);
    }
    // vents get countdowns
    for (const p of roomFloorTiles(l, r, t => t.kind === 'vent')) tileAt(l, p)!.vent = rng.int(1, 3);
  }
  // chasms must not block the room: ensure connectivity from room centre to all stone tiles; convert stray chasm tiles back
  for (const r of l.rooms) ensureConnected(l, r);

  // ---- doors
  placeDoors(l, rng, o.hour);

  // ---- props
  for (const r of l.rooms) {
    const free = () => rng.shuffle(roomFloorTiles(l, r, (t, p) => t.kind === 'stone' && !t.prop && !isEdge(r, p) && cheb(p, centre(r)) > 1 && !adjacentToDoor(l, p)));
    const c = centre(r);
    switch (r.role) {
      case 'stairs': placeProp(l, c, { kind: 'stairs' }); break;
      case 'shrine': placeProp(l, c, { kind: 'shrine' }); break;
      case 'event': placeProp(l, c, { kind: 'event', eventId: o.eventIds.length ? rng.pick(o.eventIds) : undefined }); break;
      case 'treasure': placeProp(l, c, { kind: 'chest' }); { const f = free(); if (f[0]) placeProp(l, f[0], { kind: 'ember', amount: rng.int(1, 2) }); } break;
      case 'page': if (o.pagesLeft.length) placeProp(l, c, { kind: 'page', pageId: rng.pick(o.pagesLeft) }); break;
      case 'start': break;
    }
    const f = free();
    let i = 0;
    const n = r.role === 'combat' ? rng.int(2, 4) : rng.int(0, 2);
    for (let k = 0; k < n && i < f.length; k++) {
      const p = f[i++];
      const roll = rng.next();
      if (o.hour === 1) placeProp(l, p, roll < 0.35 ? { kind: 'pillar' } : roll < 0.6 ? { kind: 'barrel' } : roll < 0.8 ? { kind: 'lamp', lit: true } : { kind: 'brazier', lit: true });
      else if (o.hour === 2) placeProp(l, p, roll < 0.3 ? { kind: 'pillar' } : roll < 0.55 ? { kind: 'barrel' } : roll < 0.85 ? { kind: 'brazier', lit: true } : { kind: 'niche' });
      else placeProp(l, p, roll < 0.3 ? { kind: 'pillar' } : roll < 0.5 ? { kind: 'barrel' } : { kind: 'brazier', lit: true });
    }
    if (r.role === 'combat' && rng.chance(0.5) && f[i]) placeProp(l, f[i++], { kind: 'ember', amount: 1 });
    for (const p of roomFloorTiles(l, r)) { const t = tileAt(l, p)!; if (t.prop && (t.prop.kind === 'lamp' || (t.prop.kind === 'brazier' && t.prop.lit))) t.lit = true; }
  }
  // corridor lamps occasionally (Hour I has fallen street lamps)
  if (o.hour === 1) for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const t = l.tiles[y * l.w + x]; if (t.kind === 'stone' && t.room === -1 && !t.prop && rng.chance(0.02)) { /* keep corridors walkable: lamps go on walls as lit flag */ t.lit = true; } }

  // ---- party
  spawnParty(l, o);

  // ---- enemies by threat budget
  const budgetBase = 3 + o.hour * 3 + o.index + o.fever * 2;
  for (const r of l.rooms) {
    if (r.role !== 'combat' && !(r.role === 'stairs' && rng.chance(0.6)) && !(r.role === 'treasure' && rng.chance(0.4))) continue;
    let budget = budgetBase + rng.int(-2, 2);
    const cap = 3 + o.hour + (r.role === 'stairs' ? 1 : 0); let placed = 0;
    const spots = rng.shuffle(roomFloorTiles(l, r, (t, p) => (t.kind === 'stone' || t.kind === 'water' || t.kind === 'oil') && !t.prop && !unitAt(l, p)));
    const table = SPAWN_TABLES[o.hour];
    let guard = 0;
    while (budget > 0 && spots.length && guard++ < 20 && placed < cap) {
      const pick = rng.weighted(table.map(e => ({ item: e.id, w: e.w })));
      const def = ENEMY_DEFS[pick]; if (!def) break;
      if ((def.threat ?? 1) > budget + 1) continue;
      let p = spots.pop()!;
      if (def.id === 'drowned') { const w = spots.findIndex(s => tileAt(l, s)!.kind === 'water'); if (w >= 0) { p = spots.splice(w, 1)[0]; } }
      const count = def.flags?.includes('swarm') ? rng.int(2, 3) : 1;
      for (let c = 0; c < count; c++) { const q = c === 0 ? p : spots.pop(); if (!q) break; l.units.push(makeUnit(def, q)); placed++; }
      budget -= (def.threat ?? 1) * count;
    }
  }
  return l;
}

function adjacentToDoor(l: Level, p: Vec2) { for (const d of DIRS8) { const t = tileAt(l, add(p, d)); if (t?.prop?.kind === 'door') return true; } return false; }

function ensureConnected(l: Level, r: Room) {
  const c = centre(r);
  if (tileAt(l, c)!.kind === 'chasm') tileAt(l, c)!.kind = 'stone';
  const seen = new Set<string>(); const stack = [c];
  while (stack.length) { const p = stack.pop()!; const k = key(p); if (seen.has(k)) continue; const t = tileAt(l, p); if (!t || t.room !== r.id || t.kind === 'wall' || t.kind === 'chasm') continue; seen.add(k); for (const d of DIRS8) stack.push(add(p, d)); }
  for (const p of roomFloorTiles(l, r)) { const t = tileAt(l, p)!; if (t.kind !== 'chasm' && !seen.has(key(p))) t.kind = 'stone', seen.add(key(p)); }
  // ensure room entrances (corridor touches) connect: any room tile adjacent to a corridor tile must not be chasm
  for (const p of roomFloorTiles(l, r)) for (const d of DIRS4) { const q = tileAt(l, add(p, d)); if (q && q.kind === 'stone' && q.room === -1) { const t = tileAt(l, p)!; if (t.kind === 'chasm') t.kind = 'stone'; } }
}

function spawnParty(l: Level, o: GenOptions) {
  const spots: Vec2[] = []; const c = l.start;
  for (const d of [{ x: 0, y: 0 }, ...DIRS8]) { const p = add(c, d); if (walkable(l, p) && !unitAt(l, p) && tileAt(l, p)!.kind === 'stone') spots.push(p); }
  o.partyDefs.forEach((pd, i) => {
    const u = makeUnit(pd.def, spots[i] ?? c, pd.name);
    if (pd.hp !== undefined) u.hp = pd.hp; if (pd.maxHp !== undefined) u.maxHp = pd.maxHp;
    if (pd.boons) u.boons = [...pd.boons]; if (pd.mods) u.mods = { ...pd.mods };
    l.units.push(u);
  });
}

/** Keeper arenas: a single large room shaped for the fight. */
function generateArena(l: Level, o: GenOptions, rng: Rng): Level {
  const r: Room = { id: 0, x: 3, y: 3, w: l.w - 6, h: l.h - 6, role: 'arena', cleared: false, entered: true };
  l.rooms.push(r); carveRoom(l, r);
  const c = centre(r);
  l.start = { x: r.x + 2, y: c.y };
  const keeperId = KEEPER_FOR_HOUR[o.hour];
  switch (o.hour) {
    case 1: { // platform ringed by chasm, bridges
      for (const p of roomFloorTiles(l, r)) { if (isEdge(r, p) || cheb(p, c) > 7) tileAt(l, p)!.kind = 'chasm'; }
      for (let x = r.x; x <= c.x - 6; x++) { tileAt(l, { x, y: c.y })!.kind = 'stone'; tileAt(l, { x, y: c.y + 1 })!.kind = 'stone'; }
      blob(l, rng, r, 'water', 3, 6, p => cheb(p, c) < 2 || cheb(p, l.start) < 3);
      for (let i = 0; i < 4; i++) { const p = add(c, { x: rng.int(-5, 5), y: rng.int(-5, 5) }); if (tileAt(l, p)!.kind === 'stone' && cheb(p, c) > 2) placeProp(l, p, { kind: 'lamp', lit: true }); tileAt(l, p)!.lit = true; }
      break;
    }
    case 2: { // niches along the walls (summon points), oil around her, pillars
      for (const p of roomFloorTiles(l, r)) if (isEdge(r, p) && (p.x + p.y) % 4 === 0) placeProp(l, p, { kind: 'niche' });
      blob(l, rng, r, 'oil', 4, 7, p => cheb(p, l.start) < 4);
      for (let i = 0; i < 6; i++) { const p = { x: rng.int(r.x + 3, r.x + r.w - 4), y: rng.int(r.y + 2, r.y + r.h - 3) }; const t = tileAt(l, p)!; if (t.kind === 'stone' && !t.prop && cheb(p, c) > 2) placeProp(l, p, i < 3 ? { kind: 'pillar' } : { kind: 'brazier', lit: true }), t.lit = i >= 3; }
      break;
    }
    case 3: { // vents in a grid, a long hall, barrels
      for (let y = r.y + 2; y < r.y + r.h - 2; y += 4) for (let x = r.x + 5; x < r.x + r.w - 2; x += 4) { const t = tileAt(l, { x, y })!; t.kind = 'vent'; t.vent = ((x + y) / 4 | 0) % 3 + 1; }
      for (let i = 0; i < 6; i++) { const p = { x: rng.int(r.x + 3, r.x + r.w - 4), y: rng.int(r.y + 2, r.y + r.h - 3) }; const t = tileAt(l, p)!; if (t.kind === 'stone' && !t.prop && cheb(p, c) > 2) placeProp(l, p, i < 4 ? { kind: 'barrel' } : { kind: 'pillar' }); }
      for (let y = r.y; y < r.y + r.h; y++) { if (y % 3 === 0) { tileAt(l, { x: r.x + r.w - 1, y })!.lit = true; tileAt(l, { x: r.x, y })!.lit = true; } }
      break;
    }
    case 4: { // open, warm; alcoves (niches) with the Kept; everything lit
      for (const p of roomFloorTiles(l, r)) { tileAt(l, p)!.lit = true; if (isEdge(r, p) && (p.x + p.y) % 3 === 0) placeProp(l, p, { kind: 'niche' }); }
      blob(l, rng, r, 'water', 2, 8, p => cheb(p, c) < 3 || cheb(p, l.start) < 3);
      blob(l, rng, r, 'oil', 2, 6, p => cheb(p, c) < 3 || cheb(p, l.start) < 3);
      break;
    }
  }
  spawnParty(l, o);
  const kdef = ENEMY_DEFS[keeperId];
  const kpos = o.hour === 1 ? c : { x: r.x + r.w - 5, y: c.y };
  const keeper = makeUnit(kdef, kpos); l.units.push(keeper);
  // escorts
  const escorts: Record<number, string[]> = { 1: ['pale', 'pale', 'drowned'], 2: ['spent', 'spent', 'spent_archer'], 3: ['stoker', 'bellows', 'hound'], 4: ['dream_pale', 'dream_archer'] };
  for (const eid of escorts[o.hour]) {
    for (let t = 0; t < 30; t++) { const p = add(kpos, { x: rng.int(-4, 4), y: rng.int(-4, 4) }); if (walkable(l, p) && !unitAt(l, p) && tileAt(l, p)!.kind !== 'chasm' && cheb(p, l.start) > 5) { l.units.push(makeUnit(ENEMY_DEFS[eid], p)); break; } }
  }
  return l;
}
