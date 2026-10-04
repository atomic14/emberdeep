/** Turns the sim's event list into animation, sound and UI, in order. */
import * as THREE from 'three';
import type { Level, SimEvent, Unit, Vec2 } from '../sim/types';
import { tileAt, unitById } from '../sim/grid';
import { Assets } from './assets';
import { View } from './scene';
import { World } from './world';
import { ActorView } from './actors';
import { Overlay } from './overlay';
import { Fx } from './fx';
import { AudioSys } from './audio';
import { ABILITIES } from '../content/abilities';

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

export class Presenter {
  world?: World;
  level?: Level;
  actors = new Map<string, ActorView>();
  overlay: Overlay;
  fx: Fx;
  actorLayer = new THREE.Group();
  busy = 0;
  speed = 1;
  follow = true;
  showBars = true;
  onText?: (text: string, style?: string) => void;
  onCombatStart?: (reason: string) => void;
  onCombatEnd?: (won: boolean) => void;
  onIntentChange?: () => void;
  private tilesDirty = false;
  private propsDirty = false;
  private barLayer: HTMLElement;

  constructor(public view: View, private assets: Assets, private ui: HTMLElement, public audio: AudioSys) {
    this.barLayer = document.createElement('div'); this.barLayer.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:1;'; ui.appendChild(this.barLayer);
    this.overlay = new Overlay(view.scene);
    this.fx = new Fx(view.scene, this.barLayer, v => view.worldToScreen(v));
    view.scene.add(this.actorLayer);
  }

  setLevel(level: Level) {
    this.clearLevel();
    this.level = level;
    this.world = new World(this.assets, level, this.view.scene);
    for (const u of level.units) if (u.alive) this.addActor(u);
    this.view.setMood(level.meta.hour);
  }
  clearLevel() {
    this.world?.dispose(); this.world = undefined;
    for (const a of this.actors.values()) a.remove(this.actorLayer); this.actors.clear();
    this.overlay.clear();
  }
  addActor(u: Unit) { if (this.actors.has(u.id)) return this.actors.get(u.id)!; const a = new ActorView(u, this.assets, this.actorLayer, this.barLayer); this.actors.set(u.id, a); return a; }
  actor(id: string) { return this.actors.get(id); }

  /** Snap every actor to its sim position and refresh bars/visibility (safety net after a sequence). */
  sync() {
    if (!this.level) return;
    for (const u of this.level.units) {
      const a = this.actors.get(u.id);
      if (!u.alive) { continue; }
      if (!a) { this.addActor(u); continue; }
      a.snapTo(u.pos); a.refreshBar(u.intent && u.intent.kind !== 'wait' ? u.intent.label : u.intent?.kind === 'wait' ? u.intent.label : undefined);
    }
    this.world?.updateVisibility();
  }

  async play(events: SimEvent[]): Promise<void> {
    if (!this.level) return;
    this.busy++;
    try {
      let i = 0;
      while (i < events.length) {
        const e = events[i];
        // batch concurrent walks by different units
        if (e.t === 'move' && (e.kind ?? 'walk') === 'walk') {
          const batch: Extract<SimEvent, { t: 'move' }>[] = [];
          const ids = new Set<string>();
          while (i < events.length && events[i].t === 'move' && ((events[i] as any).kind ?? 'walk') === 'walk' && !ids.has((events[i] as any).id)) { const m = events[i] as Extract<SimEvent, { t: 'move' }>; batch.push(m); ids.add(m.id); i++; }
          await Promise.all(batch.map(m => this.walk(m)));
          continue;
        }
        await this.one(e);
        i++;
      }
    } finally {
      if (this.tilesDirty) { this.world?.rebuildAll(); this.tilesDirty = false; this.propsDirty = false; }
      else if (this.propsDirty) { this.world?.rebuildProps(); this.propsDirty = false; }
      this.world?.updateVisibility();
      this.busy--;
    }
  }

  private async walk(m: Extract<SimEvent, { t: 'move' }>) {
    const a = this.actors.get(m.id); if (!a) return;
    const u = a.unit;
    if (u.faction === 'enemy' && this.follow && this.level && tileAt(this.level, m.path[m.path.length - 1])?.visible) this.view.lookAtWorld(a.gridPos(m.path[m.path.length - 1]));
    a.play(u.faction === 'party' ? 'Walking_A' : (u.def.move >= 5 ? 'Running_A' : 'Walking_A'), 0.1);
    let prev = { x: Math.round(a.root.position.x / 4), y: Math.round(a.root.position.z / 4) };
    for (const p of m.path) {
      a.face({ x: Math.sign(p.x - prev.x), y: Math.sign(p.y - prev.y) });
      const t = tileAt(this.level!, p);
      if (t?.visible || u.faction === 'party') this.audio.sfx(t?.kind === 'water' ? 'stepwater' : 'step', t?.kind === 'water' ? 2 : 5, 0.35);
      await a.moveTo(p, 0.17 / this.speed);
      prev = p;
    }
    a.play('Idle', 0.2);
  }

  private async one(e: SimEvent) {
    const L = this.level!;
    switch (e.t) {
      case 'move': {
        const a = this.actors.get(e.id); if (!a) return;
        if (e.kind === 'dash') { for (const p of e.path) await a.moveTo(p, 0.1); return; }
        // push / pull / slide
        a.play('Hit_A', 0.05, false);
        for (const p of e.path) await a.moveTo(p, 0.09, true);
        if (!a.dead) a.play('Idle', 0.2);
        return;
      }
      case 'attack': {
        const a = this.actors.get(e.id); if (!a) return;
        if (a.unit.faction === 'enemy' && this.follow) this.view.lookAtWorld(a.root.position);
        a.faceToward(e.targetPos);
        const ranged = a.unit.def.attackRange > 1 || a.unit.intent?.kind === 'shoot' || a.unit.intent?.kind === 'pull';
        const clip = a.attackClip(ranged);
        if (!ranged) this.audio.sfx('swing', 3, 0.5);
        await new Promise<void>(res => { a.playOnce(clip, () => res()); });
        return;
      }
      case 'ability': {
        const a = this.actors.get(e.id); if (!a) return;
        if (e.targetPos) a.faceToward(e.targetPos);
        const ab = ABILITIES[e.ability];
        const cls = a.unit.def.id;
        const clip = cls === 'mage' || cls === 'ranger' && e.ability !== 'volley' ? (cls === 'ranger' ? '2H_Ranged_Shoot' : 'Spellcast_Shoot') : e.ability === 'roar' || e.ability === 'bulwark' || e.ability === 'hold' ? 'Cheer' : e.ability === 'shadowstep' ? 'Dodge_Forward' : e.ability === 'smoke' ? 'Throw' : a.attackClip(false);
        const sound = ({ gust: 'spell0', kindle: 'spell1', spark: 'spell2', shield_bash: 'hit_metal0', heave: 'punch0', sunder: 'mining0', hook: 'draw', smoke: 'cloth', shadowstep: 'cloth', pin: 'swing0', volley: 'swing1', mark: 'ui_select', roar: 'growl', bulwark: 'armor', hold: 'chainmail' } as Record<string, string>)[e.ability];
        if (sound) this.audio.sfx(sound, 1, 0.6);
        if (this.onText && ab) this.onText(`${a.unit.name.split(' ')[0]}: ${ab.name}`, 'info');
        await new Promise<void>(res => { a.playOnce(clip, () => res()); });
        return;
      }
      case 'projectile': { await this.fx.projectile(e.from, e.to, e.kind); if (e.kind === 'arrow') this.audio.sfx('swing', 3, 0.3); return; }
      case 'damage': {
        const a = this.actors.get(e.id);
        const u = unitById(L, e.id); if (!u) return;
        const pos = u.pos;
        if (e.kind === 'heal') { if (e.amount > 0) this.fx.number(pos, '+' + e.amount, 'heal'); this.audio.sfx('magic', 1, 0.4); }
        else {
          if (e.amount > 0) this.fx.number(pos, String(e.amount), e.kind === 'fire' || e.kind === 'explode' ? 'fire' : e.kind === 'shock' ? 'shock' : '');
          if (e.absorbed > 0) setTimeout(() => this.fx.number(pos, `−${e.absorbed} armour`, 'absorb'), 120);
          a?.flash();
          if (a && !a.dead && e.amount > 0) a.playOnce(Math.random() < 0.5 ? 'Hit_A' : 'Hit_B');
          const snd = e.kind === 'fire' || e.kind === 'explode' ? 'spell1' : e.kind === 'shock' ? 'spell2' : e.kind === 'slam' ? 'hit_wood' : u.armour > 0 ? 'hit_metal' : 'hit';
          this.audio.sfx(snd, snd === 'hit' || snd === 'hit_metal' || snd === 'hit_wood' ? 2 : 1, 0.55);
          if (e.kind === 'explode') { this.fx.burst(pos); this.view.shake = 0.6; }
        }
        a?.refreshBar(u.intent && u.intent.kind !== 'wait' ? u.intent.label : undefined);
        await sleep(e.kind === 'heal' ? 120 : 160);
        return;
      }
      case 'die': {
        const a = this.actors.get(e.id); const u = unitById(L, e.id);
        if (u) { this.audio.sfx(u.faction === 'party' ? 'lose' : u.def.id.startsWith('spent') || u.def.id === 'chorister' ? 'plate0' : 'shade', u.faction === 'party' ? 1 : u.def.id.startsWith('spent') ? 1 : 5, 0.5); }
        if (a) { a.die(); }
        if (u && u.faction === 'party') this.onText?.(`${u.name} falls.`, 'warn');
        await sleep(350);
        return;
      }
      case 'fall': {
        const a = this.actors.get(e.id); if (!a) return;
        this.audio.sfx('drop', 1, 0.6);
        const start = a.root.position.y; const t0 = performance.now();
        await new Promise<void>(res => { const tick = () => { const k = (performance.now() - t0) / 600; a.root.position.y = start - k * k * 14; a.model.rotation.x += 0.1; if (k >= 1) { a.root.visible = false; a.dead = true; a.bar.style.display = 'none'; res(); } else requestAnimationFrame(tick); }; tick(); });
        return;
      }
      case 'fire': this.world?.setFire(e.pos, e.on); if (e.on) this.audio.sfx('spell1', 1, 0.3); return;
      case 'smoke': this.world?.setSmoke(e.pos, e.on); return;
      case 'shock': this.fx.shock(e.tiles); this.audio.sfx('spell2', 1, 0.6); await sleep(120); return;
      case 'prop': {
        if (e.change === 'open' || e.change === 'close') { this.world?.setDoorOpen(e.pos, e.change === 'open'); this.audio.sfx(e.change === 'open' ? 'door_open' : 'door_close', 1, 0.6); await sleep(150); return; }
        if (e.change === 'break') { this.audio.sfx(e.prop?.kind === 'barrel' ? 'hit_wood' : 'mining', e.prop?.kind === 'barrel' ? 2 : 2, 0.7); this.fx.ring(e.pos, 0xffd0a0); }
        if (e.change === 'use') this.audio.sfx('coins', 1, 0.5);
        this.propsDirty = true; return;
      }
      case 'tile': this.tilesDirty = true; return;
      case 'intent': { const a = this.actors.get(e.id); a?.refreshBar(e.intent && e.intent.kind !== 'wait' ? e.intent.label : e.intent?.label); this.onIntentChange?.(); return; }
      case 'spawn': { const u = unitById(L, e.id); if (u && u.alive) { const a = this.addActor(u); a.refreshBar(); if (u.def.model.startsWith('skeleton') || u.def.id.startsWith('dream')) { a.playOnce('Spawn_Ground_Skeletons'); this.audio.sfx('plate0', 1, 0.4); await sleep(500); } } this.onIntentChange?.(); return; }
      case 'combatStart': this.onCombatStart?.(e.reason); this.audio.sfx('bong', 1, 0.5); await sleep(300); return;
      case 'combatEnd': this.onCombatEnd?.(e.won); return;
      case 'turn': return;
      case 'bark': { const u = unitById(L, e.id); if (u) this.fx.bark(u.pos, e.text); return; }
      case 'text': this.onText?.(e.text, e.style); return;
      case 'vent': return;
    }
  }

  focusParty(immediate = false) {
    if (!this.level) return;
    const party = this.level.units.filter(u => u.alive && u.faction === 'party');
    if (!party.length) return;
    const c = party.reduce((acc, u) => ({ x: acc.x + u.pos.x / party.length, y: acc.y + u.pos.y / party.length }), { x: 0, y: 0 });
    this.view.lookAtGrid(c.x, c.y, immediate);
  }

  update(dt: number) {
    const L = this.level;
    const leader = L?.units.find(u => u.alive && u.faction === 'party');
    if (leader) { const a = this.actors.get(leader.id); if (a) this.view.lantern.position.set(a.root.position.x, 4.5, a.root.position.z); this.view.lantern.intensity = 90; } else { this.view.lantern.position.set(this.view.target.x, 6, this.view.target.z); this.view.lantern.intensity = 60; }
    for (const a of this.actors.values()) {
      const t = L ? tileAt(L, a.unit.pos) : undefined;
      a.update(dt, v => this.view.worldToScreen(v), !!t?.visible);
      if (!this.showBars) a.bar.style.display = 'none';
    }
    this.world?.update(dt, this.view.target);
    this.fx.update(dt); this.overlay.update(dt);
  }
}
