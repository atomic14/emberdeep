/** Tactical overlays: cell highlights (instanced quads), path dots, and enemy intent markers. */
import * as THREE from 'three';
import type { Vec2 } from '../sim/types';
import { TILE } from './assets';

export type CellStyle = 'reach' | 'attack' | 'threat' | 'path' | 'hover' | 'target' | 'ability' | 'danger' | 'ally' | 'footprint';
const COLORS: Record<CellStyle, { c: number; a: number; y: number }> = {
  reach: { c: 0x5aa8ff, a: 0.55, y: 0.14 },
  attack: { c: 0xff9a3a, a: 0.7, y: 0.16 },
  ability: { c: 0xffc060, a: 0.6, y: 0.16 },
  footprint: { c: 0xffe0a0, a: 0.8, y: 0.18 },
  threat: { c: 0xff3a3a, a: 0.62, y: 0.23 },
  danger: { c: 0xff3030, a: 0.3, y: 0.13 },
  path: { c: 0xe8dcc4, a: 0.7, y: 0.2 },
  hover: { c: 0xffffff, a: 0.6, y: 0.19 },
  target: { c: 0xff5030, a: 0.8, y: 0.2 },
  ally: { c: 0x7fb069, a: 0.5, y: 0.16 },
};

export class Overlay {
  group = new THREE.Group();
  private meshes = new Map<CellStyle, THREE.InstancedMesh>();
  private counts = new Map<CellStyle, number>();
  private hatch: THREE.Texture;
  private dot: THREE.Texture;
  private cell: THREE.Texture;
  private pathMesh: THREE.InstancedMesh;
  private pathCount = 0;
  private time = 0;

  constructor(scene: THREE.Scene) {
    this.hatch = makeHatch(); this.dot = makeDot(); this.cell = makeCell();
    const quad = new THREE.PlaneGeometry(TILE * 0.92, TILE * 0.92).rotateX(-Math.PI / 2);
    for (const [k, v] of Object.entries(COLORS) as [CellStyle, typeof COLORS[CellStyle]][]) {
      const mat = new THREE.MeshBasicMaterial({ color: v.c, transparent: true, opacity: v.a, depthWrite: false, map: (k === 'threat' || k === 'danger') ? this.hatch : this.cell, polygonOffset: true, polygonOffsetFactor: -2 });
      const m = new THREE.InstancedMesh(quad, mat, 400); m.count = 0; m.frustumCulled = false; m.renderOrder = k === 'threat' ? 18 : k === 'footprint' ? 17 : k === 'hover' ? 16 : 5 + Object.keys(COLORS).indexOf(k);
      this.meshes.set(k, m); this.group.add(m);
    }
    const dotGeo = new THREE.PlaneGeometry(1.1, 1.1).rotateX(-Math.PI / 2);
    this.pathMesh = new THREE.InstancedMesh(dotGeo, new THREE.MeshBasicMaterial({ color: 0xe8dcc4, transparent: true, opacity: 0.85, depthWrite: false, map: this.dot }), 200);
    this.pathMesh.count = 0; this.pathMesh.frustumCulled = false; this.pathMesh.renderOrder = 20; this.group.add(this.pathMesh);
    scene.add(this.group);
  }

  clear(style?: CellStyle) {
    if (style) { const m = this.meshes.get(style)!; m.count = 0; this.counts.set(style, 0); return; }
    for (const [k, m] of this.meshes) { m.count = 0; this.counts.set(k, 0); }
    this.pathMesh.count = 0;
  }
  set(style: CellStyle, cells: Vec2[]) {
    const m = this.meshes.get(style)!; const y = COLORS[style].y;
    const n = Math.min(cells.length, 400);
    const mat = new THREE.Matrix4();
    for (let i = 0; i < n; i++) { mat.makeTranslation(cells[i].x * TILE, y, cells[i].y * TILE); m.setMatrixAt(i, mat); }
    m.count = n; m.instanceMatrix.needsUpdate = true;
  }
  setPath(cells: Vec2[]) {
    const mat = new THREE.Matrix4(); const n = Math.min(cells.length, 200);
    for (let i = 0; i < n; i++) { mat.makeTranslation(cells[i].x * TILE, 0.22, cells[i].y * TILE); this.pathMesh.setMatrixAt(i, mat); }
    this.pathMesh.count = n; this.pathMesh.instanceMatrix.needsUpdate = true; this.pathCount = n;
  }
  update(dt: number) {
    this.time += dt;
    const hover = this.meshes.get('hover')!; (hover.material as THREE.MeshBasicMaterial).opacity = 0.35 + 0.2 * Math.sin(this.time * 6);
    const target = this.meshes.get('target')!; (target.material as THREE.MeshBasicMaterial).opacity = 0.5 + 0.3 * Math.sin(this.time * 8);
    const threat = this.meshes.get('threat')!; (threat.material as THREE.MeshBasicMaterial).opacity = 0.36 + 0.1 * Math.sin(this.time * 4);
  }
}

function makeHatch(): THREE.Texture {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(255,255,255,0.55)'; g.fillRect(0, 0, 64, 64);
  g.strokeStyle = 'rgba(255,255,255,1)'; g.lineWidth = 6;
  for (let i = -64; i < 128; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 64, 64); g.stroke(); }
  g.strokeStyle = 'rgba(255,255,255,1)'; g.lineWidth = 4; g.strokeRect(2, 2, 60, 60);
  const t = new THREE.CanvasTexture(c); return t;
}
function makeCell(): THREE.Texture {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(255,255,255,0.45)'; g.fillRect(0, 0, 64, 64);
  g.strokeStyle = 'rgba(255,255,255,1)'; g.lineWidth = 5; g.strokeRect(2.5, 2.5, 59, 59);
  return new THREE.CanvasTexture(c);
}
function makeDot(): THREE.Texture {
  const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d')!;
  g.fillStyle = '#fff'; g.beginPath(); g.arc(16, 16, 9, 0, Math.PI * 2); g.fill();
  return new THREE.CanvasTexture(c);
}
