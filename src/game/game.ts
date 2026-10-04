/** The game: screens, runs, floors, input, previews, and the glue between sim and presentation. */
import * as THREE from 'three';
import type { Level, Unit, Vec2, SimEvent, ClassId, Phase } from '../sim/types';
import { cheb, eq, key, add, DIRS8 } from '../sim/types';
import { tileAt, unitAt, living, walkable, inBounds } from '../sim/grid';
import { findPath, reachable, pathFromReach } from '../sim/pathfind';
import { generateFloor } from '../sim/dungeon';
import { HOUR_NAMES, KEEPER_FOR_HOUR } from '../sim/dungeon';
import {
  newCombatState, type CombatState, startCombat, moveUnit, undoMove, canUndo, basicAttack, attackTargets, attackDamage, useAbility, abilityTargets, abilityFootprint,
  endPlayerTurn, exploreStep, threatTiles, moveRange, interact, refreshVisibility, resetIds, currentId, makeUnit, intentTiles, enemiesThatSee, attackableProps, attackProp,
} from '../sim/combat';
import { Rng } from '../sim/rng';
import { PARTY_DEFS, ENEMY_DEFS } from '../content/units';
import { ABILITIES } from '../content/abilities';
import { boonsFor, BOONS, type Boon } from '../content/boons';
import { EVENTS, CHOIR_PAGES, KEEPER_LINES, HOUR_INTRO, BARKS, epitaph, ENDINGS, type EventCard, type EventChoice } from '../content/story';
import { loadMeta, saveMeta, loadRun, saveRun, newRun, recruit, wipeAll, UPGRADES, saveFloor, loadFloor as loadFloorSave, type Meta, type Run } from './state';
import { View } from '../render/scene';
import { Presenter } from '../render/presenter';
import { Hud } from '../ui/hud';
import { Screens, selectHubLines } from '../ui/screens';
import { AudioSys } from '../render/audio';

const FLOORS_PER_HOUR = 2;
const ROLE_DESC: Record<string, string> = {
  rat: 'Weak and quick. Comes in packs.', pale: 'Slow. Its grab roots you in place. Cannot open doors. Drawn to light.', drowned: 'Rises from water. Takes +2 from lightning.', spider: 'Shoots a line of web: 1 damage and roots.',
  spent: 'Holds lines, opens doors. Armour 1: pushes and Sunder break it.', spent_archer: 'Shoots down a straight line, 5 tiles. Hits the first thing in it.', crawler: 'Leaves oil behind it. Burns beautifully.', chorister: 'Heals the Spent around it. Kill it first.',
  stoker: 'Armoured. Its strike sets your tile alight, and burning hurts every turn.', bellows: 'Blasts a line of hot air: pushes 2.', hound: 'Fast. Moves twice as far when it has no target.', wight: 'Explodes when it dies: 2 fire to everything adjacent. Kill it away from your friends.',
  dream_pale: 'A fever of the Pale. Grabs.', dream_spent: 'A fever of the Spent.', dream_archer: 'A fever with a bow.',
  ferryman: 'Pulls you along his chain toward the edge. Cannot be pushed.', tallow: 'Keeps the Spent warm: heals them, wakes more. Cannot be pushed.', prelate: 'Burns a line. Calls Stokers. Half ember himself.', hearth: 'It does not fight. It dreams. Put the dreams down and reach it.',
};

export class Game {
  meta: Meta;
  run?: Run;
  level?: Level;
  cs?: CombatState;
  mode: 'title' | 'hub' | 'run' = 'title';
  selectedId?: string;
  leaderId?: string;
  armed?: string;             // 'attack' | ability id
  hoverCell?: Vec2;
  private walking = false;
  private walkCancel = false;
  private exploring = false;
  private keys = new Set<string>();
  private lastRunSummary?: { died: boolean; ascended: boolean; emberBrought: number; lost?: string[] };
  private seenKeeper = false;
  private busyFlow = false;
  private hoverTimer = 0;
  private autoEndTimer = 0;
  private lastPointer = { x: 0, y: 0 };

  constructor(public view: View, public presenter: Presenter, public hud: Hud, public screens: Screens, public audio: AudioSys) {
    this.meta = loadMeta();
    this.audio.setVolumes(this.meta.settings.sfx, this.meta.settings.music);
    this.bindInput();
    screens.onOpen = () => hud.tooltip.hide();
    presenter.onText = (t, s) => this.hud.log(t, s);
    presenter.onCombatStart = (r) => {
      this.hud.banner('They have seen your light', r, 2200); this.audio.playMusic(this.level?.meta.isKeeper ? 'combat2' : 'combat'); this.frameCombat();
      const n = (this.meta.flags['_fights'] as unknown as number) || 0; (this.meta.flags as any)['_fights'] = n + 1;
      const hints = ['Each Lamplighter can move and then take one action, in any order. When everyone has acted, press End Turn (Space). Then the Deep moves.', 'Red tiles are where enemies will strike. Step out of them, or push the enemy so its attack lands elsewhere.', 'Hover an enemy to see what it will do and what your attack would do to it. Numbers never lie here.', 'Movement can be undone until you act. Right-click or Z.'];
      if (n < hints.length) setTimeout(() => this.hud.log(hints[n], 'story'), 2400);
    };
    presenter.onCombatEnd = (won) => { if (won) { this.hud.banner('The room is quiet', '', 1600); this.audio.playMusic(this.musicFor()); setTimeout(() => this.wonFight(), 500); } };
    presenter.onIntentChange = () => this.refreshOverlays();
    presenter.isAware = id => !!this.cs?.aware.has(id);
    hud.onSelect = id => this.select(id); hud.onAbility = id => this.arm(id); hud.onEndTurn = () => this.endTurn(); hud.onExplore = () => this.autoExplore(); hud.onUndo = id => this.undo(id);
    hud.onMenu = () => this.openMenu(); hud.onHelp = () => this.screens.help(() => { });
  }

  // ------------------------------------------------------------------ screens
  start() {
    this.hud.show(false);
    const q = new URLSearchParams(location.search);
    if (q.has('continue') && loadRun()) { this.continueRun(); return; }
    if (q.has('hour')) { // developer shortcut: ?hour=2&floor=1&party=knight,mage,rogue&keeper=1
      const party = (q.get('party') ?? 'knight,barbarian,mage').split(',') as ClassId[];
      for (const c of party) if (!this.meta.roster.find(r => r.classId === c && r.alive)) this.meta.roster.push({ classId: c, name: PARTY_DEFS[c].name, alive: true, runs: 0, kills: 0, original: true });
      this.meta.settings.shownHelp = true;
      saveFloor(undefined); this.run = newRun(this.meta, party, +(q.get('seed') ?? 42));
      this.run.hour = +(q.get('hour') ?? 1) as Run['hour']; this.run.floor = q.has('keeper') ? FLOORS_PER_HOUR + 1 : +(q.get('floor') ?? 1);
      this.loadFloor(); return;
    }
    this.showTitle();
  }
  showTitle() {
    this.mode = 'title'; this.hud.show(false); this.showBackdrop(2);
    this.audio.playMusic('title');
    this.screens.title({
      hasRun: !!loadRun(), meta: this.meta,
      onNew: () => { if (!this.meta.flags['prologue']) { this.meta.flags['prologue'] = true; saveMeta(this.meta); this.screens.prologue().then(() => this.showHub()); } else this.showHub(); }, onContinue: () => this.continueRun(),
      onBook: () => this.screens.book(this.meta, () => this.showTitle()), onHelp: () => this.screens.help(() => this.showTitle()),
      onSettings: () => this.screens.settings(this.meta.settings, s => { this.audio.setVolumes(s.sfx, s.music); saveMeta(this.meta); }, () => this.showTitle()),
      onWipe: async () => { if (await this.screens.confirm('Forget everything?', 'The Book, the roster, the pages, the ember. All of it.', 'Forget', 'Keep')) { wipeAll(); this.meta = loadMeta(); } this.showTitle(); },
    });
  }
  showHub() {
    this.mode = 'hub'; this.hud.show(false); this.showBackdrop(1);
    this.audio.playMusic('hub');
    if (!this.meta.roster.find(r => r.classId === 'rogue') && this.meta.runs >= 1) this.meta.roster.push({ classId: 'rogue', name: PARTY_DEFS.rogue.name, alive: true, runs: 0, kills: 0, original: true });
    if (!this.meta.roster.find(r => r.classId === 'ranger') && this.meta.runs >= 2) this.meta.roster.push({ classId: 'ranger', name: PARTY_DEFS.ranger.name, alive: true, runs: 0, kills: 0, original: true });
    const lines = selectHubLines(this.meta, this.lastRunSummary);
    for (const l of lines) if (!this.meta.linesSaid.includes(l.key)) this.meta.linesSaid.push(l.key);
    saveMeta(this.meta);
    this.screens.hub(this.meta, lines, {
      onStart: party => this.startRun(party),
      onBuy: id => { const u = UPGRADES.find(x => x.id === id)!; const lvl = this.meta.upgrades[id] ?? 0; if (lvl < u.max && this.meta.emberBanked >= u.cost) { this.meta.emberBanked -= u.cost; this.meta.upgrades[id] = lvl + 1; this.audio.sfx('coins', 1, 0.6); saveMeta(this.meta); } },
      onBook: () => this.screens.book(this.meta, () => this.showHub()), onPages: () => this.screens.pages(this.meta.pagesFound, () => this.showHub()),
      onTitle: () => this.showTitle(), onSettings: () => this.screens.settings(this.meta.settings, s => { this.audio.setVolumes(s.sfx, s.music); saveMeta(this.meta); }, () => this.showHub()),
    });
  }

  /** A lit, slowly drifting dungeon behind the menus. */
  private backdropHour = 0;
  private showBackdrop(hour: 1 | 2 | 3) {
    if (this.backdropHour === hour && this.presenter.level && !this.run) return;
    resetIds(9000);
    const L = generateFloor({ seed: 1234 + hour, hour, index: 1, fever: 0, partyDefs: [], eventIds: [], pagesLeft: [] });
    for (const t of L.tiles) { t.explored = true; t.visible = true; }
    this.level = undefined; this.cs = undefined;
    this.presenter.setLevel(L); this.presenter.follow = false; this.presenter.showBars = false;
    const room = L.rooms.find(r => r.role === 'combat') ?? L.rooms[0];
    this.view.lookAtGrid(room.x + room.w / 2, room.y + room.h / 2, true);
    this.view.setZoom(2);
    this.backdropHour = hour;
  }

  // ------------------------------------------------------------------ runs
  startRun(party: ClassId[]) {
    saveFloor(undefined); this.run = newRun(this.meta, party);
    this.meta.runs++; saveMeta(this.meta);
    this.lastRunSummary = undefined;
    if (!this.meta.settings.shownHelp) { this.meta.settings.shownHelp = true; saveMeta(this.meta); this.screens.help(() => this.loadFloor()); return; }
    this.loadFloor();
  }
  continueRun() { const r = loadRun(); if (!r) return this.showHub(); this.run = r; this.loadFloor(); }

  private musicFor() { const h = this.level?.meta.hour ?? 1; return `hour${h}`; }

  async loadFloor() {
    const run = this.run!; this.mode = 'run';
    this.screens.close();
    const isKeeper = run.floor > FLOORS_PER_HOUR || run.hour === 4;
    const seed = (run.seed * 31 + run.hour * 101 + run.floor * 7) % 2147483647;
    resetIds(1);
    const snap = loadFloorSave();
    const resumed = !!snap && snap.hour === run.hour && snap.floor === run.floor && snap.seed === seed;
    const allowed: Record<number, number[]> = { 1: [1, 2, 3, 4], 2: [5, 6, 7, 8], 3: [9, 10, 11], 4: [12] };
    const unfound = Object.keys(CHOIR_PAGES).map(Number).filter(i => !this.meta.pagesFound.includes(i));
    const inHour = unfound.filter(i => allowed[run.hour].includes(i) || i < Math.min(...allowed[run.hour]));
    const pagesLeft = (inHour.length ? inHour : unfound).slice(0, 1); // the next page in the Choir's order
    const eventIds = EVENTS.filter(e => e.hour.includes(run.hour) && !run.eventsSeen.includes(e.id)).map(e => e.id);
    const alive = run.party.filter(p => p.alive);
    if (resumed) {
      this.level = snap!.level as Level; resetIds(snap!.nextId);
      this.cs = newCombatState(seed + 1, snap!.cs.lanternRadius);
      this.cs.phase = snap!.cs.phase as Phase; this.cs.turn = snap!.cs.turn; this.cs.aware = new Set(snap!.cs.aware);
      run.shrineHour = snap!.shrineHour;
    } else {
      this.level = generateFloor({
        seed, hour: run.hour, index: isKeeper ? 4 : run.floor, keeper: isKeeper, fever: this.meta.fever, eventIds, pagesLeft,
        partyDefs: alive.map(p => ({ def: PARTY_DEFS[p.classId], name: p.name, hp: p.hp, maxHp: p.maxHp, boons: p.boons, mods: { ...p.mods, ...(this.meta.upgrades['wick'] && !run.wickUsed ? { wick: 1 } : {}) } })),
      });
      this.cs = newCombatState(seed + 1, 6 + (this.meta.upgrades['lantern'] ?? 0));
    }
    this.presenter.follow = this.meta.settings.cameraFollow;
    refreshVisibility(this.level, this.cs);
    this.presenter.setLevel(this.level); this.backdropHour = 0; this.view.setZoom(1); this.presenter.showBars = true;
    this.presenter.focusParty(true);
    const party = living(this.level, 'party');
    this.leaderId = (resumed && snap!.leaderId && party.some(u => u.id === snap!.leaderId)) ? snap!.leaderId : party[0]?.id; this.selectedId = this.leaderId; this.armed = undefined; this.seenKeeper = false;
    this.hud.show(true); this.hud.tooltip.hide();
    const hourNum = ['I', 'II', 'III', 'IV'][run.hour - 1];
    this.hud.setFloor(`Hour ${hourNum} · ${HOUR_NAMES[run.hour]}`, isKeeper ? 'The Keeper' : `Floor ${run.floor}`);
    this.refreshHud(); this.refreshOverlays();
    saveRun(run); this.snapshot();
    this.audio.playMusic(this.musicFor());
    if (resumed) { if (this.cs.phase === 'player' || this.cs.phase === 'enemy') { this.cs.phase = 'player'; this.audio.playMusic(isKeeper ? 'combat2' : 'combat'); } this.refreshHud(); this.refreshOverlays(); this.frameCombat(); return; }
    if (run.floor === 1 && !isKeeper || run.hour === 4) {
      this.meta.flags['reached_hour' + run.hour] = true; this.meta.bestHour = Math.max(this.meta.bestHour, run.hour); saveMeta(this.meta);
      await this.screens.intro(`Hour ${hourNum} · ${HOUR_NAMES[run.hour]}`, HOUR_INTRO[run.hour], run.hour === 4 ? 'The last Hour. There is only the Hearth.' : `Floor 1 of ${FLOORS_PER_HOUR}, then the Keeper. Find the stairs; at every stair you may climb out with your ember.`);
      const l = party[0]; if (l) this.bark(l, 'descend');
    } else if (isKeeper) {
      await this.screens.intro(`Hour ${hourNum} · The Keeper`, 'The galleries open out. Something has been waiting at the bottom of the stair.', 'A Keeper fight: defeat it and a stair opens to the next Hour. Keepers cannot be pushed.');
    }
    if (run.hour === 4) { // the Warm Hour: everything is lit and aware
      const ev: SimEvent[] = []; startCombat(this.level, this.cs, living(this.level, 'enemy'), ev, 'The dreaming notices you.'); await this.presenter.play(ev); this.afterEvents();
    }
  }

  /** Write the mid-floor snapshot. Cheap enough to call after every player action. */
  snapshot() {
    const run = this.run, L = this.level, cs = this.cs; if (!run || !L || !cs || this.presenter.busy) return;
    if (cs.phase === 'lost') return;
    const seed = (run.seed * 31 + run.hour * 101 + run.floor * 7) % 2147483647;
    saveRun(run);
    saveFloor({ hour: run.hour, floor: run.floor, seed, level: L, cs: { phase: cs.phase === 'enemy' ? 'player' : cs.phase, turn: cs.turn, aware: [...cs.aware], lanternRadius: cs.lanternRadius }, leaderId: this.leaderId, nextId: currentId(), shrineHour: run.shrineHour });
  }

  /** Copy level party state back into the run (between floors). */
  private syncRunParty() {
    const run = this.run!; const L = this.level!;
    for (const p of run.party) {
      const u = L.units.find(x => x.faction === 'party' && x.name === p.name);
      if (!u) continue;
      p.alive = u.alive; p.hp = Math.max(1, u.hp); p.maxHp = u.maxHp; p.boons = u.boons; p.mods = { ...u.mods }; delete p.mods['wick']; p.kills = u.kills;
      if ((u.mods['wick'] ?? 0) === 0 && this.meta.upgrades['wick']) run.wickUsed = true;
    }
  }

  // ------------------------------------------------------------------ input
  private bindInput() {
    const c = this.view.canvas;
    c.addEventListener('pointermove', e => { this.lastPointer = { x: e.clientX, y: e.clientY }; this.onHover(e.clientX, e.clientY); });
    c.addEventListener('pointerdown', e => { if (e.button === 0) this.onClick(e.clientX, e.clientY); else if (e.button === 2) this.onCancel(); });
    c.addEventListener('contextmenu', e => e.preventDefault());
    c.addEventListener('wheel', e => { this.view.zoomBy(e.deltaY > 0 ? 1 : -1); }, { passive: true });
    window.addEventListener('keydown', e => {
      if (this.mode !== 'run' || this.screens.isOpen) return;
      const k = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) { this.keys.add(k); this.view.follow = false; return; }
      if (e.key === ' ') { e.preventDefault(); if (this.cs?.phase === 'player') this.endTurn(); else if (this.cs?.phase === 'explore') this.autoExplore(); }
      else if (k === 'z') this.onCancel();
      else if (k === 'escape') { if (this.armed || this.walking) this.onCancel(); else this.openMenu(); }
      else if (k === 'tab') { e.preventDefault(); this.cycleSelect(); }
      else if (k === 'f') { this.meta.settings.cameraFollow = !this.meta.settings.cameraFollow; this.presenter.follow = this.meta.settings.cameraFollow; this.hud.log(this.meta.settings.cameraFollow ? 'Camera follows the party.' : 'Camera is free.'); if (this.meta.settings.cameraFollow) this.presenter.focusParty(); }
      else if (k === 'h') this.screens.help(() => { });
      else if (k === '=' || k === '+') this.view.zoomBy(-1); else if (k === '-') this.view.zoomBy(1);
      else if (/^[1-4]$/.test(k)) { const u = this.selected(); if (!u) return; if (k === '1') this.arm('attack'); else { const ab = u.def.abilities[+k - 2]; if (ab) this.arm(ab); } }
    });
    window.addEventListener('keyup', e => this.keys.delete(e.key.toLowerCase()));
  }
  update(dt: number) {
    if (this.mode !== 'run') { if (this.presenter.level) this.view.panBy(dt * 0.9, dt * 0.5); return; }
    const sp = 40 * dt * (this.view.zoomIndex + 1);
    let x = 0, y = 0;
    if (this.keys.has('w') || this.keys.has('arrowup')) y += sp; if (this.keys.has('s') || this.keys.has('arrowdown')) y -= sp;
    if (this.keys.has('a') || this.keys.has('arrowleft')) x -= sp; if (this.keys.has('d') || this.keys.has('arrowright')) x += sp;
    if (x || y) this.view.panScreen(x, y);
  }

  private cellAt(cx: number, cy: number): Vec2 | undefined {
    const w = this.view.screenToGround(cx, cy); if (!w || !this.level) return undefined;
    const g = View.worldToGrid(w); return inBounds(this.level, g) ? g : undefined;
  }
  private onScreen(p: Vec2, margin = 0.78): boolean {
    const s = this.view.worldToScreen(View.gridToWorld(p.x, p.y));
    const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
    return Math.abs(s.x - cx) < cx * margin && Math.abs(s.y - cy) < cy * margin;
  }
  /** Frame the party together with the visible enemies in the fight. */
  private frameCombat() {
    const L = this.level, cs = this.cs; if (!L || !cs) return;
    const party = living(L, 'party').map(u => u.pos);
    const foes = living(L, 'enemy').filter(e => cs.aware.has(e.id) && tileAt(L, e.pos)!.visible).map(e => e.pos);
    if (!party.length) return;
    const centroid = (pts: Vec2[]) => pts.reduce((a, p) => ({ x: a.x + p.x / pts.length, y: a.y + p.y / pts.length }), { x: 0, y: 0 });
    const pc = centroid(party);
    if (!foes.length) { this.view.lookAtGrid(pc.x, pc.y); return; }
    const fc = centroid(foes);
    this.view.lookAtGrid((pc.x + fc.x) / 2, (pc.y + fc.y) / 2);
    const span = Math.max(...party.concat(foes).map(p => cheb(p, { x: (pc.x + fc.x) / 2, y: (pc.y + fc.y) / 2 })));
    if (span > 7 && this.view.zoomIndex < 2) this.view.setZoom(2); else if (span <= 5 && this.view.zoomIndex > 1) this.view.setZoom(1);
  }
  selected(): Unit | undefined { return this.level?.units.find(u => u.id === this.selectedId && u.alive); }
  leader(): Unit | undefined { const L = this.level; if (!L) return; return L.units.find(u => u.id === this.leaderId && u.alive) ?? living(L, 'party')[0]; }
  partyUnits() { return this.level ? this.level.units.filter(u => u.faction === 'party') : []; }

  select(id: string) {
    const u = this.level?.units.find(x => x.id === id); if (!u || !u.alive) return;
    this.selectedId = id; if (this.cs?.phase === 'explore') this.leaderId = id;
    this.armed = undefined; this.audio.sfx('ui_click', 1, 0.3);
    if (this.cs?.phase === 'player' && !this.onScreen(u.pos)) this.view.lookAtGrid(u.pos.x, u.pos.y);
    this.refreshHud(); this.refreshOverlays();
  }
  cycleSelect() {
    const alive = living(this.level!, 'party'); if (!alive.length) return;
    const i = alive.findIndex(u => u.id === this.selectedId);
    const order = [...alive.slice(i + 1), ...alive.slice(0, i + 1)];
    const next = order.find(u => !u.acted) ?? order[0];
    this.select(next.id);
  }
  arm(id: string) {
    const u = this.selected(); if (!u || this.cs?.phase !== 'player') return;
    if (id !== 'attack' && id !== 'shadowstep' && u.acted) { this.hud.log(`${u.name.split(' ')[0]} has already acted.`, 'warn'); return; }
    if (id === 'attack' && u.acted) return;
    if (id !== 'attack' && (u.cooldowns[id] ?? 0) > 0) { this.hud.log(`${ABILITIES[id].name} is not ready.`, 'warn'); return; }
    if (ABILITIES[id]?.shape === 'self') { this.doAbility(u, id, u.pos); return; }
    this.armed = this.armed === id ? undefined : id; this.audio.sfx('ui_select', 1, 0.3);
    this.refreshHud(); this.refreshOverlays();
  }
  onCancel() {
    this.exploring = false;
    if (this.walking) { this.walkCancel = true; return; }
    if (this.armed) { this.armed = undefined; this.refreshHud(); this.refreshOverlays(); return; }
    const u = this.selected(); if (u && canUndo(u)) this.undo(u.id);
  }
  undo(id: string) {
    const u = this.level?.units.find(x => x.id === id); if (!u || !this.cs || this.presenter.busy) return;
    const ev: SimEvent[] = []; if (undoMove(this.level!, this.cs, u, ev)) { this.audio.sfx('ui_back', 1, 0.3); this.presenter.play(ev).then(() => this.afterEvents()); }
  }
  openMenu() {
    this.screens.menu({
      onResume: () => { }, onHelp: () => this.screens.help(() => { }),
      onSettings: () => this.screens.settings(this.meta.settings, s => { this.audio.setVolumes(s.sfx, s.music); saveMeta(this.meta); }, () => { }),
      onAbandon: async () => { if (await this.screens.confirm('Climb out now?', 'You keep nothing you have not banked. The descent ends.', 'Climb', 'Stay')) this.finishAscend(true); },
    });
  }

  // ------------------------------------------------------------------ hover & preview
  private onHover(cx: number, cy: number) {
    if (this.mode !== 'run' || !this.level || !this.cs || this.screens.isOpen) { this.hud.tooltip.hide(); return; }
    const cell = this.cellAt(cx, cy);
    if (!cell) { this.hoverCell = undefined; this.hud.tooltip.hide(); this.presenter.overlay.set('hover', []); this.presenter.overlay.setPath([]); this.presenter.overlay.set('footprint', []); return; }
    this.hoverCell = cell;
    const L = this.level, cs = this.cs, t = tileAt(L, cell)!;
    const ov = this.presenter.overlay;
    ov.set('hover', t.explored ? [cell] : []); ov.setPath([]); ov.set('footprint', []);
    const hu = unitAt(L, cell);
    let html = '';
    if (cs.phase === 'explore') {
      const leader = this.leader();
      if (hu && hu.faction === 'party') html = this.unitTip(hu);
      else if (hu && t.visible) html = this.unitTip(hu);
      else if (t.explored && t.prop && !['rubble'].includes(t.prop.kind)) html = this.propTip(t.prop.kind, t.prop);
      else if (t.explored && t.kind !== 'wall' && t.kind !== 'void' && t.kind !== 'stone') html = this.tileTip(t.kind);
      if (leader && t.explored && (t.kind !== 'wall')) { const p = this.explorePath(leader, cell); if (p) ov.setPath(p); }
    } else if (cs.phase === 'player') {
      const u = this.selected();
      if (hu && hu.faction === 'party') html = this.unitTip(hu) + (hu.id !== this.selectedId ? '<div class="hint">Click to select.</div>' : '');
      else if (u) {
        if (this.armed && this.armed !== 'attack') {
          const ab = ABILITIES[this.armed]; const valid = abilityTargets(L, u, this.armed);
          if (valid.some(p => eq(p, cell))) { ov.set('footprint', abilityFootprint(L, u, this.armed, cell)); html = `<h4>${ab.name}</h4>${this.previewAbility(u, this.armed, cell)}`; }
          else if (hu && t.visible) html = this.unitTip(hu);
          else html = `<h4>${ab.name}</h4><div class="hint">Not a valid target. Right-click to cancel.</div>`;
        } else if (!u.acted && t.prop && (t.prop.kind === 'barrel' || t.prop.kind === 'brazier') && !t.prop.broken && attackableProps(L, u).some(p => eq(p, cell))) {
          html = this.propTip(t.prop.kind, t.prop) + `<div class="preview">${this.previewProp(u, cell)}</div><div class="hint">Click to ${t.prop.kind === 'barrel' ? 'break it' : 'knock it over'}.</div>`;
        } else if (hu && hu.faction === 'enemy' && t.visible) {
          html = this.unitTip(hu);
          if (!u.acted && attackTargets(L, u).includes(hu)) html += `<div class="preview">${this.previewAttack(u, hu)}</div><div class="hint">Click to attack.</div>`;
          else if (!u.acted) html += `<div class="hint">${u.def.attackRange > 1 ? (cheb(u.pos, hu.pos) > u.def.attackRange ? `Out of range: ${cheb(u.pos, hu.pos)} tiles, range ${u.def.attackRange}.` : 'No line of sight.') : `${cheb(u.pos, hu.pos) - 1} tile${cheb(u.pos, hu.pos) - 1 > 1 ? 's' : ''} short. Click to move and strike if ${u.name.split(' ')[0]} can reach.`}</div>`;
        } else if (t.explored) {
          const reach = u.acted ? undefined : moveRange(L, u).get(key(cell));
          if (reach) {
            ov.setPath(pathFromReach(moveRange(L, u), cell, u.pos));
            const threats = threatTiles(L, cs).get(key(cell));
            html = `<h4>Move</h4><div class="row"><span>Cost</span><b>${reach.cost} of ${u.moveLeft}</b></div>${this.tileNote(t.kind)}${threats ? `<div class="intent">Struck here by ${threats.map(x => `${x.by.name} (${x.dmg})`).join(', ')}.</div>` : ''}<div class="hint">Click to move. Undo with right-click or Z until you act.</div>`;
          } else if (t.prop) html = this.propTip(t.prop.kind, t.prop);
          else if (t.kind !== 'stone' && t.kind !== 'wall') html = this.tileTip(t.kind);
        }
      }
    }
    if (html) this.hud.tooltip.show(html, cx, cy); else this.hud.tooltip.hide();
  }
  private tileNote(k: string) { return k === 'water' ? '<div class="muted">Water: costs 2 to enter; conducts lightning.</div>' : k === 'oil' ? '<div class="muted">Oil: burns and spreads.</div>' : k === 'ice' ? '<div class="muted">Ice: pushes slide one further.</div>' : k === 'vent' ? '<div class="muted">Heat vent: erupts on a count.</div>' : ''; }
  private tileTip(k: string) { const n: Record<string, string> = { stone: 'Stone floor', water: 'Black water', oil: 'Oil', ice: 'Ice', chasm: 'The drop', vent: 'Heat vent' }; return `<h4>${n[k] ?? k}</h4>${this.tileNote(k) || (k === 'chasm' ? '<div class="muted">Anything pushed in does not come back.</div>' : '')}`; }
  private propTip(k: string, p: NonNullable<Level['tiles'][number]['prop']>) {
    const m: Record<string, [string, string]> = {
      door: [p.open ? 'Open door' : 'Door', p.open ? 'Click to close it (costs the action in combat). Closed doors block sight and the Pale.' : 'Click to open. Closed doors block sight. The Pale cannot open them; the Spent can.'],
      brazier: [p.broken ? 'Fallen brazier' : 'Brazier', p.broken ? 'Burnt out.' : 'Click to knock it over: fire on the tiles beyond it, away from you. Costs the action in a fight. Pushing an enemy into it does the same.'], lamp: ['Street lamp', 'Still lit after two hundred years. Light carries sight.'],
      pillar: [p.broken ? 'Rubble' : 'Pillar', p.broken ? 'Blocks the way.' : 'Blocks line of sight. Slam an enemy into it for +2; Sunder breaks it.'], barrel: ['Oil barrel', 'Click to break it: oil spills on this tile and the four around it. Costs the action in a fight. Fire spreads along oil; Kindle lights it from a distance.'],
      chest: [p.used ? 'Empty chest' : 'Chest', p.used ? '' : 'Click to open.'], stairs: ['Stairs down', 'Click to descend or Ascend with your ember.'], shrine: ['A cold shrine', 'Bank the Lamp: a full rest, once per Hour.'],
      event: ['Something here', 'Click to look closer.'], ember: ['Ember', `Warm to the touch. ${p.amount ?? 1} ember.`], page: ['A page', 'Someone left this for whoever came after.'], niche: ['Niche', 'Badges and candles, carefully arranged.'], rubble: ['Rubble', ''],
    };
    const [a, b] = m[k] ?? [k, '']; return `<h4>${a}</h4><div>${b}</div>`;
  }
  private unitTip(u: Unit) {
    const arm = u.armourBroken ? 0 : u.armour + (u.mods['armour'] ?? 0);
    const base = `<h4>${u.name}</h4>${u.def.title ? `<div class="muted">${u.def.title}</div>` : ''}<div class="row"><span>HP</span><b>${u.hp}/${u.maxHp}</b></div><div class="row"><span>Armour</span><b>${arm}${u.armourBroken ? ' (broken)' : ''}</b></div><div class="row"><span>Attack</span><b>${u.def.attack}${u.def.attackRange > 1 ? ` · range ${u.def.attackRange}` : ''}</b></div><div class="row"><span>Move</span><b>${u.def.move + (u.mods['move'] ?? 0)}</b></div>`;
    const st = u.statuses.length ? `<div class="muted">${u.statuses.map(s => s.kind).join(', ')}</div>` : '';
    if (u.faction === 'enemy') {
      const role = ROLE_DESC[u.def.id] ? `<div class="muted" style="margin-top:4px">${ROLE_DESC[u.def.id]}</div>` : '';
      const it = u.intent ? `<div class="intent">Next: ${u.intent.label}${u.intent.kind === 'wait' ? '' : ' → ' + intentTiles(this.level!, u).map(p => { const t = unitAt(this.level!, p); return t ? t.name.split(' ')[0] : 'an empty tile'; }).filter((v, i, a) => a.indexOf(v) === i).join(', ')}</div>` : (this.cs?.phase === 'player' ? '<div class="intent">Has not committed yet.</div>' : '');
      return base + role + st + it;
    }
    return base + st;
  }

  private cloneSim(): { L: Level; cs: CombatState } {
    const L = structuredClone(this.level!) as Level;
    const cs: CombatState = { ...this.cs!, aware: new Set(this.cs!.aware), rng: new Rng(1), log: [] };
    return { L, cs };
  }
  private summarize(before: Level, events: SimEvent[], after: Level): string {
    const lines: string[] = [];
    const dmg = new Map<string, number>(); const died = new Set<string>(); const moved = new Map<string, Vec2>(); let fire = 0, broke: string[] = [], shock = false, heal = new Map<string, number>();
    for (const e of events) {
      if (e.t === 'damage') { if (e.kind === 'heal') heal.set(e.id, (heal.get(e.id) ?? 0) + e.amount); else dmg.set(e.id, (dmg.get(e.id) ?? 0) + e.amount); }
      if (e.t === 'die') died.add(e.id);
      if (e.t === 'move' && e.kind !== 'walk') moved.set(e.id, e.path[e.path.length - 1]);
      if (e.t === 'fire' && e.on) fire++;
      if (e.t === 'prop' && e.change === 'break' && e.prop) broke.push(e.prop.kind);
      if (e.t === 'shock' && e.tiles.length > 1) shock = true;
    }
    for (const [id, d] of dmg) { const u = before.units.find(x => x.id === id)!; const au = after.units.find(x => x.id === id)!; const first = u.faction === 'party' ? u.name.split(' ')[0] : u.name; const where = moved.get(id); const t = where ? tileAt(after, where) : undefined; lines.push(`${first}: ${d} damage${died.has(id) ? (t?.kind === 'chasm' ? ' — <b>falls</b>' : ' — <b>dies</b>') : ` → ${Math.max(0, au.hp)} HP`}${where && !died.has(id) ? ` (pushed to ${t?.kind === 'water' ? 'water' : t?.kind === 'oil' ? 'oil' : t?.fire ? 'fire' : 'a new tile'})` : ''}`); }
    for (const [id, p] of moved) if (!dmg.has(id)) { const u = before.units.find(x => x.id === id)!; const t = tileAt(after, p); lines.push(`${u.name}: pushed${died.has(id) ? ' — <b>falls</b>' : t?.kind === 'water' ? ' into water' : t?.kind === 'oil' ? ' onto oil' : ''}`); }
    for (const [id] of moved) { const au = after.units.find(x => x.id === id); if (!au || !au.alive || au.faction !== 'enemy' || !au.intent || au.intent.kind === 'wait') continue; const hits = intentTiles(after, au).map(q => unitAt(after, q)).filter((x): x is Unit => !!x); lines.push(hits.length ? `Its attack now lands on ${hits.map(h => h.name.split(' ')[0]).join(', ')}.` : 'Its attack now hits nothing.'); }
    for (const [id, h] of heal) lines.push(`${before.units.find(x => x.id === id)!.name}: heals ${h}`);
    if (shock) lines.push('Lightning spreads through the water.');
    if (fire) lines.push(`${fire} tile${fire > 1 ? 's' : ''} catch fire.`);
    for (const b of broke) lines.push(`The ${b} breaks.`);
    if (!lines.length) lines.push('No effect on anyone.');
    return lines.join('<br>');
  }
  private previewAttack(u: Unit, target: Unit): string {
    const { L, cs } = this.cloneSim(); const ev: SimEvent[] = [];
    const cu = L.units.find(x => x.id === u.id)!, ct = L.units.find(x => x.id === target.id)!;
    const { dmg, flanked } = attackDamage(L, cu, ct);
    basicAttack(L, cs, cu, ct, ev);
    return `${flanked ? '<div class="muted">Flanked: bonus damage.</div>' : ''}${dmg} damage${ct.armour && !ct.armourBroken ? ` (−${Math.min(dmg, ct.armour)} armour)` : ''}: ${this.summarize(this.level!, ev, L)}`;
  }
  private previewProp(u: Unit, target: Vec2): string {
    const { L, cs } = this.cloneSim(); const ev: SimEvent[] = [];
    const cu = L.units.find(x => x.id === u.id)!;
    attackProp(L, cs, cu, target, ev);
    const oil = ev.filter(e => e.t === 'tile' && (e as any).kind === 'oil').length; const fire = ev.filter(e => e.t === 'fire' && (e as any).on).length;
    const parts: string[] = [];
    if (oil) parts.push(`Oil spills on ${oil} tile${oil > 1 ? 's' : ''}.`);
    if (fire) parts.push(`${fire} tile${fire > 1 ? 's' : ''} catch fire.`);
    const hurt = this.summarize(this.level!, ev.filter(e => e.t === 'damage' || e.t === 'die' || e.t === 'move'), L);
    if (hurt !== 'No effect on anyone.') parts.push(hurt);
    return parts.join('<br>') || 'Nothing happens.';
  }
  private previewAbility(u: Unit, ab: string, target: Vec2): string {
    const { L, cs } = this.cloneSim(); const ev: SimEvent[] = [];
    const cu = L.units.find(x => x.id === u.id)!;
    const ok = useAbility(L, cs, cu, ab, target, ev);
    return ok ? `<div class="preview">${this.summarize(this.level!, ev, L)}</div><div class="hint">Click to confirm. Right-click to cancel.</div>` : '<div class="hint">Cannot be used there.</div>';
  }

  // ------------------------------------------------------------------ clicks
  private async onClick(cx: number, cy: number) {
    if (this.mode !== 'run' || !this.level || !this.cs || this.screens.isOpen || this.busyFlow) return;
    const cell = this.cellAt(cx, cy); if (!cell) return;
    const L = this.level, cs = this.cs, t = tileAt(L, cell)!;
    const hu = unitAt(L, cell);
    if (cs.phase === 'explore') {
      this.exploring = false;
      if (this.walking) { this.walkCancel = true; await this.waitWalk(); }
      if (hu && hu.faction === 'party') { this.select(hu.id); return; }
      if (!t.explored) { const near = this.nearestExplored(cell); if (near) this.walkTo(near); return; }
      if (t.prop && this.isInteractive(t.prop.kind, t.prop)) { this.walkTo(cell, true); return; }
      if (hu && hu.faction === 'enemy') { this.walkTo(cell, true); return; }
      if (walkable(L, cell)) this.walkTo(cell);
      return;
    }
    if (cs.phase !== 'player' || this.presenter.busy) return;
    if (hu && hu.faction === 'party' && !(this.armed && this.armed !== 'attack' && abilityTargets(L, this.selected()!, this.armed).some(p => eq(p, cell)))) { this.select(hu.id); return; }
    const u = this.selected(); if (!u) return;
    if (this.armed && this.armed !== 'attack') {
      if (abilityTargets(L, u, this.armed).some(p => eq(p, cell))) { await this.doAbility(u, this.armed, cell); }
      else { this.hud.log('Not a valid target.', 'warn'); this.audio.sfx('ui_error', 1, 0.3); }
      return;
    }
    if (hu && hu.faction === 'enemy' && t.visible) {
      if (u.acted) { this.hud.log(`${u.name.split(' ')[0]} has already acted.`, 'warn'); return; }
      if (attackTargets(L, u).includes(hu)) { const ev: SimEvent[] = []; basicAttack(L, cs, u, hu, ev); this.armed = undefined; await this.presenter.play(ev); this.afterEvents(); }
      else { // move adjacent then attack if possible
        const reach = moveRange(L, u); let best: Vec2 | undefined; let bc = 99;
        for (const r of reach.values()) { const ok = u.def.attackRange === 1 ? cheb(r.pos, hu.pos) === 1 : cheb(r.pos, hu.pos) <= u.def.attackRange; if (ok && r.cost < bc) { bc = r.cost; best = r.pos; } }
        if (best) { const ev: SimEvent[] = []; moveUnit(L, cs, u, best, ev); await this.presenter.play(ev); this.afterEvents(); if (attackTargets(L, u).includes(hu)) { const ev2: SimEvent[] = []; basicAttack(L, cs, u, hu, ev2); await this.presenter.play(ev2); this.afterEvents(); } }
        else { this.hud.log('Out of reach this turn.', 'warn'); this.audio.sfx('ui_error', 1, 0.3); }
      }
      return;
    }
    if (t.prop?.kind === 'door' && cheb(u.pos, cell) === 1) { const ev: SimEvent[] = []; if (interact(L, cs, u, cell, ev)) { await this.presenter.play(ev); this.afterEvents(); } return; }
    if (t.prop && (t.prop.kind === 'barrel' || t.prop.kind === 'brazier') && !t.prop.broken) {
      if (u.acted) { this.hud.log(`${u.name.split(' ')[0]} has already acted.`, 'warn'); return; }
      if (attackableProps(L, u).some(p => eq(p, cell))) { const ev: SimEvent[] = []; attackProp(L, cs, u, cell, ev); this.armed = undefined; await this.presenter.play(ev); this.afterEvents(); return; }
      // walk into reach first
      const reach = moveRange(L, u); let best: Vec2 | undefined; let bc = 99;
      for (const r of reach.values()) { const ok = u.def.attackRange === 1 ? cheb(r.pos, cell) === 1 : cheb(r.pos, cell) <= u.def.attackRange; if (ok && r.cost < bc) { bc = r.cost; best = r.pos; } }
      if (best) { const ev: SimEvent[] = []; moveUnit(L, cs, u, best, ev); await this.presenter.play(ev); this.afterEvents(); if (attackableProps(L, u).some(p => eq(p, cell))) { const ev2: SimEvent[] = []; attackProp(L, cs, u, cell, ev2); await this.presenter.play(ev2); this.afterEvents(); } }
      else { this.hud.log('Out of reach this turn.', 'warn'); }
      return;
    }
    if (!u.acted && moveRange(L, u).has(key(cell))) { const ev: SimEvent[] = []; moveUnit(L, cs, u, cell, ev); this.audio.sfx('ui_click', 1, 0.2); await this.presenter.play(ev); this.afterEvents(); return; }
    if (u.acted) this.hud.log(`${u.name.split(' ')[0]} has already acted. Select another Lamplighter or End Turn.`, 'warn');
  }
  private async doAbility(u: Unit, ab: string, target: Vec2) {
    const ev: SimEvent[] = [];
    if (!useAbility(this.level!, this.cs!, u, ab, target, ev)) { this.hud.log('Cannot do that there.', 'warn'); return; }
    this.armed = undefined; this.refreshHud(); this.refreshOverlays();
    await this.presenter.play(ev); this.afterEvents();
  }
  private isInteractive(k: string, p: { used?: boolean; broken?: boolean }) { return (k === 'door') || ((k === 'barrel' || k === 'brazier') && !p.broken) || (k === 'chest' && !p.used) || k === 'stairs' || (k === 'shrine' && !p.used && this.run?.shrineHour !== this.run?.hour) || (k === 'event' && !p.used) || (k === 'ember' && !p.used) || (k === 'page' && !p.used); }

  // ------------------------------------------------------------------ exploration
  private explorePath(leader: Unit, dest: Vec2): Vec2[] | null {
    const L = this.level!; const t = tileAt(L, dest)!;
    const blockingProp = !!t.prop && (t.prop.kind === 'chest' || (t.prop.kind === 'door' && !t.prop.open) || t.prop.kind === 'lamp' || t.prop.kind === 'niche' || ((t.prop.kind === 'barrel' || t.prop.kind === 'brazier') && !t.prop.broken) || (t.prop.kind === 'pillar' && !t.prop.broken));
    const enemy = unitAt(L, dest)?.faction === 'enemy';
    return findPath(L, leader.pos, dest, { unit: leader, adjacent: blockingProp || enemy, avoidUnits: false, penalty: p => (tileAt(L, p)!.explored ? 0 : 50) + (tileAt(L, p)!.fire ? 20 : 0) + (tileAt(L, p)!.kind === 'water' ? 1 : 0) });
  }
  private nearestExplored(cell: Vec2): Vec2 | undefined {
    const L = this.level!; let best: Vec2 | undefined; let bd = 1e9;
    for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) { const t = L.tiles[y * L.w + x]; if (!t.explored || !walkable(L, { x, y })) continue; const d = cheb({ x, y }, cell); if (d < bd) { bd = d; best = { x, y }; } }
    return best;
  }
  private waitWalk() { return new Promise<void>(r => { const t = () => this.walking ? setTimeout(t, 30) : r(); t(); }); }

  async walkTo(dest: Vec2, interactAtEnd = false) {
    const L = this.level!, cs = this.cs!; const leader = this.leader(); if (!leader || this.walking) return;
    const path = this.explorePath(leader, dest); if (!path) { this.hud.log('No way through.', 'warn'); return; }
    this.walking = true; this.walkCancel = false;
    this.presenter.overlay.setPath(path);
    try {
      while (path.length && !this.walkCancel && cs.phase === 'explore') {
        const ev: SimEvent[] = [];
        const r = exploreStep(L, cs, leader, path, ev);
        await this.presenter.play(ev);
        this.presenter.overlay.setPath(path);
        if (r.interrupted) { this.afterEvents(); this.frameCombat(); return; }
        if (this.meta.settings.cameraFollow) this.presenter.focusParty();
        this.refreshHud();
        // auto-pickup things we step on
        const here = tileAt(L, leader.pos)!;
        if (here.prop && (here.prop.kind === 'ember' || here.prop.kind === 'page') && !here.prop.used) { await this.useProp(leader.pos); }
        if (r.done) break;
      }
      this.presenter.overlay.setPath([]);
      if (interactAtEnd && !this.walkCancel && cs.phase === 'explore') {
        const t = tileAt(L, dest)!;
        if (t.prop && (cheb(leader.pos, dest) <= 1)) await this.useProp(dest);
      }
    } finally { this.walking = false; this.presenter.overlay.setPath([]); this.refreshOverlays(); this.snapshot(); }
  }

  autoExplore(): string {
    if (!this.level || !this.cs || this.cs.phase !== 'explore' || this.walking) return 'busy';
    const L = this.level; const leader = this.leader(); if (!leader) return 'no leader';
    const reach = reachable(L, leader.pos, 400, { unit: leader, avoidUnits: false, openDoors: true, penalty: p => tileAt(L, p)!.explored ? 0 : 1000 });
    let frontier: { pos: Vec2; cost: number } | undefined; let poi: { pos: Vec2; cost: number } | undefined;
    const consider = (r: { pos: Vec2; cost: number }) => {
      const t = tileAt(L, r.pos)!; if (!t.explored) return;
      if (t.prop && this.isInteractive(t.prop.kind, t.prop) && t.prop.kind !== 'stairs' && t.prop.kind !== 'door' && t.prop.kind !== 'barrel' && t.prop.kind !== 'brazier') { if (!poi || r.cost < poi.cost) poi = r; }
      if (t.prop?.kind === 'door' && !t.prop.open) { if (!poi || r.cost + 1 < poi.cost) poi = r; }
      let hasUnexplored = false; for (const d of DIRS8) { const n = tileAt(L, add(r.pos, d)); if (n && !n.explored && n.kind !== 'wall' && n.kind !== 'void') hasUnexplored = true; }
      if (hasUnexplored && !eq(r.pos, leader.pos) && (!frontier || r.cost < frontier.cost)) frontier = r;
    };
    for (const r of reach.values()) consider(r);
    consider({ pos: leader.pos, cost: 0 });
    const target = poi && (!frontier || poi.cost <= frontier.cost + 6) ? poi : frontier;
    const chain = async (dest: Vec2, interactAtEnd: boolean) => {
      this.exploring = true;
      await this.walkTo(dest, interactAtEnd);
      // keep going until something needs the player: combat, a screen, or nothing left
      if (this.exploring && this.cs?.phase === 'explore' && !this.screens.isOpen && !this.walkCancel) { this.exploring = false; setTimeout(() => { if (this.cs?.phase === 'explore' && !this.screens.isOpen && !this.walking) this.autoExplore(); }, 120); }
      else this.exploring = false;
    };
    if (target) { const tp = tileAt(L, target.pos)!.prop; chain(target.pos, !!tp && !(tp.kind === 'door' && tp.open)); return `walk ${target.pos.x},${target.pos.y} ${poi ? 'poi' : 'frontier'}`; }
    const stairs = L.tiles.findIndex(t => t.prop?.kind === 'stairs' && t.explored);
    if (stairs >= 0) { this.hud.log('Nothing else to find. Walking to the stairs.'); this.walkTo({ x: stairs % L.w, y: Math.floor(stairs / L.w) }, true); return 'stairs'; }
    this.hud.log('Nowhere obvious left to go.'); return 'nothing';
  }

  /** Use the prop at a cell: doors, chests, ember, pages, events, shrine, stairs. */
  private async useProp(pos: Vec2) {
    const L = this.level!, cs = this.cs!, run = this.run!; const t = tileAt(L, pos)!; const p = t.prop; if (!p) return;
    const leader = this.leader()!;
    switch (p.kind) {
      case 'door': { const ev: SimEvent[] = []; interact(L, cs, leader, pos, ev); await this.presenter.play(ev); this.afterEvents(); return; }
      case 'chest': { p.used = true; run.ember += 2; this.audio.sfx('latch', 1, 0.6); this.audio.sfx('coins', 1, 0.6); this.presenter.world?.rebuildProps(); this.hud.log('2 ember, and a little warmth for everyone: +2 HP.', 'story'); for (const u of living(L, 'party')) u.hp = Math.min(u.maxHp, u.hp + 2); this.refreshHud(); return; }
      case 'ember': { p.used = true; t.prop = undefined; run.ember += p.amount ?? 1; this.audio.sfx('pickup0', 1, 0.5); this.presenter.world?.rebuildProps(); this.hud.log(`+${p.amount ?? 1} ember.`); this.refreshHud(); return; }
      case 'page': { p.used = true; t.prop = undefined; this.presenter.world?.rebuildProps(); this.audio.sfx('page', 1, 0.6); if (p.pageId && !this.meta.pagesFound.includes(p.pageId)) { this.meta.pagesFound.push(p.pageId); run.pagesThisRun.push(p.pageId); saveMeta(this.meta); } await this.screens.page(p.pageId ?? 1); this.refreshHud(); return; }
      case 'shrine': {
        if (run.shrineHour === run.hour) { this.hud.log('The shrine is cold. Once per Hour.', 'warn'); return; }
        if (await this.screens.confirm('Bank the Lamp', 'Rest here. Everyone heals fully. Once per Hour.', 'Rest', 'Not yet')) { run.shrineHour = run.hour; p.used = true; for (const u of living(L, 'party')) { u.hp = u.maxHp; } this.audio.sfx('magic', 1, 0.5); this.hud.banner('The Lamp is banked', 'Everyone heals.', 2000); this.refreshHud(); }
        return;
      }
      case 'event': { if (p.used) return; const card = EVENTS.find(e => e.id === p.eventId) ?? EVENTS.find(e => e.hour.includes(run.hour) && !run.eventsSeen.includes(e.id)) ?? EVENTS[0]; p.used = true; this.presenter.world?.rebuildProps(); await this.runEvent(card); this.snapshot(); return; }
      case 'stairs': { await this.stairsFlow(); return; }
      case 'barrel': case 'brazier': {
        if (p.broken) return;
        const ok = await this.screens.confirm(p.kind === 'barrel' ? 'Break the barrel?' : 'Knock the brazier over?', p.kind === 'barrel' ? 'Oil spills on this tile and the four around it. Fire spreads along oil. The noise may carry.' : 'Fire on the tiles beyond it, away from you. The noise may carry.', p.kind === 'barrel' ? 'Break it' : 'Knock it over', 'Leave it');
        if (!ok) return;
        const ev: SimEvent[] = []; if (attackProp(L, cs, leader, pos, ev)) { await this.presenter.play(ev); this.afterEvents(); }
        return;
      }
    }
  }

  private async runEvent(card: EventCard) {
    const run = this.run!; const L = this.level!;
    const seen = run.eventsSeen.includes(card.id) || !!this.meta.flags['seen_' + card.id];
    run.eventsSeen.push(card.id); this.meta.flags['seen_' + card.id] = true;
    this.audio.sfx('book_open', 1, 0.5);
    const choice = await this.screens.event(card, living(L, 'party').map(u => u.def.id), seen);
    await this.applyEffects(choice);
    saveMeta(this.meta); this.refreshHud();
  }
  private async applyEffects(choice: EventChoice) {
    const run = this.run!, L = this.level!, cs = this.cs!;
    const party = living(L, 'party'); const leader = this.leader()!;
    for (const eff of choice.effect.split(';')) {
      const [k, a, b] = eff.split(':');
      switch (k) {
        case 'ember': run.ember = Math.max(0, run.ember + (+a)); this.hud.log(`${+a >= 0 ? '+' : ''}${a} ember.`); break;
        case 'heal': { const n = +a; for (const u of party) u.hp = Math.min(u.maxHp, u.hp + n); this.audio.sfx('magic', 1, 0.5); break; }
        case 'damage': { const who = a === 'leader' ? leader : party.find(u => u.def.id === a) ?? leader; who.hp = Math.max(1, who.hp - (+b)); this.presenter.fx.number(who.pos, b, 'fire'); break; }
        case 'relic': { if (a === 'badge') { leader.mods['armour'] = (leader.mods['armour'] ?? 0) + 1; this.hud.log(`${leader.name.split(' ')[0]} pins on the badge: +1 armour.`, 'story'); } else { run.ember += 2; for (const u of party) u.hp = Math.min(u.maxHp, u.hp + 3); this.hud.log('Something useful: +2 ember, everyone heals 3.', 'story'); } break; }
        case 'flag': run.flags[a] = true; this.meta.flags[a] = true; break;
        case 'page': { const left = Object.keys(CHOIR_PAGES).map(Number).filter(i => !this.meta.pagesFound.includes(i)); if (left.length) { const id = Math.min(...left); this.meta.pagesFound.push(id); run.pagesThisRun.push(id); this.audio.sfx('page', 1, 0.6); await this.screens.page(id); } else this.hud.log('You have every page there is.'); break; }
        case 'extra': { const def = ENEMY_DEFS[a]; const n = +b; const rooms = L.rooms.filter(r => r.role === 'combat' && L.units.some(u => u.alive && u.faction === 'enemy' && tileAt(L, u.pos)!.room === r.id)); const room = rooms[0]; if (def && room) { let placed = 0; for (let tries = 0; tries < 60 && placed < n; tries++) { const p = { x: room.x + Math.floor(Math.random() * room.w), y: room.y + Math.floor(Math.random() * room.h) }; if (walkable(L, p) && !unitAt(L, p) && !tileAt(L, p)!.visible) { L.units.push(makeUnit(def, p)); placed++; } } this.hud.log('Wet footprints, closer than before.', 'warn'); } break; }
        case 'ambush': { const enemies = living(L, 'enemy'); if (!enemies.length) break; const spots: Vec2[] = []; for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) { const p = add(leader.pos, { x: dx, y: dy }); if (inBounds(L, p) && walkable(L, p) && !unitAt(L, p) && cheb(p, leader.pos) >= 3 && tileAt(L, p)!.room === tileAt(L, leader.pos)!.room) spots.push(p); } for (const e of enemies) { if (!spots.length) break; const i = Math.floor(Math.random() * spots.length); e.pos = spots.splice(i, 1)[0]; } this.presenter.sync(); const ev: SimEvent[] = []; refreshVisibility(L, cs); startCombat(L, cs, living(L, 'enemy'), ev, 'The whole floor comes for you.'); await this.presenter.play(ev); this.afterEvents(); break; }
        case 'lantern': cs.lanternRadius = Math.max(3, cs.lanternRadius + (+a)); refreshVisibility(L, cs); this.presenter.world?.updateVisibility(); break;
        case 'bark': { const u = party.find(x => x.def.id === a); if (u) this.bark(u, 'kill'); break; }
        case 'mod': { const u = party.find(x => x.def.id === a); if (u) u.mods[b] = (u.mods[b] ?? 0) + 1; break; }
        case 'wish': { const u = party[Math.floor(Math.random() * party.length)]; const ab = u.def.abilities[Math.floor(Math.random() * u.def.abilities.length)]; u.mods[ab + '_cd'] = (u.mods[ab + '_cd'] ?? 0) - 1; this.hud.log(`${u.name.split(' ')[0]}'s ${ABILITIES[ab].name} comes back faster.`, 'story'); break; }
        case 'grief': { const u = party.find(x => x.def.id === 'knight'); if (u) { u.hp = Math.max(1, u.hp - 3); u.mods['attack'] = (u.mods['attack'] ?? 0) + 2; this.presenter.fx.bark(u.pos, 'Tam.'); } break; }
        case 'foresight': case 'buff': case 'none': default: break;
      }
    }
    this.refreshHud();
  }

  private async stairsFlow() {
    const run = this.run!; const L = this.level!;
    const alive = living(L, 'party');
    const short = alive.length < 3 && run.party.filter(p => p.alive).length < 3;
    const opts = [
      { text: 'Go deeper', stake: (short ? 'You are short-handed. Deeper is allowed, but the guild would not advise it. ' : L.meta.isKeeper ? `Hour ${['I', 'II', 'III', 'IV'][run.hour]} · ${HOUR_NAMES[run.hour + 1]}. ` : `Hour ${['I', 'II', 'III', 'IV'][run.hour - 1]}${run.floor >= FLOORS_PER_HOUR ? ': the Keeper waits below. ' : `, floor ${run.floor + 1}. `}`) + 'A breath on the stair: everyone heals 2.' },
      { text: 'Ascend', stake: `Climb out with ${run.ember} ember. The descent ends; the Vigil banks it.` },
      { text: 'Stay', stake: 'Not yet.' },
    ];
    const c = await this.screens.choice('The stair', 'Cold air rises from below. You can hear water, or breathing.', opts);
    if (c === 0) await this.descend(); else if (c === 1) await this.finishAscend(false);
  }

  private async descend() {
    const run = this.run!; this.syncRunParty();
    const wasKeeper = run.floor > FLOORS_PER_HOUR;
    if (wasKeeper || run.hour === 4) { if (run.hour === 4) return; run.hour = (run.hour + 1) as Run['hour']; run.floor = 1; }
    else run.floor++;
    for (const p of run.party) if (p.alive) p.hp = Math.min(p.maxHp, p.hp + 2);
    saveFloor(undefined);
    const first = this.leader(); if (first) this.bark(first, 'descend');
    this.audio.sfx('door_heavy', 1, 0.5);
    saveRun(run);
    await this.loadFloor();
  }

  // ------------------------------------------------------------------ combat
  async endTurn() {
    const L = this.level, cs = this.cs; if (!L || !cs || cs.phase !== 'player' || this.presenter.busy || this.busyFlow) return;
    const unspent = living(L, 'party').filter(u => !u.acted && (attackTargets(L, u).length > 0 || u.def.abilities.some(ab => (u.cooldowns[ab] ?? 0) === 0 && ABILITIES[ab].shape !== 'self' && abilityTargets(L, u, ab).some(p => unitAt(L, p)?.faction === 'enemy'))));
    if (unspent.length && this.meta.settings.confirmEndTurn) {
      const ok = await this.screens.confirm('End the turn?', `${unspent.map(u => u.name.split(' ')[0]).join(', ')} could still strike something.`, 'End turn anyway', 'Wait');
      if (!ok) return;
    }
    this.armed = undefined;
    const ev: SimEvent[] = [];
    endPlayerTurn(L, cs, ev);
    this.run!.turnsTaken++;
    this.hud.setPhase('enemy', 0, living(L, 'party').length); this.refreshOverlays();
    await this.presenter.play(ev);
    this.afterEvents();
    if (cs.phase === 'player') { this.hud.banner('Your turn', '', 600); const first = living(L, 'party').find(u => !u.acted); if (first) { this.selectedId = first.id; } if (this.meta.settings.cameraFollow) this.frameCombat(); this.refreshHud(); this.refreshOverlays(); await this.checkKeeperBeats(); }
  }

  /** After any sim change: HUD, overlays, and phase transitions (won/lost). */
  afterEvents() {
    const L = this.level, cs = this.cs; if (!L || !cs) return;
    this.presenter.sync();
    if (!living(L, 'party').length && cs.phase !== 'lost') cs.phase = 'lost';
    // party deaths this moment
    for (const u of L.units) if (u.faction === 'party' && !u.alive && !u.mods['_written']) { u.mods['_written'] = 1; this.writeName(u); }
    if (cs.phase === 'player') { const sel = this.selected(); if (!sel || sel.acted) { const next = living(L, 'party').find(u => !u.acted); if (next) this.selectedId = next.id; } }
    if (cs.phase === 'explore') { this.armed = undefined; const lead = this.leader(); if (lead) this.leaderId = lead.id, this.selectedId = lead.id; }
    this.refreshHud(); this.refreshOverlays();
    this.onHover(this.lastPointer.x, this.lastPointer.y);
    if (cs.phase === 'lost') { this.lanternOut(); return; }
    this.snapshot();
    if (cs.phase === 'explore' && (cs as any)._wonPending) { (cs as any)._wonPending = false; }
  }

  private writeName(u: Unit) {
    const run = this.run!; const L = this.level!;
    const cause = (() => { const t = tileAt(L, u.pos); return t?.kind === 'chasm' ? 'the dark below' : u.statuses.some(s => s.kind === 'burning') ? 'the fire' : 'wounds'; })();
    const text = epitaph(u.name, u.def.title ?? 'Lamplighter', HOUR_NAMES[run.hour], run.hour, u.lastAction, cause);
    this.meta.book.push({ text, run: this.meta.runs, name: u.name });
    const r = this.meta.roster.find(x => x.name === u.name); if (r) { r.alive = false; this.meta.roster.push(recruit(this.meta, r.classId)); }
    const pm = run.party.find(p => p.name === u.name); if (pm) pm.alive = false;
    const others = living(L, 'party'); if (others.length) this.bark(others[0], 'ally_down');
    saveMeta(this.meta); saveRun(run);
  }

  private bark(u: Unit, kind: string) { const lines = BARKS[u.def.id]?.[kind]; if (lines && Math.random() < 0.8) this.presenter.fx.bark(u.pos, lines[Math.floor(Math.random() * lines.length)]); }

  private async checkKeeperBeats() {
    const L = this.level!, cs = this.cs!, run = this.run!;
    const keeper = L.units.find(u => u.def.flags?.includes('keeper'));
    if (!keeper) return;
    if (!this.seenKeeper && cs.aware.has(keeper.id)) { this.seenKeeper = true; const kl = KEEPER_LINES[keeper.def.id]; if (kl) this.hud.banner(keeper.name, kl.before, 4500); }
    if (keeper.def.id === 'prelate' && keeper.alive && keeper.hp <= 12 && !run.flags['prelate_offered']) {
      run.flags['prelate_offered'] = true; this.busyFlow = true;
      const c = await this.screens.choice('The Prelate lowers his staff', '"Enough. Listen. Eleven thousand people. Forty towns. The thing below does not die of this; it only hurts, and the ember grows, and the children live. Take what you came for and go up, and I will not tell the Church you were here."\n\nHe is bleeding light.', [
        { text: 'Take the deal.', stake: '+4 ember. The fight ends now. The fires stay lit, so the ending where you put them out will be closed to you.' },
        { text: 'Refuse.', stake: 'Finish it. Someone will have to feed it tonight.' },
      ]);
      this.busyFlow = false;
      if (c === 0) {
        run.flags['prelate_deal'] = true; run.ember += 4;
        const ev: SimEvent[] = [];
        for (const e of living(L, 'enemy')) { e.alive = false; e.hp = 0; ev.push({ t: 'die', id: e.id, cause: 'the deal' }); }
        cs.aware.clear(); cs.phase = 'explore'; ev.push({ t: 'combatEnd', won: true });
        for (const p of living(L, 'party')) { p.acted = false; p.moveLeft = p.move; }
        await this.presenter.play(ev); this.afterEvents();
        this.hud.banner('Warmth for the living', '"Mind the stairs."', 3000);
      }
    }
  }

  // ------------------------------------------------------------------ boons, endings, death
  private wonFight = async () => {
    const L = this.level!, run = this.run!;
    const keeper = L.units.find(u => u.def.flags?.includes('keeper'));
    if (keeper && !keeper.alive && !run.keepersSlain.includes(keeper.def.id)) {
      run.keepersSlain.push(keeper.def.id); const kl = KEEPER_LINES[keeper.def.id];
      if (keeper.def.id === 'hearth') { await this.hearthEnding(); return; }
      run.ember += 5; this.hud.banner(`${keeper.name} is still`, kl?.after ?? '', 4500);
      // a stair appears where the keeper fell
      const t = tileAt(L, keeper.pos)!; t.prop = { kind: 'stairs' }; const kt = t; if (kt.kind !== 'stone') kt.kind = 'stone'; this.presenter.world?.rebuildAll();
      this.hud.log('A stair opens where the Keeper stood.', 'story');
    }
    const party = living(L, 'party'); if (!party.length) return;
    for (const u of party) u.hp = Math.min(u.maxHp, u.hp + 2);
    this.hud.log('You bind what you can: everyone recovers 2.', 'story'); this.refreshHud();
    const rng = new Rng(run.seed + run.turnsTaken * 13 + run.hour * 7);
    const count = 3 + (this.meta.upgrades['boons'] ?? 0);
    // each offered boon is pre-assigned to a Lamplighter
    const offers: { boon: Boon; unit: Unit }[] = [];
    const shuffled = rng.shuffle([...party]);
    for (let i = 0; i < count; i++) {
      const u = shuffled[i % shuffled.length];
      const pool = boonsFor(u, run.hour, rng, 6).filter(b => !offers.some(o => o.boon.id === b.id));
      const b = pool.find(x => x.classId) && i % 2 === 0 ? pool.find(x => x.classId)! : pool[0]; if (b) offers.push({ boon: b, unit: u });
    }
    if (!offers.length) return;
    this.busyFlow = true;
    const picked = await this.screens.boon('The Lantern', offers.map(o => ({ ...o.boon, desc: `<b>${o.unit.name.split(' ')[0]}</b>: ${o.boon.desc}` })));
    const o = offers.find(x => x.boon.id === picked.id)!;
    o.boon.apply(o.unit); o.unit.boons.push(o.boon.id); this.audio.sfx('win', 1, 0.4);
    this.busyFlow = false; this.refreshHud();
    const first = party[0]; this.bark(first, 'kill');
  };

  private async hearthEnding() {
    const run = this.run!; const L = this.level!;
    const hasKeeper = living(L, 'party').some(u => u.def.id === 'mage' || u.def.id === 'ranger');
    const allPages = this.meta.pagesFound.length >= 12;
    this.busyFlow = true;
    const c = await this.screens.choice('The Hearth', 'The dreaming stops. The warmth comes up through your boots like a held breath, and holds.\n\nIt is not a god. It only hurts. Around you, in the alcoves, the Kept sleep on, smiling. Above you, eleven thousand people are about to eat.', [
      { text: 'Bank the fire.', stake: 'Leave the Stokeworks burning. Caddow prospers. The Kept sleep on. Warmth for the living.' },
      { text: 'Let it go out.', stake: run.flags['prelate_deal'] ? 'You took the Prelate\'s deal. The fires are his now.' : 'Quench the heart. The ember stops. The Kept wake, old. Cold is honest.', disabled: !!run.flags['prelate_deal'] },
      { text: 'Keep the Vigil.', stake: allPages && hasKeeper ? 'Someone stays. Sits with it. Does not sleep.' : `Needs every Choir Page (${this.meta.pagesFound.length}/12) and Ysolde or Hal present to understand what sitting with it would mean.`, disabled: !(allPages && hasKeeper) },
    ]);
    const id = ['bank', 'quench', 'keep'][c]; const e = ENDINGS[id];
    this.meta.endings.push(id); this.meta.fever++; this.meta.emberBanked += run.ember + 10; this.meta.emberTotal += run.ember + 10;
    if (id === 'keep') { const who = living(L, 'party').find(u => u.def.id === 'mage') ?? living(L, 'party')[0]; this.meta.book.push({ text: `${who.name}. ${who.def.title}. Kept.`, run: this.meta.runs, name: who.name }); const r = this.meta.roster.find(x => x.name === who.name); if (r) { r.alive = false; this.meta.roster.push(recruit(this.meta, r.classId)); } }
    saveMeta(this.meta); saveRun(undefined); saveFloor(undefined); this.run = undefined;
    this.audio.playMusic('ending');
    await this.screens.ending(e.title, e.text);
    this.busyFlow = false;
    this.lastRunSummary = { died: false, ascended: true, emberBrought: 10 };
    this.showHub();
  }

  private async finishAscend(abandon: boolean) {
    const run = this.run!; if (!run) return;
    this.syncRunParty();
    const ember = abandon ? 0 : run.ember;
    this.meta.emberBanked += ember; this.meta.emberTotal += ember; this.meta.ascended++;
    if (run.hour >= 2 && !abandon) this.meta.fever = Math.min(6, this.meta.fever + 1);
    for (const p of run.party) { const r = this.meta.roster.find(x => x.name === p.name); if (r && p.alive) { r.runs++; r.kills += p.kills; } }
    saveMeta(this.meta); saveRun(undefined); saveFloor(undefined);
    this.lastRunSummary = { died: false, ascended: true, emberBrought: ember, lost: run.party.filter(p => !p.alive).map(p => p.name) };
    this.run = undefined; this.audio.sfx('win', 1, 0.5);
    if (!abandon) await this.screens.ascended(ember, this.level!.meta.hour);
    this.showHub();
  }

  private async lanternOut() {
    const run = this.run!; if (!run) return;
    this.busyFlow = true;
    this.meta.deaths++;
    const banked = this.meta.upgrades['cage'] ? Math.floor(run.ember / 2) : 0;
    this.meta.emberBanked += banked; this.meta.emberTotal += banked;
    const entries = this.meta.book.filter(b => b.run === this.meta.runs).map(b => b.text);
    saveMeta(this.meta); saveRun(undefined); saveFloor(undefined);
    this.audio.stopMusic(2);
    await new Promise(r => setTimeout(r, 900));
    await this.screens.death(entries, `${HOUR_NAMES[run.hour]}, Hour ${['I', 'II', 'III', 'IV'][run.hour - 1]}.${banked ? ` The Ember Cage brings ${banked} ember home.` : ''}`);
    this.busyFlow = false;
    this.lastRunSummary = { died: true, ascended: false, emberBrought: banked };
    this.run = undefined;
    this.showHub();
  }

  // ------------------------------------------------------------------ HUD & overlays
  refreshHud() {
    const L = this.level, cs = this.cs; if (!L || !cs) return;
    const party = this.partyUnits();
    this.hud.renderParty(party, this.selectedId, u => canUndo(u), cs.phase);
    this.hud.renderHotbar(this.selected(), this.armed, cs.phase);
    const alive = living(L, 'party'); const acted = alive.filter(u => u.acted).length;
    this.hud.setPhase(cs.phase, acted, alive.length, ((this.meta.flags as any)['_fights'] ?? 0) <= 3);
    if (this.meta.settings.autoEndTurn && cs.phase === 'player' && alive.length && acted >= alive.length && !this.armed && !this.presenter.busy && !this.screens.isOpen) { clearTimeout(this.autoEndTimer); this.autoEndTimer = window.setTimeout(() => { if (this.cs?.phase === 'player' && living(this.level!, 'party').every(u => u.acted)) this.endTurn(); }, 900); }
    this.hud.setResources(this.run?.ember ?? 0, this.meta.pagesFound.length, this.meta.runs);
    for (const a of this.presenter.actors.values()) a.setSelected(a.unit.id === this.selectedId && a.unit.alive && cs.phase === 'player');
  }
  refreshOverlays() {
    const L = this.level, cs = this.cs; const ov = this.presenter.overlay; if (!L || !cs) return;
    ov.clear();
    if (cs.phase !== 'player' && cs.phase !== 'enemy') return;
    const threats = threatTiles(L, cs); ov.set('threat', [...threats.keys()].map(k => { const [x, y] = k.split(',').map(Number); return { x, y }; }));
    const u = this.selected(); if (!u || cs.phase !== 'player') return;
    if (this.armed && this.armed !== 'attack') { ov.set('ability', abilityTargets(L, u, this.armed)); return; }
    if (!u.acted) { ov.set('reach', [...moveRange(L, u).values()].map(r => r.pos)); ov.set('attack', attackTargets(L, u).map(e => e.pos).concat(attackableProps(L, u))); }
  }
}
