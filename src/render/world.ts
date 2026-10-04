/** Builds the 3D level from the sim Level: autotiled walls, floors, surfaces, props, decor, fog of war, torches, fire and smoke. */
import * as THREE from 'three';
import type { Level, Vec2, Tile } from '../sim/types';
import { tileAt } from '../sim/grid';
import { Assets, TILE } from './assets';
import { Rng } from '../sim/rng';

const N = 1, E = 2, S = 4, W = 8;
const BASE: Record<string, number> = { wall: W | E, wall_corner: W | S, wall_Tsplit: W | E | S, wall_crossing: N | E | S | W, wall_endcap: E, wall_pillar: 0 };
const rot90 = (m: number) => ((m & E) ? N : 0) | ((m & N) ? W : 0) | ((m & W) ? S : 0) | ((m & S) ? E : 0);
const WALL_TABLE: { piece: string; rotY: number }[] = new Array(16);
for (const [piece, base] of Object.entries(BASE)) { let m = base; for (let k = 0; k < 4; k++) { if (WALL_TABLE[m] === undefined) WALL_TABLE[m] = { piece, rotY: k * Math.PI / 2 }; m = rot90(m); } }

interface Inst { pos: Vec2; matrix: THREE.Matrix4; kind: 'floor' | 'wall' | 'prop' | 'surface' }
class Batch {
  insts: Inst[] = [];
  mesh?: THREE.InstancedMesh;
  constructor(public geometry: THREE.BufferGeometry, public material: THREE.Material, public castShadow = true) { }
  add(pos: Vec2, matrix: THREE.Matrix4, kind: Inst['kind']) { this.insts.push({ pos, matrix, kind }); }
  build(parent: THREE.Object3D) {
    if (!this.insts.length) return;
    const m = new THREE.InstancedMesh(this.geometry, this.material, this.insts.length);
    m.castShadow = this.castShadow; m.receiveShadow = true; m.frustumCulled = false;
    this.insts.forEach((it, i) => { m.setMatrixAt(i, it.matrix); m.setColorAt(i, new THREE.Color(1, 1, 1)); });
    m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
    this.mesh = m; parent.add(m);
  }
}

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const DIM = new THREE.Color(0.22, 0.22, 0.26);
const LIT = new THREE.Color(1, 1, 1);

export interface LightSpot { pos: Vec2; color: number; intensity: number; flicker: boolean; y: number }

export class World {
  group = new THREE.Group();
  private batches = new Map<string, Batch>();
  private propGroup = new THREE.Group();     // non-instanced props (doors, lights-bearing, special)
  private propByKey = new Map<string, THREE.Object3D>();
  private fireSprites = new Map<string, THREE.Sprite>();
  private smokeMeshes = new Map<string, THREE.Mesh>();
  private fireTex: THREE.Texture;
  private surfaceMats: Record<string, THREE.Material>;
  private lights: THREE.PointLight[] = [];
  private lightSpots: LightSpot[] = [];
  private time = 0;
  private rng: Rng;
  private pageMat: THREE.MeshStandardMaterial;
  private emberMat: THREE.MeshStandardMaterial;
  private bitMats = new Map<string, THREE.Material>();

  constructor(private assets: Assets, public level: Level, private scene: THREE.Scene) {
    this.rng = new Rng(level.meta.seed * 7 + 3);
    this.fireTex = makeFlameTexture();
    this.surfaceMats = {
      water: new THREE.MeshStandardMaterial({ color: 0x2f6a9a, emissive: 0x0a2a44, emissiveIntensity: 0.6, transparent: true, opacity: 0.72, roughness: 0.12, metalness: 0.2, depthWrite: false }),
      oil: new THREE.MeshStandardMaterial({ color: 0x120e0a, roughness: 0.08, metalness: 0.55, transparent: true, opacity: 0.92, depthWrite: false }),
      ice: new THREE.MeshStandardMaterial({ color: 0x9fd0e8, roughness: 0.1, metalness: 0.0, transparent: true, opacity: 0.85, depthWrite: false }),
      ventglow: new THREE.MeshStandardMaterial({ color: 0x401000, emissive: 0xff5a10, emissiveIntensity: 1.5, roughness: 0.7 }),
      chasm: new THREE.MeshBasicMaterial({ color: 0x000000 }),
    };
    this.pageMat = new THREE.MeshStandardMaterial({ color: 0xe8dcc4, emissive: 0xffe0a0, emissiveIntensity: 0.6, side: THREE.DoubleSide });
    this.emberMat = new THREE.MeshStandardMaterial({ color: 0xff6a20, emissive: 0xff7a2a, emissiveIntensity: 2.2, roughness: 0.6 });
    for (let i = 0; i < 12; i++) { const l = new THREE.PointLight(0xff9a3a, 0, 22, 2); l.castShadow = false; this.group.add(l); this.lights.push(l); }
    this.group.add(this.propGroup);
    scene.add(this.group);
    this.build();
  }

  private piece(n: string) { return this.assets.pieces.get(n); }
  private batch(name: string, geo: THREE.BufferGeometry, mat: THREE.Material, shadow = true) {
    let b = this.batches.get(name); if (!b) { b = new Batch(geo, mat, shadow); this.batches.set(name, b); } return b;
  }
  private isWallCell(x: number, y: number) { const t = tileAt(this.level, { x, y }); return !!t && (t.kind === 'wall' || t.kind === 'void' || (t.prop?.kind === 'door')); }
  private isFloorCell(x: number, y: number) { const t = tileAt(this.level, { x, y }); return !!t && t.kind !== 'wall' && t.kind !== 'void'; }

  /** A wall cell is drawn only if it touches a floor cell (8-neighbourhood). */
  private isShell(x: number, y: number) {
    const t = tileAt(this.level, { x, y }); if (!t || t.kind !== 'wall') return false;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && this.isFloorCell(x + dx, y + dy)) return true;
    return false;
  }

  private build() {
    const l = this.level; const mat = this.assets.dungeonMaterial;
    const m4 = () => new THREE.Matrix4();
    const place = (pos: Vec2, rotY = 0, y = 0, scale = 1, sy = scale) => m4().compose(new THREE.Vector3(pos.x * TILE, y, pos.y * TILE), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY), new THREE.Vector3(scale, sy, scale));
    const hour = l.meta.hour;

    for (let y = 0; y < l.h; y++) for (let x = 0; x < l.w; x++) {
      const t = l.tiles[y * l.w + x]; const p = { x, y };
      if (t.kind === 'wall') {
        if (!this.isShell(x, y)) continue;
        const shellWall = (xx: number, yy: number) => (this.isShell(xx, yy) || tileAt(l, { x: xx, y: yy })?.prop?.kind === 'door');
        const mask = (shellWall(x, y - 1) ? N : 0) | (shellWall(x + 1, y) ? E : 0) | (shellWall(x, y + 1) ? S : 0) | (shellWall(x - 1, y) ? W : 0);
        let { piece, rotY } = WALL_TABLE[mask];
        // straight-wall variants for texture
        if (piece === 'wall') { const r = this.rng.next(); piece = r < 0.08 ? 'wall_cracked' : r < 0.13 ? 'wall_broken' : r < 0.17 && hour === 2 ? 'wall_shelves' : r < 0.2 && hour !== 1 ? 'wall_arched' : 'wall'; if (!this.piece(piece)) piece = 'wall'; }
        // camera-facing walls (floor only on +x/+z side) are lowered so they do not hide the room
        const front = (this.isFloorCell(x + 1, y) || this.isFloorCell(x, y + 1) || this.isFloorCell(x + 1, y + 1)) && !(this.isFloorCell(x - 1, y) || this.isFloorCell(x, y - 1) || this.isFloorCell(x - 1, y - 1));
        const pc = this.piece(piece); if (!pc) continue;
        this.batch(piece + (front ? '_low' : ''), pc.geometry, mat).add(p, place(p, rotY, 0, 1, front ? 0.28 : 1), 'wall');
        continue;
      }
      if (t.kind === 'void') continue;
      // floors
      if (t.kind === 'chasm') { this.batch('chasm', new THREE.PlaneGeometry(TILE, TILE).rotateX(-Math.PI / 2), this.surfaceMats.chasm, false).add(p, place(p, 0, -6), 'floor'); continue; }
      if (t.prop?.kind === 'stairs') { const st = this.piece('stairs_wide') ?? this.piece('stairs'); if (st) { const rot = this.stairRotation(p); this.batch('stairs', st.geometry, mat).add(p, place(p, rot, -st.size.y + 0.05), 'prop'); } continue; }
      let floorPiece = 'floor_tile_large';
      const r = this.rng.next();
      if (hour === 1) floorPiece = r < 0.1 ? 'floor_tile_large_rocks' : r < 0.18 ? 'floor_dirt_large' : 'floor_tile_large';
      else if (hour === 2) floorPiece = r < 0.12 ? 'floor_tile_large_rocks' : r < 0.2 ? 'floor_dirt_large_rocky' : 'floor_tile_large';
      else if (hour === 3) floorPiece = r < 0.15 ? 'floor_tile_large_rocks' : 'floor_tile_large';
      else floorPiece = r < 0.2 ? 'floor_dirt_large' : 'floor_tile_large';
      if (!this.piece(floorPiece)) floorPiece = 'floor_tile_large';
      const fy = t.kind === 'water' ? -0.7 : 0;
      this.batch(floorPiece, this.piece(floorPiece)!.geometry, mat, false).add(p, place(p, this.rng.int(0, 3) * Math.PI / 2, fy), 'floor');
      if (t.kind === 'water' || t.kind === 'oil' || t.kind === 'ice') {
        const geo = new THREE.PlaneGeometry(TILE, TILE).rotateX(-Math.PI / 2);
        this.batch('surf_' + t.kind, geo, this.surfaceMats[t.kind], false).add(p, place(p, 0, t.kind === 'water' ? -0.15 : 0.09), 'surface');
      }
      if (t.kind === 'vent') { const geo = new THREE.PlaneGeometry(TILE * 0.6, TILE * 0.6).rotateX(-Math.PI / 2); this.batch('vent', geo, this.surfaceMats.ventglow, false).add(p, place(p, 0, 0.12), 'surface'); }
      // decor: small dressing on floor tiles next to walls
      if (t.kind === 'stone' && !t.prop && this.rng.chance(0.07)) this.addDecor(p);
    }
    for (const b of this.batches.values()) b.build(this.group);
    this.rebuildProps();
    this.updateVisibility();
  }

  private stairRotation(p: Vec2): number {
    // face the stairs toward the open side of the room (away from the nearest wall)
    const l = this.level; const dirs = [{ d: { x: 1, y: 0 }, r: Math.PI / 2 }, { d: { x: -1, y: 0 }, r: -Math.PI / 2 }, { d: { x: 0, y: 1 }, r: 0 }, { d: { x: 0, y: -1 }, r: Math.PI }];
    for (const { d, r } of dirs) { const t = tileAt(l, { x: p.x + d.x, y: p.y + d.y }); if (!t || t.kind === 'wall') return r; }
    return 0;
  }

  private addDecor(p: Vec2) {
    const hour = this.level.meta.hour;
    const choices = hour === 1 ? ['bottle_A_green', 'box_small', 'bone_A', 'rubble_half', 'candle_lit', 'trunk_small_A'] : hour === 2 ? ['skull', 'bone_A', 'bone_B', 'ribcage', 'candle_lit', 'candle_melted', 'skull_candle'] : hour === 3 ? ['barrel_small', 'crates_stacked', 'keg', 'candle_lit', 'rubble_half', 'box_small'] : ['candle_lit', 'candle_triple', 'bone_A', 'skull_candle'];
    const n = this.rng.pick(choices);
    const off = new THREE.Vector3((this.rng.next() - 0.5) * 2.2, 0, (this.rng.next() - 0.5) * 2.2);
    const pos = new THREE.Vector3(p.x * TILE, 0.05, p.y * TILE).add(off);
    const o = this.makeObj(n); if (!o) return;
    o.position.copy(pos); o.rotation.y = this.rng.next() * Math.PI * 2; o.userData.decor = true; o.userData.cell = p;
    this.propGroup.add(o);
    if (n === 'candle_lit' || n === 'skull_candle' || n === 'candle_triple') this.lightSpots.push({ pos: p, color: 0xffa040, intensity: 6, flicker: true, y: 0.6 });
  }

  private makeObj(n: string): THREE.Object3D | undefined {
    const pc = this.piece(n);
    if (pc) { const m = new THREE.Mesh(pc.geometry, this.assets.dungeonMaterial); m.castShadow = true; m.receiveShadow = true; return m; }
    const bit = this.assets.bits.get(n);
    if (bit) { const c = bit.clone(true); return c; }
    return undefined;
  }

  /** Rebuild the non-instanced prop layer from the level's props (cheap; a few dozen objects). */
  rebuildProps() {
    for (const o of [...this.propGroup.children]) if (!o.userData.decor) this.propGroup.remove(o);
    this.propByKey.clear();
    this.lightSpots = this.lightSpots.filter(s => s.flicker && s.intensity === 6); // keep decor candles
    const l = this.level;
    for (let y = 0; y < l.h; y++) for (let x = 0; x < l.w; x++) {
      const t = l.tiles[y * l.w + x]; if (!t.prop) continue;
      const p = { x, y }; const o = this.makeProp(t, p); if (!o) continue;
      o.position.set(x * TILE, 0, y * TILE); o.userData.cell = p; o.userData.prop = t.prop.kind;
      this.propGroup.add(o); this.propByKey.set(x + ',' + y, o);
    }
    this.updateVisibility();
  }

  private makeProp(t: Tile, p: Vec2): THREE.Object3D | undefined {
    const pr = t.prop!; const l = this.level;
    switch (pr.kind) {
      case 'door': {
        const pc = this.piece('wall_doorway'); if (!pc) return undefined;
        const g = new THREE.Group();
        const wallsNS = this.isWallCell(p.x, p.y - 1) && this.isWallCell(p.x, p.y + 1);
        const frame = pc.object.clone(true);
        frame.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { m.material = this.assets.dungeonMaterial; m.castShadow = true; m.receiveShadow = true; } });
        const door = frame.getObjectByName('wall_doorway_door');
        if (door && pr.open) { door.rotation.y = -Math.PI / 2 * 0.95; }
        g.rotation.y = wallsNS ? Math.PI / 2 : 0;
        g.add(frame);
        return g;
      }
      case 'brazier': {
        const o = this.makeObj(pr.broken ? 'torch' : 'torch_lit') ?? this.makeObj('torch_lit'); if (!o) return undefined;
        if (pr.broken) { o.rotation.z = 1.2; o.position.y = 0.3; } else { this.lightSpots.push({ pos: p, color: 0xff9a3a, intensity: 40, flicker: true, y: 3.2 }); }
        return o;
      }
      case 'lamp': {
        const o = this.makeObj('post_lantern') ?? this.makeObj('lantern_standing') ?? this.makeObj('torch_lit'); if (!o) return undefined;
        this.lightSpots.push({ pos: p, color: 0xffc080, intensity: 45, flicker: false, y: 3.5 });
        return o;
      }
      case 'pillar': return this.makeObj(pr.broken ? 'rubble_large' : (l.meta.hour === 2 ? 'pillar_decorated' : 'pillar'));
      case 'rubble': return this.makeObj('rubble_large');
      case 'barrel': return pr.broken ? undefined : this.makeObj('barrel_large');
      case 'chest': { const o = this.makeObj(pr.used ? 'chest' : 'chest_gold'); if (o && !pr.used) this.lightSpots.push({ pos: p, color: 0xffd080, intensity: 10, flicker: false, y: 1.2 }); return o; }
      case 'shrine': { const o = this.makeObj('shrine_candles') ?? this.makeObj('candle_triple'); this.lightSpots.push({ pos: p, color: 0xffd0a0, intensity: 24, flicker: true, y: 2 }); return o; }
      case 'event': { const g = new THREE.Group(); const a = this.makeObj('candle_triple'); const b = this.makeObj('plaque_candles'); if (a) { a.position.set(-0.8, 0, 0.6); g.add(a); } if (b) { b.position.set(0.6, 0, -0.4); g.add(b); } if (!a && !b) return this.makeObj('table_small'); this.lightSpots.push({ pos: p, color: 0xffd0a0, intensity: 14, flicker: true, y: 1.2 }); return g; }
      case 'ember': { if (pr.used) return undefined; const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.75, 0), this.emberMat); m.position.y = 0.6; m.rotation.set(0.4, 0.7, 0.2); m.castShadow = true; this.lightSpots.push({ pos: p, color: 0xff7a2a, intensity: 18, flicker: true, y: 1 }); return m; }
      case 'page': { if (pr.used) return undefined; const m = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.5), this.pageMat); m.rotation.x = -Math.PI / 2 + 0.15; m.rotation.z = 0.4; m.position.y = 0.12; this.lightSpots.push({ pos: p, color: 0xfff0c0, intensity: 8, flicker: false, y: 1 }); return m; }
      case 'niche': { const o = this.makeObj(l.meta.hour === 4 ? 'coffin' : 'shelf_small_candles') ?? this.makeObj('shelf_small_candles'); if (o) { this.lightSpots.push({ pos: p, color: 0xffb070, intensity: 10, flicker: true, y: 1.5 }); } return o; }
      case 'stairs': return undefined; // drawn in the instanced pass
      default: return undefined;
    }
  }

  /** Apply fog of war: unexplored instances collapse to zero; explored-but-unseen dim. */
  updateVisibility() {
    const l = this.level;
    for (const b of this.batches.values()) {
      const m = b.mesh; if (!m) continue;
      b.insts.forEach((it, i) => {
        const t = tileAt(l, it.pos)!;
        // walls take the visibility of their most-visible floor neighbour
        let vis = t.visible, exp = t.explored;
        if (it.kind === 'wall') { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const n = tileAt(l, { x: it.pos.x + dx, y: it.pos.y + dy }); if (n && n.kind !== 'wall' && n.kind !== 'void') { vis = vis || n.visible; exp = exp || n.explored; } } }
        m.setMatrixAt(i, exp ? it.matrix : ZERO);
        m.setColorAt(i, vis ? LIT : DIM);
      });
      m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    for (const o of this.propGroup.children) {
      const c = o.userData.cell as Vec2 | undefined; if (!c) continue;
      const t = tileAt(l, c)!;
      let vis = t.visible, exp = t.explored;
      if (o.userData.prop === 'door') { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const n = tileAt(l, { x: c.x + dx, y: c.y + dy }); if (n) { vis = vis || n.visible; exp = exp || n.explored; } } }
      o.visible = exp;
      o.traverse(ch => { const m = ch as THREE.Mesh; if (m.isMesh) { if (!m.userData.dimmable) { m.userData.dimmable = true; m.material = (m.material as THREE.Material).clone(); } const mat = m.material as THREE.MeshStandardMaterial; if (mat.color) { const base = (mat.userData.base ??= mat.color.clone()); mat.color.copy(base).multiplyScalar(vis ? 1 : 0.3); } } });
    }
  }

  setDoorOpen(p: Vec2, open: boolean) {
    const o = this.propByKey.get(p.x + ',' + p.y); if (!o) return;
    const door = o.getObjectByName('wall_doorway_door'); if (door) door.rotation.y = open ? -Math.PI / 2 * 0.95 : 0;
  }

  setFire(p: Vec2, on: boolean) {
    const k = p.x + ',' + p.y;
    if (on && !this.fireSprites.has(k)) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.fireTex, color: 0xff9a40, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      s.position.set(p.x * TILE, 1.4, p.y * TILE); s.scale.set(3.2, 3.6, 1); s.userData.seed = Math.random() * 10;
      this.group.add(s); this.fireSprites.set(k, s);
      this.lightSpots.push({ pos: p, color: 0xff7a20, intensity: 30, flicker: true, y: 1.6 });
    } else if (!on && this.fireSprites.has(k)) {
      const s = this.fireSprites.get(k)!; this.group.remove(s); this.fireSprites.delete(k);
      const i = this.lightSpots.findIndex(ls => ls.pos.x === p.x && ls.pos.y === p.y && ls.intensity === 30); if (i >= 0) this.lightSpots.splice(i, 1);
    }
  }
  setSmoke(p: Vec2, on: boolean) {
    const k = p.x + ',' + p.y;
    if (on && !this.smokeMeshes.has(k)) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(2.2, 12, 10), new THREE.MeshStandardMaterial({ color: 0x55555f, transparent: true, opacity: 0.6, roughness: 1, depthWrite: false }));
      m.position.set(p.x * TILE, 1.6, p.y * TILE); this.group.add(m); this.smokeMeshes.set(k, m);
    } else if (!on && this.smokeMeshes.has(k)) { this.group.remove(this.smokeMeshes.get(k)!); this.smokeMeshes.delete(k); }
  }

  /** Rebuild floor surface batches after a tile kind change (oil spill / burnt out). Simple approach: rebuild all instanced batches. */
  rebuildAll() {
    for (const b of this.batches.values()) if (b.mesh) this.group.remove(b.mesh);
    this.batches.clear();
    for (const o of [...this.propGroup.children]) this.propGroup.remove(o);
    this.lightSpots = [];
    this.rng = new Rng(this.level.meta.seed * 7 + 3);
    this.build();
  }

  /** Assign the pooled point lights to the nearest lit spots around a focus point; flicker. */
  update(dt: number, focus: THREE.Vector3) {
    this.time += dt;
    const l = this.level;
    const spots = this.lightSpots.filter(s => { const t = tileAt(l, s.pos); return t && t.visible; })
      .map(s => ({ s, d: Math.hypot(s.pos.x * TILE - focus.x, s.pos.y * TILE - focus.z) })).sort((a, b) => a.d - b.d).slice(0, this.lights.length);
    this.lights.forEach((light, i) => {
      const sp = spots[i];
      if (!sp) { light.intensity = 0; return; }
      light.position.set(sp.s.pos.x * TILE, sp.s.y, sp.s.pos.y * TILE); light.color.setHex(sp.s.color);
      const fl = sp.s.flicker ? 0.82 + 0.18 * Math.sin(this.time * 9 + sp.s.pos.x * 3.1 + sp.s.pos.y * 1.7) * Math.sin(this.time * 13.3 + sp.s.pos.y) : 1;
      light.intensity = sp.s.intensity * fl;
    });
    for (const s of this.fireSprites.values()) { const f = 1 + 0.12 * Math.sin(this.time * 11 + s.userData.seed); s.scale.set(3.2 * f, 3.6 / f * 1.05, 1); (s.material as THREE.SpriteMaterial).rotation = Math.sin(this.time * 3 + s.userData.seed) * 0.15; }
    (this.surfaceMats.water as THREE.MeshStandardMaterial).opacity = 0.74 + 0.05 * Math.sin(this.time * 1.3);
  }

  dispose() { this.scene.remove(this.group); for (const b of this.batches.values()) b.mesh?.dispose(); }
}

function makeFlameTexture(): THREE.Texture {
  const c = document.createElement('canvas'); c.width = 64; c.height = 96; const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 60, 4, 32, 56, 40);
  grd.addColorStop(0, 'rgba(255,240,200,1)'); grd.addColorStop(0.3, 'rgba(255,170,60,0.9)'); grd.addColorStop(0.7, 'rgba(255,80,10,0.35)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.beginPath(); g.ellipse(32, 56, 28, 44, 0, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
