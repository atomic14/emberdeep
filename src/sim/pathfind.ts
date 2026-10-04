import type { Level, Unit, Vec2 } from './types';
import { DIRS8, key } from './types';
import { inBounds, moveCost, tileAt, unitAt, walkable } from './grid';

/** Simple binary heap keyed on f. */
class Heap<T> {
  private a: { k: number; v: T }[] = [];
  get size() { return this.a.length; }
  push(k: number, v: T) { this.a.push({ k, v }); let i = this.a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (this.a[p].k <= this.a[i].k) break; [this.a[p], this.a[i]] = [this.a[i], this.a[p]]; i = p; } }
  pop(): T | undefined {
    if (!this.a.length) return undefined; const top = this.a[0]; const last = this.a.pop()!;
    if (this.a.length) { this.a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < this.a.length && this.a[l].k < this.a[m].k) m = l; if (r < this.a.length && this.a[r].k < this.a[m].k) m = r; if (m === i) break; [this.a[m], this.a[i]] = [this.a[i], this.a[m]]; i = m; } }
    return top.v;
  }
}

export interface PathOpts {
  unit?: Unit;
  /** treat tiles with other units as blocked (default true), except the goal if allowGoalOccupied */
  avoidUnits?: boolean;
  allowGoalOccupied?: boolean;
  /** stop adjacent to goal instead of on it */
  adjacent?: boolean;
  maxCost?: number;
  /** extra cost per tile (e.g. threatened tiles) */
  penalty?: (p: Vec2) => number;
  /** ignore closed doors (e.g. unit that can open doors) */
  openDoors?: boolean;
}

function passable(l: Level, p: Vec2, o: PathOpts): boolean {
  if (walkable(l, p, o.unit)) return true;
  if (o.openDoors) { const t = tileAt(l, p); if (t && t.prop?.kind === 'door' && !t.prop.open && t.kind !== 'wall') return true; }
  return false;
}

/** Diagonal step allowed only if both orthogonal neighbours are not walls (no corner cutting). */
function cornerOk(l: Level, from: Vec2, d: Vec2): boolean {
  if (d.x === 0 || d.y === 0) return true;
  const a = tileAt(l, { x: from.x + d.x, y: from.y }); const b = tileAt(l, { x: from.x, y: from.y + d.y });
  const wall = (t: typeof a) => !t || t.kind === 'wall' || t.kind === 'void' || (t.prop && (t.prop.kind === 'door' && !t.prop.open));
  return !wall(a) && !wall(b);
}

/** A* on the grid. Returns path excluding start, including goal (or adjacent tile). */
export function findPath(l: Level, start: Vec2, goal: Vec2, o: PathOpts = {}): Vec2[] | null {
  const avoid = o.avoidUnits !== false;
  const isGoal = (p: Vec2) => o.adjacent ? (Math.max(Math.abs(p.x - goal.x), Math.abs(p.y - goal.y)) === 1) : (p.x === goal.x && p.y === goal.y);
  if (isGoal(start)) return [];
  const h = (p: Vec2) => Math.max(Math.abs(p.x - goal.x), Math.abs(p.y - goal.y));
  const g = new Map<string, number>(); const came = new Map<string, Vec2>();
  const open = new Heap<Vec2>(); g.set(key(start), 0); open.push(h(start), start);
  const closed = new Set<string>();
  while (open.size) {
    const cur = open.pop()!; const ck = key(cur);
    if (closed.has(ck)) continue; closed.add(ck);
    if (isGoal(cur)) { const path: Vec2[] = []; let p: Vec2 | undefined = cur; while (p && key(p) !== key(start)) { path.push(p); p = came.get(key(p)); } return path.reverse(); }
    const gc = g.get(ck)!;
    for (const d of DIRS8) {
      const n = { x: cur.x + d.x, y: cur.y + d.y };
      if (!inBounds(l, n) || closed.has(key(n))) continue;
      if (!cornerOk(l, cur, d)) continue;
      const goalHere = n.x === goal.x && n.y === goal.y;
      if (!passable(l, n, o)) continue;
      if (avoid) { const u = unitAt(l, n); if (u && u !== o.unit && !(goalHere && o.allowGoalOccupied)) continue; }
      const cost = gc + moveCost(l, n, o.unit) + (o.penalty ? o.penalty(n) : 0);
      if (o.maxCost !== undefined && cost > o.maxCost) continue;
      const nk = key(n);
      if (cost < (g.get(nk) ?? Infinity)) { g.set(nk, cost); came.set(nk, cur); open.push(cost + h(n), n); }
    }
  }
  return null;
}

/** Dijkstra flood: all tiles reachable within budget, with cost and parent. */
export function reachable(l: Level, start: Vec2, budget: number, o: PathOpts = {}): Map<string, { pos: Vec2; cost: number; from?: Vec2 }> {
  const out = new Map<string, { pos: Vec2; cost: number; from?: Vec2 }>();
  const open = new Heap<Vec2>(); out.set(key(start), { pos: start, cost: 0 }); open.push(0, start);
  const avoid = o.avoidUnits !== false;
  while (open.size) {
    const cur = open.pop()!; const cc = out.get(key(cur))!.cost;
    for (const d of DIRS8) {
      const n = { x: cur.x + d.x, y: cur.y + d.y };
      if (!inBounds(l, n) || !cornerOk(l, cur, d) || !passable(l, n, o)) continue;
      if (avoid) { const u = unitAt(l, n); if (u && u !== o.unit) continue; }
      const c = cc + moveCost(l, n, o.unit) + (o.penalty ? o.penalty(n) : 0);
      if (c > budget) continue;
      const k = key(n); const prev = out.get(k);
      if (!prev || c < prev.cost) { out.set(k, { pos: n, cost: c, from: cur }); open.push(c, n); }
    }
  }
  out.delete(key(start));
  return out;
}

export function pathFromReach(reach: Map<string, { pos: Vec2; cost: number; from?: Vec2 }>, goal: Vec2, start: Vec2): Vec2[] {
  const path: Vec2[] = []; let p: Vec2 | undefined = goal;
  while (p && !(p.x === start.x && p.y === start.y)) { path.push(p); p = reach.get(key(p))?.from; }
  return path.reverse();
}
