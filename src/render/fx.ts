/** Transient effects: floating numbers, barks, projectiles, shock arcs. */
import * as THREE from 'three';
import type { Vec2 } from '../sim/types';
import { TILE } from './assets';

export class Fx {
  group = new THREE.Group();
  private live: { obj: THREE.Object3D; t: number; dur: number; from: THREE.Vector3; to: THREE.Vector3; arc: number; resolve?: () => void }[] = [];
  private fading: { obj: THREE.Object3D; t: number; dur: number }[] = [];
  constructor(scene: THREE.Scene, private ui: HTMLElement, private screen: (v: THREE.Vector3) => { x: number; y: number; visible: boolean }) { scene.add(this.group); }

  number(p: Vec2, text: string, cls = '') {
    const el = document.createElement('div'); el.className = 'floaty ' + cls; el.textContent = text;
    const s = this.screen(new THREE.Vector3(p.x * TILE, 2.6, p.y * TILE)); el.style.left = s.x + (Math.random() - 0.5) * 20 + 'px'; el.style.top = s.y + 'px';
    this.ui.appendChild(el); setTimeout(() => el.remove(), 1150);
  }
  bark(p: Vec2, text: string) {
    const el = document.createElement('div'); el.className = 'bark panel'; el.textContent = text;
    const s = this.screen(new THREE.Vector3(p.x * TILE, 3.4, p.y * TILE)); el.style.left = s.x + 'px'; el.style.top = s.y - 10 + 'px';
    this.ui.appendChild(el); setTimeout(() => el.remove(), 2700);
  }

  projectile(from: Vec2, to: Vec2, kind: 'arrow' | 'web' | 'spark' | 'fire' | 'gust' | 'hook'): Promise<void> {
    const a = new THREE.Vector3(from.x * TILE, 1.6, from.y * TILE), b = new THREE.Vector3(to.x * TILE, 1.4, to.y * TILE);
    let obj: THREE.Object3D; let dur = 0.25; let arc = 0.8;
    switch (kind) {
      case 'arrow': obj = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.4).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xd9d2c0 })); arc = 1.2; break;
      case 'web': obj = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff })); dur = 0.3; break;
      case 'spark': obj = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), new THREE.MeshBasicMaterial({ color: 0x9fe8ff })); dur = 0.14; arc = 0; break;
      case 'fire': obj = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff8a30 })); dur = 0.3; arc = 1.5; break;
      case 'gust': obj = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.1, 6, 16), new THREE.MeshBasicMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0.7 })); dur = 0.28; arc = 0; break;
      case 'hook': obj = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.7, 6).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x999999 })); dur = 0.18; arc = 0.2; break;
    }
    obj.position.copy(a); obj.lookAt(b); this.group.add(obj);
    return new Promise(res => this.live.push({ obj, t: 0, dur, from: a, to: b, arc, resolve: res }));
  }

  shock(tiles: Vec2[]) {
    for (const t of tiles) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(TILE * 0.9, TILE * 0.9).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
      m.position.set(t.x * TILE, 0.25, t.y * TILE); this.group.add(m); this.fading.push({ obj: m, t: 0, dur: 0.5 });
    }
  }
  burst(p: Vec2, color = 0xff8a30, size = 2.5) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(size, 12, 10), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.position.set(p.x * TILE, 1.2, p.y * TILE); this.group.add(m); this.fading.push({ obj: m, t: 0, dur: 0.45 });
  }
  ring(p: Vec2, color = 0xffffff) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.7, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false }));
    m.position.set(p.x * TILE, 0.3, p.y * TILE); this.group.add(m); this.fading.push({ obj: m, t: 0, dur: 0.6 });
  }

  update(dt: number) {
    for (const l of [...this.live]) {
      l.t += dt; const k = Math.min(1, l.t / l.dur);
      l.obj.position.lerpVectors(l.from, l.to, k); l.obj.position.y += Math.sin(k * Math.PI) * l.arc;
      if (k >= 1) { this.group.remove(l.obj); this.live.splice(this.live.indexOf(l), 1); l.resolve?.(); }
    }
    for (const f of [...this.fading]) {
      f.t += dt; const k = f.t / f.dur; const m = f.obj as THREE.Mesh; (m.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.85 * (1 - k)); m.scale.setScalar(1 + k * 1.6);
      if (k >= 1) { this.group.remove(f.obj); this.fading.splice(this.fading.indexOf(f), 1); }
    }
  }
}
