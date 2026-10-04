import type { Level, Vec2 } from './types';
import { blocksLos, inBounds, tileAt } from './grid';

/** Bresenham line from a to b inclusive. */
export function line(a: Vec2, b: Vec2): Vec2[] {
  const pts: Vec2[] = [];
  let x0 = a.x, y0 = a.y; const x1 = b.x, y1 = b.y;
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    pts.push({ x: x0, y: y0 });
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
  return pts;
}

/** Line of sight: no blocking tile strictly between a and b. */
export function hasLos(l: Level, a: Vec2, b: Vec2): boolean {
  const pts = line(a, b);
  for (let i = 1; i < pts.length - 1; i++) if (blocksLos(l, pts[i])) return false;
  return true;
}

/** Tiles along a direction from origin (exclusive) up to range, stopping after a blocking tile. */
export function ray(l: Level, origin: Vec2, dir: Vec2, range: number): Vec2[] {
  const out: Vec2[] = [];
  let p = { ...origin };
  for (let i = 0; i < range; i++) {
    p = { x: p.x + dir.x, y: p.y + dir.y };
    if (!inBounds(l, p)) break;
    out.push(p);
    if (blocksLos(l, p)) break;
  }
  return out;
}

/** Recursive shadowcasting FOV (8 octants). Returns set of visible tile keys within radius. */
export function fov(l: Level, origin: Vec2, radius: number): Set<string> {
  const vis = new Set<string>();
  vis.add(origin.x + ',' + origin.y);
  const mult = [
    [1, 0, 0, -1, -1, 0, 0, 1],
    [0, 1, -1, 0, 0, -1, 1, 0],
    [0, 1, 1, 0, 0, -1, -1, 0],
    [1, 0, 0, 1, -1, 0, 0, -1],
  ];
  const blocked = (x: number, y: number) => !inBounds(l, { x, y }) || blocksLos(l, { x, y });
  const cast = (row: number, startSlope: number, endSlope: number, xx: number, xy: number, yx: number, yy: number) => {
    if (startSlope < endSlope) return;
    let nextStart = startSlope;
    for (let i = row; i <= radius; i++) {
      let blockedPrev = false;
      for (let dx = -i, dy = -i; dx <= 0; dx++) {
        const lSlope = (dx - 0.5) / (dy + 0.5), rSlope = (dx + 0.5) / (dy - 0.5);
        if (startSlope < rSlope) continue; else if (endSlope > lSlope) break;
        const ax = origin.x + dx * xx + dy * xy, ay = origin.y + dx * yx + dy * yy;
        if (dx * dx + dy * dy <= radius * radius + radius && inBounds(l, { x: ax, y: ay })) vis.add(ax + ',' + ay);
        if (blockedPrev) {
          if (blocked(ax, ay)) { nextStart = rSlope; continue; } else { blockedPrev = false; startSlope = nextStart; }
        } else if (blocked(ax, ay) && i < radius) { blockedPrev = true; cast(i + 1, startSlope, lSlope, xx, xy, yx, yy); nextStart = rSlope; }
      }
      if (blockedPrev) break;
    }
  };
  for (let oct = 0; oct < 8; oct++) cast(1, 1.0, 0.0, mult[0][oct], mult[1][oct], mult[2][oct], mult[3][oct]);
  return vis;
}

/** Recompute visibility/explored flags for the level from the party's positions and lantern radius. */
export function updateVisibility(l: Level, viewers: Vec2[], radius: number): void {
  for (const t of l.tiles) t.visible = false;
  const all = new Set<string>();
  for (const v of viewers) for (const k of fov(l, v, radius)) all.add(k);
  // Lit tiles (lamps, braziers) are visible from far away if there is line of sight from any viewer.
  for (let y = 0; y < l.h; y++) for (let x = 0; x < l.w; x++) {
    const t = l.tiles[y * l.w + x];
    if (!t.lit && t.fire === 0) continue;
    for (const v of viewers) if (Math.max(Math.abs(v.x - x), Math.abs(v.y - y)) <= radius * 2 && hasLos(l, v, { x, y })) { all.add(x + ',' + y); break; }
  }
  for (const k of all) {
    const [x, y] = k.split(',').map(Number);
    const t = tileAt(l, { x, y }); if (!t) continue;
    t.visible = true; t.explored = true;
  }
}
