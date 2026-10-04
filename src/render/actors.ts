/** Character views: skinned KayKit clones with animation, tint, attachments, position tweening and a projected health bar. */
import * as THREE from 'three';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';
import type { Unit, Vec2 } from '../sim/types';
import { Assets, TILE } from './assets';

interface ModelSpec { char: string; scale: number; tint?: number; emissive?: number; show: string[]; weapon?: string; weaponBone?: string; attackClip: string; rangedClip?: string; idle?: string }

export const MODEL_SPECS: Record<string, ModelSpec> = {
  knight: { char: 'Knight', scale: 1, show: ['1H_Sword', 'Round_Shield', 'Knight_Helmet', 'Knight_Cape'], attackClip: '1H_Melee_Attack_Slice_Diagonal' },
  barbarian: { char: 'Barbarian', scale: 1.08, show: ['2H_Axe', 'Barbarian_Cape'], attackClip: '2H_Melee_Attack_Chop' },
  mage: { char: 'Mage', scale: 1, show: ['2H_Staff', 'Mage_Hat', 'Mage_Cape'], attackClip: 'Spellcast_Shoot', rangedClip: 'Spellcast_Shoot' },
  rogue: { char: 'Rogue', scale: 1, show: ['Knife', 'Knife_Offhand', 'Rogue_Cape'], attackClip: 'Dualwield_Melee_Attack_Slice' },
  ranger: { char: 'Rogue_Hooded', scale: 1, show: ['2H_Crossbow', 'Rogue_Cape'], attackClip: '2H_Ranged_Shoot', rangedClip: '2H_Ranged_Shoot' },
  skeleton_warrior: { char: 'Skeleton_Warrior', scale: 1, show: ['Skeleton_Warrior_Helmet'], weapon: 'Skeleton_Blade', attackClip: '1H_Melee_Attack_Chop' },
  skeleton_rogue: { char: 'Skeleton_Rogue', scale: 1, show: ['Skeleton_Rogue_Hood', 'Skeleton_Rogue_Cape'], weapon: 'Skeleton_Crossbow', attackClip: '2H_Ranged_Shoot', rangedClip: '2H_Ranged_Shoot' },
  skeleton_mage: { char: 'Skeleton_Mage', scale: 1, show: ['Skeleton_Mage_Hat'], weapon: 'Skeleton_Staff', attackClip: 'Spellcast_Raise', rangedClip: 'Spellcast_Shoot' },
  pale: { char: 'Skeleton_Minion', scale: 1.05, tint: 0x8fa3b8, show: ['Skeleton_Minion_Cloak'], attackClip: 'Unarmed_Melee_Attack_Punch_A' },
  drowned: { char: 'Skeleton_Minion', scale: 1.0, tint: 0x3f8f86, show: [], attackClip: 'Unarmed_Melee_Attack_Punch_B' },
  rat: { char: 'Skeleton_Minion', scale: 0.48, tint: 0x6a4a35, show: [], attackClip: 'Unarmed_Melee_Attack_Kick' },
  spider: { char: 'Skeleton_Rogue', scale: 0.72, tint: 0x5a3a6a, show: ['Skeleton_Rogue_Hood'], attackClip: 'Throw', rangedClip: 'Throw' },
  crawler: { char: 'Skeleton_Minion', scale: 0.9, tint: 0xe8d7a0, emissive: 0x332200, show: [], attackClip: 'Unarmed_Melee_Attack_Punch_A' },
  stoker: { char: 'Barbarian', scale: 1.0, tint: 0x8a3a2a, show: ['1H_Axe', 'Barbarian_Hat'], attackClip: '1H_Melee_Attack_Chop' },
  bellows: { char: 'Mage', scale: 1.0, tint: 0xa05030, show: ['2H_Staff', 'Mage_Hat'], attackClip: 'Spellcast_Shoot', rangedClip: 'Spellcast_Shoot' },
  hound: { char: 'Skeleton_Minion', scale: 0.62, tint: 0xff6a2a, emissive: 0x401000, show: [], attackClip: 'Unarmed_Melee_Attack_Kick' },
  wight: { char: 'Skeleton_Warrior', scale: 1.0, tint: 0xffa040, emissive: 0x602000, show: [], attackClip: 'Unarmed_Melee_Attack_Punch_A' },
  ferryman: { char: 'Knight', scale: 1.45, tint: 0x7f93b0, show: ['Knight_Cape', 'Knight_Helmet'], attackClip: 'Unarmed_Melee_Attack_Punch_A' },
  tallow: { char: 'Mage', scale: 1.5, tint: 0xf0e0b0, emissive: 0x403010, show: ['Mage_Cape'], attackClip: 'Spellcast_Raise', rangedClip: 'Spellcast_Raise' },
  prelate: { char: 'Mage', scale: 1.3, tint: 0xd04030, emissive: 0x401000, show: ['2H_Staff', 'Mage_Cape', 'Mage_Hat'], attackClip: 'Spellcast_Shoot', rangedClip: 'Spellcast_Shoot' },
  hearth: { char: 'Skeleton_Mage', scale: 2.4, tint: 0xffb060, emissive: 0xff5a10, show: [], attackClip: 'Spellcast_Raise', rangedClip: 'Spellcast_Raise' },
};

const IMPACT: Record<string, number> = { '1H_Melee_Attack_Slice_Diagonal': 0.45, '1H_Melee_Attack_Chop': 0.45, '2H_Melee_Attack_Chop': 0.5, 'Dualwield_Melee_Attack_Slice': 0.4, 'Spellcast_Shoot': 0.45, 'Spellcast_Raise': 0.5, '2H_Ranged_Shoot': 0.35, 'Unarmed_Melee_Attack_Punch_A': 0.4, 'Unarmed_Melee_Attack_Punch_B': 0.4, 'Unarmed_Melee_Attack_Kick': 0.45, 'Throw': 0.5 };

export class ActorView {
  root = new THREE.Group();
  model: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  actions = new Map<string, THREE.AnimationAction>();
  current?: THREE.AnimationAction;
  spec: ModelSpec;
  bar: HTMLDivElement;
  dead = false;
  private tween?: { from: THREE.Vector3; to: THREE.Vector3; t: number; dur: number; resolve: () => void; hop?: boolean };
  private faceTarget = 0;
  private selectRing: THREE.Mesh;
  private hitFlash = 0;
  private mats: THREE.MeshStandardMaterial[] = [];
  hearth = false;
  private life = 0;

  constructor(public unit: Unit, assets: Assets, parent: THREE.Object3D, uiLayer: HTMLElement) {
    this.spec = MODEL_SPECS[unit.def.model] ?? MODEL_SPECS.pale;
    const gltf = assets.chars.get(this.spec.char) ?? assets.chars.get('Skeleton_Minion')!;
    if (unit.def.model === 'hearth') {
      this.model = makeHearth(); this.hearth = true;
      this.mixer = new THREE.AnimationMixer(this.model);
    } else {
      this.model = skeletonClone(gltf.scene);
      this.model.scale.setScalar(this.spec.scale);
      this.mixer = new THREE.AnimationMixer(this.model);
      for (const clip of gltf.animations) this.actions.set(clip.name, this.mixer.clipAction(clip));
    }
    // attachments: hide all bone-parented rigid meshes except the chosen ones; clone materials for tinting
    this.model.traverse(o => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        if (o.parent && (o.parent as THREE.Bone).isBone) o.visible = this.spec.show.includes(o.name);
        const mat = (m.material as THREE.MeshStandardMaterial).clone(); m.material = mat; this.mats.push(mat);
        if (mat.name === 'Glow' || /eyes/i.test(o.name)) { mat.emissive = new THREE.Color(unit.faction === 'enemy' ? 0xff4020 : 0x40c0ff); mat.emissiveIntensity = 2.5; }
        if (this.spec.tint && mat.name !== 'Glow') mat.color.multiply(new THREE.Color(this.spec.tint));
        if (this.spec.emissive && mat.name !== 'Glow') { mat.emissive = new THREE.Color(this.spec.emissive); mat.emissiveIntensity = 1.0; }
        if (unit.def.tint && mat.name !== 'Glow') mat.color.multiply(new THREE.Color(unit.def.tint));
        m.castShadow = true; m.frustumCulled = false;
      }
    });
    if (this.spec.weapon) { const w = assets.weapons.get(this.spec.weapon); const bone = this.model.getObjectByName('handslot.r'); if (w && bone) { const wc = w.clone(true); wc.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; } }); bone.add(wc); } }
    this.root.add(this.model);
    // selection ring
    this.selectRing = new THREE.Mesh(new THREE.RingGeometry(1.7, 2.05, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffb060, transparent: true, opacity: 0.95, depthWrite: false, depthTest: false }));
    this.selectRing.position.y = 0.25; this.selectRing.renderOrder = 30; this.selectRing.visible = false; this.root.add(this.selectRing);
    this.root.position.copy(this.gridPos(unit.pos));
    this.faceTarget = this.yawFor(unit.facing);
    this.model.rotation.y = this.faceTarget;
    parent.add(this.root);
    this.play(this.spec.idle ?? 'Idle', 0);

    this.bar = document.createElement('div'); this.bar.className = 'hpbar ' + (unit.faction === 'party' ? 'party' : 'enemy');
    this.bar.innerHTML = '<i></i><span class="arm"></span><span class="intent"></span><span class="name"></span>';
    uiLayer.appendChild(this.bar);
    this.refreshBar();
  }

  gridPos(p: Vec2) { return new THREE.Vector3(p.x * TILE, 0, p.y * TILE); }
  yawFor(d: Vec2) { return (d.x === 0 && d.y === 0) ? this.model.rotation.y : Math.atan2(d.x, d.y); }

  play(name: string, fade = 0.15, loop = true) {
    let a = this.actions.get(name);
    if (!a) a = this.actions.get(loop ? 'Idle' : 'Hit_A');
    if (!a || a === this.current) return a;
    a.reset(); a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity); a.clampWhenFinished = !loop; a.enabled = true; a.setEffectiveWeight(1); a.play();
    if (this.current) this.current.crossFadeTo(a, fade, false);
    this.current = a; return a;
  }
  /** Play a one-shot clip; resolves when finished (or after its duration). onImpact fires at the clip's impact fraction. */
  playOnce(name: string, onImpact?: () => void, returnTo = 'Idle'): Promise<void> {
    const a = this.actions.get(name) ?? this.actions.get('Hit_A');
    if (!a) { onImpact?.(); return Promise.resolve(); }
    const dur = a.getClip().duration;
    this.play(a.getClip().name, 0.08, false);
    return new Promise<void>(res => {
      let impacted = !onImpact; const impactAt = (IMPACT[name] ?? 0.45) * dur;
      const start = performance.now();
      const tick = () => {
        const t = (performance.now() - start) / 1000;
        if (!impacted && t >= impactAt) { impacted = true; onImpact?.(); }
        if (t >= dur - 0.05) { if (returnTo && !this.dead) this.play(returnTo, 0.2); res(); return; }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }
  attackClip(ranged = false) { return ranged && this.spec.rangedClip ? this.spec.rangedClip : this.spec.attackClip; }

  face(d: Vec2) { if (d.x || d.y) this.faceTarget = Math.atan2(d.x, d.y); }
  faceToward(p: Vec2) { this.face({ x: Math.sign(p.x - this.unit.pos.x), y: Math.sign(p.y - this.unit.pos.y) }); }

  /** Tween to a grid position. */
  moveTo(p: Vec2, dur = 0.22, hop = false): Promise<void> {
    const to = this.gridPos(p);
    return new Promise(res => { this.tween = { from: this.root.position.clone(), to, t: 0, dur, resolve: res, hop }; });
  }
  snapTo(p: Vec2) { this.tween = undefined; this.root.position.copy(this.gridPos(p)); }

  setSelected(on: boolean) { this.selectRing.visible = on; }
  flash() { this.hitFlash = 1; }

  die(): Promise<void> {
    this.dead = true; this.bar.style.display = 'none'; this.selectRing.visible = false;
    const name = this.actions.has('Death_A') ? 'Death_A' : 'Death_B';
    return this.playOnce(name, undefined, '').then(() => { /* stay in death pose */ });
  }
  remove(parent: THREE.Object3D) { parent.remove(this.root); this.bar.remove(); }

  refreshBar(intentLabel?: string) {
    const u = this.unit;
    const fill = this.bar.firstElementChild as HTMLElement; fill.style.width = Math.max(0, 100 * u.hp / u.maxHp) + '%';
    const arm = this.bar.querySelector('.arm') as HTMLElement; const a = u.armourBroken ? 0 : u.armour + (u.mods['armour'] ?? 0); arm.textContent = a > 0 ? '⛨' + a : '';
    const it = this.bar.querySelector('.intent') as HTMLElement; it.textContent = intentLabel ?? ''; it.style.display = intentLabel ? '' : 'none';
    const nm = this.bar.querySelector('.name') as HTMLElement; nm.textContent = u.faction === 'enemy' ? u.name : '';
  }

  update(dt: number, screen: (v: THREE.Vector3) => { x: number; y: number; visible: boolean }, visible: boolean) {
    this.mixer.update(dt);
    if (this.hearth) { this.life += dt; const breathe = 1 + 0.06 * Math.sin(this.life * 1.4); const core = this.model.getObjectByName('core'); const halo = this.model.getObjectByName('halo'); const light = this.model.getObjectByName('light') as THREE.PointLight | undefined; if (core) core.scale.setScalar(breathe); if (halo) { halo.scale.setScalar(1.1 + 0.15 * Math.sin(this.life * 0.9)); halo.rotation.y += dt * 0.2; halo.rotation.x += dt * 0.07; } if (light) light.intensity = this.dead ? Math.max(0, light.intensity - dt * 60) : 70 + 25 * Math.sin(this.life * 1.4); if (this.dead) { this.model.scale.multiplyScalar(Math.max(0, 1 - dt * 0.6)); } }
    if (this.tween) {
      const tw = this.tween; tw.t += dt;
      const k = Math.min(1, tw.t / tw.dur);
      this.root.position.lerpVectors(tw.from, tw.to, k);
      if (tw.hop) this.root.position.y = Math.sin(k * Math.PI) * 1.2;
      if (k >= 1) { this.root.position.y = 0; this.tween = undefined; tw.resolve(); }
    }
    // smooth facing
    let d = this.faceTarget - this.model.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
    this.model.rotation.y += d * Math.min(1, dt * 14);
    if (this.hitFlash > 0) { this.hitFlash = Math.max(0, this.hitFlash - dt * 4); for (const m of this.mats) if (m.name !== 'Glow') { m.emissive.setRGB(this.hitFlash * 0.9, this.hitFlash * 0.3, this.hitFlash * 0.2); m.emissiveIntensity = 1; } }
    else if (this.hitFlash === 0 && this.mats.length && this.mats[0].emissiveIntensity === 1 && !this.spec.emissive) { for (const m of this.mats) if (m.name !== 'Glow') { m.emissive.setRGB(0, 0, 0); } this.hitFlash = -1; }
    this.root.visible = visible || this.unit.faction === 'party';
    // bar
    if (this.dead || !this.root.visible) { this.bar.style.display = 'none'; return; }
    const s = screen(this.root.position.clone().add(new THREE.Vector3(0, 2.9 * this.spec.scale, 0)));
    this.bar.style.display = s.visible ? '' : 'none'; this.bar.style.left = s.x + 'px'; this.bar.style.top = s.y + 'px';
  }
}

/** The Hearth: not a creature. A slow, breathing ember the size of a room's heart. */
function makeHearth(): THREE.Object3D {
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(2.1, 1), new THREE.MeshStandardMaterial({ color: 0xff7a2a, emissive: 0xff6a20, emissiveIntensity: 2.6, roughness: 0.4, flatShading: true }));
  core.name = 'core'; core.position.y = 2.4; core.castShadow = true; g.add(core);
  const halo = new THREE.Mesh(new THREE.IcosahedronGeometry(3.1, 1), new THREE.MeshStandardMaterial({ color: 0xffb060, emissive: 0xff9040, emissiveIntensity: 1.2, transparent: true, opacity: 0.22, wireframe: true, depthWrite: false }));
  halo.name = 'halo'; halo.position.y = 2.4; g.add(halo);
  for (let i = 0; i < 7; i++) {
    const shard = new THREE.Mesh(new THREE.TetrahedronGeometry(0.5 + Math.random() * 0.5), new THREE.MeshStandardMaterial({ color: 0x3a1a10, emissive: 0xff4a10, emissiveIntensity: 1.4, flatShading: true }));
    const a = (i / 7) * Math.PI * 2; shard.position.set(Math.cos(a) * 2.9, 0.6 + Math.random() * 2.5, Math.sin(a) * 2.9); shard.rotation.set(Math.random() * 3, Math.random() * 3, 0); shard.castShadow = true; g.add(shard);
  }
  const light = new THREE.PointLight(0xff8a30, 70, 40, 2); light.name = 'light'; light.position.y = 3; g.add(light);
  return g;
}
