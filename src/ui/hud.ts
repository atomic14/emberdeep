/** In-run HUD: party portraits, hotbar, Hold button, banners, log and tooltip. Plain DOM. */
import type { Unit, Phase } from '../sim/types';
import { ABILITIES } from '../content/abilities';

export class Tooltip {
  el: HTMLDivElement;
  constructor(root: HTMLElement) { this.el = document.createElement('div'); this.el.id = 'tooltip'; this.el.className = 'panel'; root.appendChild(this.el); }
  show(html: string, x: number, y: number) {
    this.el.innerHTML = html; this.el.classList.add('show');
    const w = this.el.offsetWidth, h = this.el.offsetHeight;
    let left = x + 18, top = y + 18;
    if (left + w > window.innerWidth - 8) left = x - w - 14;
    if (top + h > window.innerHeight - 8) top = y - h - 14;
    this.el.style.left = left + 'px'; this.el.style.top = top + 'px';
  }
  hide() { this.el.classList.remove('show'); }
}

export class Hud {
  el: HTMLDivElement;
  party: HTMLDivElement; hotbar: HTMLDivElement; endTurn: HTMLButtonElement; explore: HTMLButtonElement; bannerEl: HTMLDivElement; logEl: HTMLDivElement; floorEl: HTMLDivElement; resEl: HTMLDivElement;
  tooltip: Tooltip;
  onSelect?: (id: string) => void; onAbility?: (id: string) => void; onEndTurn?: () => void; onExplore?: () => void; onUndo?: (id: string) => void; onMenu?: () => void; onHelp?: () => void;
  private bannerTimer?: number;
  private logTimer?: number;

  constructor(root: HTMLElement) {
    this.el = document.createElement('div'); this.el.id = 'hud'; root.appendChild(this.el);
    this.el.innerHTML = `
      <div id="topbar">
        <div id="floorname" class="panel"></div>
        <div style="display:flex;gap:8px;align-items:flex-start">
          <div id="resources" class="panel"></div>
          <button id="helpbtn" title="Controls (H)">?</button>
          <button id="menubtn" title="Menu (Esc)">☰</button>
        </div>
      </div>
      <div id="banner"></div>
      <div id="log"></div>
      <div id="party"></div>
      <div id="hotbar"></div>
      <button id="explore" title="Walk to the nearest unexplored place (Space)">Explore</button>
      <button id="endturn" class="primary" title="End your turn (Space)">Hold</button>`;
    this.party = this.el.querySelector('#party')!; this.hotbar = this.el.querySelector('#hotbar')!;
    this.endTurn = this.el.querySelector('#endturn')!; this.explore = this.el.querySelector('#explore')!;
    this.bannerEl = this.el.querySelector('#banner')!; this.logEl = this.el.querySelector('#log')!; this.floorEl = this.el.querySelector('#floorname')!; this.resEl = this.el.querySelector('#resources')!;
    this.tooltip = new Tooltip(root);
    this.endTurn.onclick = () => this.onEndTurn?.(); this.explore.onclick = () => this.onExplore?.();
    (this.el.querySelector('#menubtn') as HTMLButtonElement).onclick = () => this.onMenu?.();
    (this.el.querySelector('#helpbtn') as HTMLButtonElement).onclick = () => this.onHelp?.();
  }
  show(on: boolean) { this.el.style.display = on ? '' : 'none'; if (!on) this.tooltip.hide(); }

  setFloor(name: string, sub: string) { this.floorEl.innerHTML = `${name}<small>${sub}</small>`; }
  setResources(ember: number, pages: number, run: number) { this.resEl.innerHTML = `<span><span class="ember">◆</span> ${ember} ember</span><span class="muted">${pages}/12 pages</span><span class="muted">Descent ${run}</span>`; }

  setPhase(phase: Phase, allActed: boolean) {
    const combat = phase === 'player' || phase === 'enemy';
    this.endTurn.style.display = combat ? '' : 'none'; this.explore.style.display = combat ? 'none' : '';
    this.endTurn.disabled = phase !== 'player';
    this.endTurn.classList.toggle('pulse', phase === 'player' && allActed);
    this.endTurn.textContent = phase === 'enemy' ? 'Theirs…' : 'Hold';
  }

  renderParty(units: Unit[], selectedId: string | undefined, canUndo: (u: Unit) => boolean, phase: Phase) {
    this.party.innerHTML = '';
    for (const u of units) {
      const d = document.createElement('div');
      d.className = 'portrait panel' + (u.id === selectedId ? ' selected' : '') + (u.alive ? '' : ' dead');
      const arm = u.armourBroken ? 0 : u.armour + (u.mods['armour'] ?? 0);
      const first = u.name.split(' ')[0];
      const st = u.statuses.map(s => `<span title="${s.kind}">${({ burning: '🔥', rooted: '📌', marked: '🎯', guarded: '✋', bulwark: '⛨', hidden: '💨' } as Record<string, string>)[s.kind] ?? s.kind}</span>`).join('');
      d.innerHTML = `<div class="statuses">${st}</div><div class="name"><span>${first}</span><span class="muted">${u.hp}/${u.maxHp}</span></div><div class="title">${u.def.title ?? ''}</div>
        <div class="bar"><i style="width:${100 * u.hp / u.maxHp}%"></i></div>
        <div class="stats"><span>⛨ <b>${arm}</b></span><span>⚔ <b>${u.def.attack + (u.mods['attack'] ?? 0)}</b></span><span>👣 <b>${phase === 'player' ? u.moveLeft : u.move + (u.mods['move'] ?? 0)}</b></span></div>
        ${phase === 'player' && u.alive ? `<div class="acted">${u.acted ? 'ACTED' : canUndo(u) ? '<u>undo</u>' : ''}</div>` : ''}`;
      d.onclick = (ev) => { const t = ev.target as HTMLElement; if (t.tagName === 'U') { this.onUndo?.(u.id); return; } this.onSelect?.(u.id); };
      d.onmouseenter = (ev) => this.tooltip.show(`<h4>${u.name}</h4><div class="muted">${u.def.title}</div><div class="row"><span>HP</span><b>${u.hp}/${u.maxHp}</b></div><div class="row"><span>Armour</span><b>${arm}</b></div><div class="row"><span>Attack</span><b>${u.def.attack + (u.mods['attack'] ?? 0)}${u.def.attackRange > 1 ? ` (range ${u.def.attackRange})` : ''}</b></div><div class="row"><span>Move</span><b>${u.move + (u.mods['move'] ?? 0)}</b></div>${u.boons.length ? `<div class="hint">Boons: ${u.boons.join(', ')}</div>` : ''}`, ev.clientX, ev.clientY);
      d.onmouseleave = () => this.tooltip.hide();
      this.party.appendChild(d);
    }
  }

  renderHotbar(u: Unit | undefined, armed: string | undefined, phase: Phase) {
    this.hotbar.innerHTML = '';
    if (!u || !u.alive || phase !== 'player') return;
    const mk = (id: string, name: string, icon: string, key: string, desc: string, cd: number, disabled: boolean, basic = false) => {
      const b = document.createElement('button'); b.className = 'ability panel' + (armed === id ? ' armed' : '') + (basic ? ' basic' : '');
      b.innerHTML = `<span class="key">${key}</span><span class="icon">${icon}</span><span class="label">${name}</span>${cd > 0 ? `<span class="cd">${cd}</span>` : ''}`;
      b.disabled = disabled; b.onclick = () => this.onAbility?.(id);
      b.onmouseenter = (ev) => this.tooltip.show(`<h4>${name}</h4><div>${desc}</div>${cd > 0 ? `<div class="hint">Ready in ${cd} turn${cd > 1 ? 's' : ''}.</div>` : ''}${u.acted && !basic && id !== 'shadowstep' ? '<div class="hint">Already acted this turn.</div>' : ''}`, ev.clientX, ev.clientY);
      b.onmouseleave = () => this.tooltip.hide();
      this.hotbar.appendChild(b);
    };
    const atk = u.def.attack + (u.mods['attack'] ?? 0);
    mk('attack', 'Attack', u.def.attackRange > 1 ? '🏹' : '⚔', '1', `${atk} damage to ${u.def.attackRange > 1 ? `a unit within ${u.def.attackRange} (line of sight)` : 'an adjacent unit'}.${u.def.attackRange === 1 ? (u.def.id === 'rogue' ? ' Double damage when an ally is adjacent to the target.' : ' +1 when an ally is adjacent to the target.') : ''}`, 0, u.acted, true);
    u.def.abilities.forEach((id, i) => { const a = ABILITIES[id]; const cd = u.cooldowns[id] ?? 0; mk(id, a.name, a.icon, String(i + 2), a.desc, cd, cd > 0 || (u.acted && id !== 'shadowstep')); });
  }

  banner(text: string, sub = '', ms = 2600) {
    this.bannerEl.innerHTML = `${text}${sub ? `<small>${sub}</small>` : ''}`; this.bannerEl.classList.add('show');
    if (this.bannerTimer) clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => this.bannerEl.classList.remove('show'), ms);
  }
  log(text: string, style = 'info') {
    this.logEl.innerHTML = `<span class="${style}">${text}</span>`;
    if (this.logTimer) clearTimeout(this.logTimer);
    this.logTimer = window.setTimeout(() => { this.logEl.innerHTML = ''; }, 4200);
  }
}
