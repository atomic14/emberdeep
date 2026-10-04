import type { Level, Tile, TileKind, Vec2, Unit, Prop } from './types';
import { DIRS8 } from './types';

export function makeTile(kind: TileKind = 'wall'): Tile {
  return { kind, fire: 0, smoke: 0, explored: false, visible: false, lit: false, room: -1 };
}

export function inBounds(l: Level, p: Vec2) { return p.x >= 0 && p.y >= 0 && p.x < l.w && p.y < l.h; }
export function tileAt(l: Level, p: Vec2): Tile | undefined { return inBounds(l, p) ? l.tiles[p.y * l.w + p.x] : undefined; }
export function setTile(l: Level, p: Vec2, kind: TileKind) { const t = tileAt(l, p); if (t) t.kind = kind; }

export function unitAt(l: Level, p: Vec2): Unit | undefined {
  for (const u of l.units) if (u.alive && u.pos.x === p.x && u.pos.y === p.y) return u;
  return undefined;
}
export function unitById(l: Level, id: string): Unit | undefined { return l.units.find(u => u.id === id); }
export function living(l: Level, faction?: Unit['faction']): Unit[] {
  return l.units.filter(u => u.alive && (!faction || u.faction === faction));
}

/** Does this prop block movement? */
export function propBlocks(p: Prop | undefined): boolean {
  if (!p) return false;
  switch (p.kind) {
    case 'door': return !p.open;
    case 'pillar': return !p.broken;
    case 'brazier': return !p.broken;
    case 'barrel': return !p.broken;
    case 'chest': return true;
    case 'lamp': return true;
    case 'niche': return true;
    case 'rubble': return true;
    default: return false;
  }
}
/** Does this prop block line of sight? */
export function propBlocksLos(p: Prop | undefined): boolean {
  if (!p) return false;
  return (p.kind === 'door' && !p.open) || (p.kind === 'pillar' && !p.broken);
}

/** Can a unit stand on this tile (ignoring units)? */
export function walkable(l: Level, p: Vec2, u?: Unit): boolean {
  const t = tileAt(l, p);
  if (!t) return false;
  if (t.kind === 'wall' || t.kind === 'void') return false;
  if (t.kind === 'chasm' && !(u && u.def.flags?.includes('flying'))) return false;
  if (propBlocks(t.prop)) return false;
  return true;
}
/** Movement cost to ENTER a tile. */
export function moveCost(l: Level, p: Vec2, u?: Unit): number {
  const t = tileAt(l, p)!;
  if (t.kind === 'water' && !(u && (u.def.flags?.includes('aquatic') || u.def.flags?.includes('flying')))) return 2;
  return 1;
}
export function blocksLos(l: Level, p: Vec2): boolean {
  const t = tileAt(l, p);
  if (!t) return true;
  if (t.kind === 'wall' || t.kind === 'void') return true;
  if (t.smoke > 0) return true;
  return propBlocksLos(t.prop);
}
/** Is the tile passable for a push/slide (not wall/prop/unit)? */
export function slideable(l: Level, p: Vec2): boolean {
  const t = tileAt(l, p);
  if (!t) return false;
  if (t.kind === 'wall' || t.kind === 'void') return false;
  if (propBlocks(t.prop)) return false;
  if (unitAt(l, p)) return false;
  return true;
}

export function neighbours8(l: Level, p: Vec2): Vec2[] {
  const out: Vec2[] = [];
  for (const d of DIRS8) { const q = { x: p.x + d.x, y: p.y + d.y }; if (inBounds(l, q)) out.push(q); }
  return out;
}

/** Flood fill of connected tiles of a kind (used for water conduction and oil spread). */
export function connected(l: Level, start: Vec2, pred: (t: Tile, p: Vec2) => boolean, diagonal = false): Vec2[] {
  const out: Vec2[] = []; const seen = new Set<string>(); const stack = [start];
  const dirs = diagonal ? DIRS8 : DIRS8.filter(d => d.x === 0 || d.y === 0);
  while (stack.length) {
    const p = stack.pop()!; const k = p.x + ',' + p.y;
    if (seen.has(k)) continue; seen.add(k);
    const t = tileAt(l, p); if (!t || !pred(t, p)) continue;
    out.push(p);
    for (const d of dirs) stack.push({ x: p.x + d.x, y: p.y + d.y });
  }
  return out;
}

export function roomAt(l: Level, p: Vec2) { const t = tileAt(l, p); return t && t.room >= 0 ? l.rooms[t.room] : undefined; }
