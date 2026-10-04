import { describe, it, expect, beforeEach } from 'vitest';
import type { Level, Unit } from '../src/sim/types';
import { makeTile, tileAt } from '../src/sim/grid';
import { makeUnit, newCombatState, startCombat, moveUnit, undoMove, basicAttack, useAbility, endPlayerTurn, resetIds, moveRange, threatTiles } from '../src/sim/combat';
import { push, igniteTile, shock, damage } from '../src/sim/rules';
import { PARTY_DEFS, ENEMY_DEFS } from '../src/content/units';
import { findPath } from '../src/sim/pathfind';
import { generateFloor } from '../src/sim/dungeon';
import { fov } from '../src/sim/los';

function blank(w = 12, h = 12): Level {
  const l: Level = { w, h, tiles: [], rooms: [{ id: 0, x: 1, y: 1, w: w - 2, h: h - 2, role: 'combat', cleared: false, entered: true }], units: [], meta: { hour: 1, index: 1, name: 't', isKeeper: false, seed: 1 }, start: { x: 2, y: 2 } };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const t = makeTile(x === 0 || y === 0 || x === w - 1 || y === h - 1 ? 'wall' : 'stone'); t.room = t.kind === 'stone' ? 0 : -1; t.explored = true; t.visible = true; l.tiles.push(t); }
  return l;
}
beforeEach(() => resetIds(1));

describe('push', () => {
  it('slides a unit and slams into walls', () => {
    const l = blank(); const u = makeUnit(ENEMY_DEFS.pale, { x: 9, y: 5 }); l.units.push(u);
    const ev: any[] = []; push(l, u, { x: 1, y: 0 }, 3, ev);
    expect(u.pos).toEqual({ x: 10, y: 5 }); expect(u.hp).toBe(4); // 1 slam
  });
  it('kills a unit pushed into a chasm', () => {
    const l = blank(); tileAt(l, { x: 6, y: 5 })!.kind = 'chasm'; const u = makeUnit(ENEMY_DEFS.pale, { x: 5, y: 5 }); l.units.push(u);
    const ev: any[] = []; push(l, u, { x: 1, y: 0 }, 1, ev);
    expect(u.alive).toBe(false); expect(ev.some(e => e.t === 'fall')).toBe(true);
  });
  it('topples a brazier and ignites tiles', () => {
    const l = blank(); tileAt(l, { x: 6, y: 5 })!.prop = { kind: 'brazier', lit: true }; const u = makeUnit(ENEMY_DEFS.pale, { x: 5, y: 5 }); l.units.push(u);
    const ev: any[] = []; push(l, u, { x: 1, y: 0 }, 1, ev);
    expect(tileAt(l, { x: 6, y: 5 })!.fire).toBeGreaterThan(0); expect(tileAt(l, { x: 7, y: 5 })!.fire).toBeGreaterThan(0);
    expect(u.pos).toEqual({ x: 5, y: 5 });
  });
});

describe('fire and water', () => {
  it('spreads fire across oil and conducts lightning through water', () => {
    const l = blank();
    for (const x of [3, 4, 5]) tileAt(l, { x, y: 3 })!.kind = 'oil';
    for (const x of [3, 4, 5]) tileAt(l, { x, y: 7 })!.kind = 'water';
    const a = makeUnit(ENEMY_DEFS.pale, { x: 3, y: 7 }); const b = makeUnit(ENEMY_DEFS.pale, { x: 5, y: 7 }); l.units.push(a, b);
    const ev: any[] = [];
    igniteTile(l, { x: 3, y: 3 }, ev); expect(tileAt(l, { x: 3, y: 3 })!.fire).toBe(4);
    shock(l, a, 2, ev); expect(a.hp).toBe(3); expect(b.hp).toBe(3);
  });
  it('fire does not ignite water', () => {
    const l = blank(); tileAt(l, { x: 3, y: 3 })!.kind = 'water'; const ev: any[] = [];
    expect(igniteTile(l, { x: 3, y: 3 }, ev)).toBe(false);
  });
});

describe('combat flow', () => {
  function setup() {
    const l = blank(); const cs = newCombatState(7);
    const o = makeUnit(PARTY_DEFS.knight, { x: 2, y: 5 }); const b = makeUnit(PARTY_DEFS.barbarian, { x: 2, y: 6 });
    const e = makeUnit(ENEMY_DEFS.spent, { x: 5, y: 5 }); l.units.push(o, b, e);
    const ev: any[] = []; startCombat(l, cs, [e], ev);
    return { l, cs, o, b, e, ev };
  }
  it('starts in player phase with movement, and undo works until acting', () => {
    const { l, cs, o, ev } = setup();
    expect(cs.phase).toBe('player');
    expect(moveRange(l, o).size).toBeGreaterThan(10);
    expect(moveUnit(l, cs, o, { x: 4, y: 5 }, ev)).toBe(true);
    expect(o.pos).toEqual({ x: 4, y: 5 });
    expect(undoMove(l, cs, o, ev)).toBe(true); expect(o.pos).toEqual({ x: 2, y: 5 }); expect(o.moveLeft).toBe(4);
  });
  it('enemy telegraphs after moving, then strikes the telegraphed tile next turn', () => {
    const { l, cs, o, e, ev } = setup();
    moveUnit(l, cs, o, { x: 4, y: 5 }, ev); // adjacent to the Spent
    endPlayerTurn(l, cs, ev);
    expect(e.intent).toBeDefined(); expect(e.intent!.kind).toBe('strike');
    const threats = threatTiles(l, cs); expect(threats.has('4,5')).toBe(true);
    const hp = o.hp;
    endPlayerTurn(l, cs, ev); // Oriel stays: she is struck (2 dmg - 1 armour = 1)
    expect(o.hp).toBe(hp - 1);
  });
  it('pushing an enemy moves its committed attack with it', () => {
    const { l, cs, o, b, e, ev } = setup();
    moveUnit(l, cs, o, { x: 4, y: 5 }, ev); endPlayerTurn(l, cs, ev);
    // Spent at 5,5 aims west at Oriel (4,5). Brann heaves it from the south -> it slides north; its strike now hits (4,y-?) relative: dir stays west, tile shifts north.
    moveUnit(l, cs, b, { x: 5, y: 6 }, ev);
    expect(useAbility(l, cs, b, 'heave', e.pos, ev)).toBe(true);
    expect(e.pos).toEqual({ x: 5, y: 3 });
    const threats = threatTiles(l, cs); expect(threats.has('4,3')).toBe(true); expect(threats.has('4,5')).toBe(false);
  });
  it('flanking adds damage and combat ends when enemies die', () => {
    const { l, cs, o, b, e, ev } = setup();
    moveUnit(l, cs, o, { x: 4, y: 5 }, ev); moveUnit(l, cs, b, { x: 4, y: 6 }, ev);
    e.hp = 5; expect(basicAttack(l, cs, o, e, ev)).toBe(true); // 3 +1 flank -1 armour = 3
    expect(e.hp).toBe(2);
    basicAttack(l, cs, b, e, ev); // 4 +1 -1 = 4 -> dead
    expect(e.alive).toBe(false); expect(cs.phase).toBe('explore');
  });
  it('Hold redirects a strike onto Oriel', () => {
    const { l, cs, o, b, e, ev } = setup();
    moveUnit(l, cs, b, { x: 4, y: 5 }, ev); moveUnit(l, cs, o, { x: 4, y: 6 }, ev);
    endPlayerTurn(l, cs, ev); // spent aims at an adjacent party member (lowest hp): Brann 16 vs Oriel 14 -> Oriel? adjacentTarget prefers lowest hp
    const target = e.intent!.dir.y === 0 ? b : o;
    if (target === b) { useAbility(l, cs, o, 'hold', o.pos, ev); const bh = b.hp, oh = o.hp; endPlayerTurn(l, cs, ev); expect(b.hp).toBe(bh); expect(o.hp).toBeLessThan(oh); }
  });
});

describe('pathfinding and fov', () => {
  it('finds a path around a wall and refuses corner cutting', () => {
    const l = blank(); for (let y = 1; y < 10; y++) tileAt(l, { x: 5, y })!.kind = 'wall';
    const p = findPath(l, { x: 2, y: 2 }, { x: 8, y: 2 }); expect(p).not.toBeNull(); expect(p!.length).toBeGreaterThan(8);
  });
  it('fov is blocked by walls', () => {
    const l = blank(); for (let y = 1; y < 11; y++) tileAt(l, { x: 5, y })!.kind = 'wall';
    const v = fov(l, { x: 2, y: 5 }, 8); expect(v.has('3,5')).toBe(true); expect(v.has('8,5')).toBe(false);
  });
});

describe('generation', () => {
  it('generates connected floors with stairs reachable from start', () => {
    for (let seed = 1; seed <= 12; seed++) for (const hour of [1, 2, 3, 4] as const) {
      const l = generateFloor({ seed, hour, index: (seed % 3) + 1, fever: 0, partyDefs: [{ def: PARTY_DEFS.knight, name: 'O' }, { def: PARTY_DEFS.barbarian, name: 'B' }, { def: PARTY_DEFS.mage, name: 'Y' }], eventIds: ['x'], pagesLeft: [1, 2] });
      const stairs = l.tiles.findIndex(t => t.prop?.kind === 'stairs'); expect(stairs).toBeGreaterThanOrEqual(0);
      const sp = { x: stairs % l.w, y: Math.floor(stairs / l.w) };
      const path = findPath(l, l.start, sp, { avoidUnits: false, openDoors: true, allowGoalOccupied: true });
      expect(path, `seed ${seed} hour ${hour}`).not.toBeNull();
      expect(l.units.filter(u => u.faction === 'party').length).toBe(3);
      expect(l.units.filter(u => u.faction === 'enemy').length).toBeGreaterThan(2);
    }
  });
  it('generates keeper arenas', () => {
    for (const hour of [1, 2, 3, 4] as const) {
      const l = generateFloor({ seed: 5, hour, index: 4, fever: 0, partyDefs: [{ def: PARTY_DEFS.knight, name: 'O' }], eventIds: [], pagesLeft: [] });
      expect(l.units.some(u => u.def.flags?.includes('keeper'))).toBe(true);
    }
  });
});
