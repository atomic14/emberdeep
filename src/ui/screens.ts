/** Full-screen panels: title, Vigil hub, boons, event cards, Book, pages, endings, settings, help. */
import type { Meta, RosterMember, Settings } from '../game/state';
import { UPGRADES } from '../game/state';
import type { Boon } from '../content/boons';
import type { EventCard, EventChoice } from '../content/story';
import { CHOIR_PAGES, HUB_LINES } from '../content/story';
import { PARTY_DEFS } from '../content/units';
import { ABILITIES } from '../content/abilities';
import type { ClassId } from '../sim/types';

export class Screens {
  private current?: HTMLDivElement;
  onOpen?: () => void;
  constructor(private root: HTMLElement) { }
  close() { this.current?.remove(); this.current = undefined; }
  private open(cls = ''): HTMLDivElement { this.close(); this.onOpen?.(); const d = document.createElement('div'); d.className = 'screen fade-in ' + cls; this.root.appendChild(d); this.current = d; return d; }
  get isOpen() { return !!this.current; }

  loading(): (frac: number, label: string) => void {
    const d = this.open(); d.innerHTML = `<div id="loading"><div>EMBERDEEP</div><div class="lbar"><i></i></div><div class="muted" id="lbl" style="letter-spacing:0;font-family:var(--serif);font-style:italic;font-size:14px">lighting the lamp</div></div>`;
    const bar = d.querySelector('.lbar i') as HTMLElement, lbl = d.querySelector('#lbl') as HTMLElement;
    return (f, l) => { bar.style.width = Math.round(f * 100) + '%'; lbl.textContent = l; };
  }

  title(o: { hasRun: boolean; meta: Meta; onNew: () => void; onContinue: () => void; onBook: () => void; onHelp: () => void; onSettings: () => void; onWipe: () => void }) {
    const d = this.open();
    d.innerHTML = `<div class="title-screen">
      <h1>EMBERDEEP</h1><div class="sub">A Lamplighter's descent</div><div class="motto">GO DOWN SLOW</div>
      <div class="row-btns">
        ${o.hasRun ? '<button class="primary" id="cont">Continue the Descent</button>' : ''}
        <button class="${o.hasRun ? '' : 'primary'}" id="new">${o.meta.runs ? 'To the Vigil' : 'Light a Candle'}</button>
        <button id="book">The Book of Spent</button>
        <button id="help">How to Play</button>
        <button id="settings">Settings</button>
      </div>
      <p class="muted" style="margin-top:28px;font-size:13px;font-style:italic">${o.meta.runs ? `${o.meta.runs} descent${o.meta.runs > 1 ? 's' : ''} · ${o.meta.book.length} name${o.meta.book.length === 1 ? '' : 's'} in the Book · ${o.meta.pagesFound.length}/12 Choir pages` : 'Two hundred years after the sun went grey, Caddow stays warm by burning what it finds beneath its streets.'}</p>
      ${o.meta.runs ? '<button id="wipe" style="font-size:12px;margin-top:12px;opacity:.6">Forget everything</button>' : ''}
    </div>`;
    (d.querySelector('#new') as HTMLButtonElement).onclick = o.onNew;
    (d.querySelector('#cont') as HTMLButtonElement | null)?.addEventListener('click', o.onContinue);
    (d.querySelector('#book') as HTMLButtonElement).onclick = o.onBook;
    (d.querySelector('#help') as HTMLButtonElement).onclick = o.onHelp;
    (d.querySelector('#settings') as HTMLButtonElement).onclick = o.onSettings;
    (d.querySelector('#wipe') as HTMLButtonElement | null)?.addEventListener('click', o.onWipe);
  }

  /** The Vigil. Shows NPC lines, lets the player pick a Lantern of three, buy upgrades, read the Book. */
  hub(meta: Meta, lines: { speaker: string; text: string }[], o: { onStart: (party: ClassId[]) => void; onBuy: (id: string) => void; onBook: () => void; onPages: () => void; onTitle: () => void; onSettings: () => void }) {
    const d = this.open();
    const names: Record<string, string> = { warden: 'Warden Hask', teodor: 'Teodor Vell', pim: 'Pim', anneke: 'Sister Anneke' };
    const picked = new Set<ClassId>();
    const alive = meta.roster.filter(r => r.alive);
    for (const r of alive.slice(0, 3)) picked.add(r.classId);
    const render = () => {
      d.innerHTML = `<div class="hub">
        <div class="col">
          <div class="box panel"><h2>The Vigil</h2>
            ${lines.map(l => `<div class="npc"><div class="who">${names[l.speaker] ?? l.speaker}</div><div class="say">${l.text}</div></div>`).join('')}
          </div>
          <div class="box panel"><h2>Teodor's Workshop <span class="muted" style="font-family:var(--serif);font-size:14px;letter-spacing:0;font-weight:400">· <span class="ember">◆</span> ${meta.emberBanked} ember banked</span></h2>
            <div class="roster">${UPGRADES.map(u => { const lvl = meta.upgrades[u.id] ?? 0; const maxed = lvl >= u.max; return `<button class="upgrade panel" data-up="${u.id}" ${maxed || meta.emberBanked < u.cost ? 'disabled' : ''}><span><span class="n">${u.name}${u.max > 1 ? ` <span class="muted">${lvl}/${u.max}</span>` : ''}</span><br><span class="t">${u.desc}</span></span><span class="cost">${maxed ? 'DONE' : `◆ ${u.cost}`}</span></button>`; }).join('')}</div>
          </div>
        </div>
        <div class="col">
          <div class="box panel"><h2>Your Lantern <span class="muted" style="font-family:var(--serif);font-size:14px;letter-spacing:0;font-weight:400">· choose three</span></h2>
            <div class="roster">${alive.map(r => { const def = PARTY_DEFS[r.classId]; return `<button class="recruit panel ${picked.has(r.classId) ? 'picked' : ''}" data-c="${r.classId}"><span><span class="n">${r.name}</span><br><span class="t">${def.title} · ${def.hp} HP · ⛨${def.armour} · ⚔${def.attack}${def.attackRange > 1 ? ' ranged' : ''}</span><br><span class="abil">${def.abilities.map(a => ABILITIES[a].name).join(' · ')}</span></span><span>${picked.has(r.classId) ? '●' : '○'}</span></button>`; }).join('')}</div>
            <div class="row-btns"><button class="primary" id="start" ${picked.size === Math.min(3, alive.length) ? '' : 'disabled'}>Light a Candle</button><button id="book">The Book</button><button id="pages">Choir Pages (${meta.pagesFound.length})</button><button id="settings">Settings</button><button id="title">Leave</button></div>
          </div>
        </div></div>`;
      d.querySelectorAll<HTMLButtonElement>('[data-c]').forEach(b => b.onclick = () => { const c = b.dataset.c as ClassId; if (picked.has(c)) picked.delete(c); else if (picked.size < 3) picked.add(c); render(); });
      d.querySelectorAll<HTMLButtonElement>('[data-up]').forEach(b => b.onclick = () => { o.onBuy(b.dataset.up!); render(); });
      (d.querySelector('#start') as HTMLButtonElement).onclick = () => o.onStart([...picked]);
      (d.querySelector('#book') as HTMLButtonElement).onclick = o.onBook; (d.querySelector('#pages') as HTMLButtonElement).onclick = o.onPages;
      (d.querySelector('#title') as HTMLButtonElement).onclick = o.onTitle; (d.querySelector('#settings') as HTMLButtonElement).onclick = o.onSettings;
    };
    render();
  }

  boon(unitName: string, boons: Boon[]): Promise<Boon> {
    return new Promise(res => {
      const d = this.open('clear');
      d.innerHTML = `<div class="card panel" style="width:min(820px,94vw)"><h2>A breath between fights</h2><p class="muted">${unitName} may take one.</p><div class="boons">${boons.map((b, i) => `<button class="boon panel" data-i="${i}"><h3>${b.name}</h3><div class="desc">${b.desc}</div>${b.classId ? `<div class="for">${PARTY_DEFS[b.classId]?.title ?? ''}</div>` : '<div class="for muted">ANYONE</div>'}</button>`).join('')}</div></div>`;
      d.querySelectorAll<HTMLButtonElement>('[data-i]').forEach(b => b.onclick = () => { this.close(); res(boons[+b.dataset.i!]); });
    });
  }

  /** Who takes the boon? */
  pickUnit(names: { id: string; name: string; title: string }[]): Promise<string> {
    return new Promise(res => {
      const d = this.open('clear');
      d.innerHTML = `<div class="card panel" style="width:min(640px,94vw)"><h2>Who takes it?</h2><div class="choices">${names.map(n => `<button class="choice panel" data-id="${n.id}"><span>${n.name}</span><span class="stake">${n.title}</span></button>`).join('')}</div></div>`;
      d.querySelectorAll<HTMLButtonElement>('[data-id]').forEach(b => b.onclick = () => { this.close(); res(b.dataset.id!); });
    });
  }

  event(card: EventCard, partyClasses: string[], seenBefore: boolean): Promise<EventChoice> {
    return new Promise(res => {
      const d = this.open();
      d.innerHTML = `<div class="card panel"><h2>${card.title}</h2><p>${seenBefore ? `<span class="muted">${card.body.split('. ')[0]}.</span>` : card.body}</p><div class="choices">${card.choices.map((c, i) => { const ok = !c.requires || partyClasses.includes(c.requires); return `<button class="choice panel" data-i="${i}" ${ok ? '' : 'disabled'}><span>${c.text}</span><span class="stake">${c.stake}</span>${c.requires ? `<span class="req">${ok ? 'REQUIRES' : 'NEEDS'} ${PARTY_DEFS[c.requires]?.title?.toUpperCase()}</span>` : ''}</button>`; }).join('')}</div></div>`;
      d.querySelectorAll<HTMLButtonElement>('[data-i]').forEach(b => b.onclick = () => { this.close(); res(card.choices[+b.dataset.i!]); });
    });
  }

  choice(title: string, body: string, options: { text: string; stake: string; disabled?: boolean }[]): Promise<number> {
    return new Promise(res => {
      const d = this.open();
      d.innerHTML = `<div class="card panel"><h2>${title}</h2><p>${body.replace(/\n/g, '</p><p>')}</p><div class="choices">${options.map((c, i) => `<button class="choice panel" data-i="${i}" ${c.disabled ? 'disabled' : ''}><span>${c.text}</span><span class="stake">${c.stake}</span></button>`).join('')}</div></div>`;
      d.querySelectorAll<HTMLButtonElement>('[data-i]').forEach(b => b.onclick = () => { this.close(); res(+b.dataset.i!); });
    });
  }

  page(id: number): Promise<void> {
    return new Promise(res => {
      const d = this.open();
      d.innerHTML = `<div class="card panel pages" style="width:min(560px,92vw)"><h2>Choir Page ${id}</h2><p>${CHOIR_PAGES[id]}</p><div class="row-btns"><button class="primary" id="ok">Keep it</button></div></div>`;
      (d.querySelector('#ok') as HTMLButtonElement).onclick = () => { this.close(); res(); };
    });
  }
  pages(found: number[], onClose: () => void) {
    const d = this.open();
    d.innerHTML = `<div class="card panel pages"><h2>Choir Pages <span class="muted" style="font-family:var(--serif);font-size:14px;letter-spacing:0;font-weight:400">· ${found.length} of 12</span></h2>${found.length ? [...found].sort((a, b) => a - b).map(i => `<p><b class="muted" style="font-style:normal">${i}.</b> ${CHOIR_PAGES[i]}</p>`).join('') : '<p class="muted">None yet. They are hidden in dead-end rooms. Thorough Lamplighters find them.</p>'}<div class="row-btns"><button id="ok">Close</button></div></div>`;
    (d.querySelector('#ok') as HTMLButtonElement).onclick = () => { this.close(); onClose(); };
  }
  book(meta: Meta, onClose: () => void) {
    const d = this.open();
    d.innerHTML = `<div class="card panel book"><h2>The Book of Spent</h2><p class="muted" style="font-style:italic">Every Lamplighter who did not come back, in the Warden's hand.</p>
      <div class="entry"><b>Tam Vance.</b> Candle. Fell in the Ossuary, Hour II, six years gone. Written by O. V., who asked to.</div>
      <div class="entry"><b>Rosalind Mere.</b> Wayfinder. Fell below the Ossuary with the Choir, sixty years gone. Spent, not lost.</div>
      <div class="entry"><b>Edmund Coyle. Agnes Fell.</b> Fell in the Ossuary, Hour II, thirty years gone, holding a door so that a third could climb. Written by the third.</div>
      ${meta.book.map(b => `<div class="entry"><b>${b.text.split('.')[0]}.</b>${b.text.slice(b.text.indexOf('.') + 1)} <span class="muted">(Descent ${b.run})</span></div>`).join('')}
      ${meta.endings.length ? `<div class="entry" style="margin-top:16px"><b>Kept.</b> ${meta.endings.includes('keep') ? 'One name, under a heading no one had used before.' : '<span class="muted">(a page left blank)</span>'}</div>` : ''}
      <div class="row-btns"><button id="ok">Close</button></div></div>`;
    (d.querySelector('#ok') as HTMLButtonElement).onclick = () => { this.close(); onClose(); };
  }

  death(entries: string[], causeLine: string): Promise<void> {
    return new Promise(res => {
      const d = this.open();
      d.innerHTML = `<div class="card panel book"><h1 style="font-size:26px">The Lantern goes out</h1><p class="muted" style="text-align:center;font-style:italic">${causeLine}</p>
        <p class="muted" style="margin-top:18px">The Warden writes:</p>${entries.map(e => `<div class="entry">${e}</div>`).join('')}
        <div class="row-btns"><button class="primary" id="ok">Spent, not lost</button></div></div>`;
      (d.querySelector('#ok') as HTMLButtonElement).onclick = () => { this.close(); res(); };
    });
  }
  ascended(ember: number, hour: number): Promise<void> {
    return new Promise(res => {
      const d = this.open();
      d.innerHTML = `<div class="card panel"><h1 style="font-size:26px">You came back</h1><p style="text-align:center">The Great Lamp is relit from your lanterns. The city eats tonight.</p><p style="text-align:center"><span class="ember">◆ ${ember} ember</span> banked · reached Hour ${['I', 'II', 'III', 'IV'][hour - 1]}</p><div class="row-btns"><button class="primary" id="ok">To the Vigil</button></div></div>`;
      (d.querySelector('#ok') as HTMLButtonElement).onclick = () => { this.close(); res(); };
    });
  }
  ending(title: string, text: string): Promise<void> {
    return new Promise(res => {
      const d = this.open();
      d.innerHTML = `<div class="card panel"><h1 style="font-size:30px">${title}</h1>${text.split('\n\n').map(p => `<p>${p}</p>`).join('')}<div class="row-btns"><button class="primary" id="ok">Go down slow</button></div></div>`;
      (d.querySelector('#ok') as HTMLButtonElement).onclick = () => { this.close(); res(); };
    });
  }
  intro(hourName: string, text: string, keeperLine?: string): Promise<void> {
    return new Promise(res => {
      const d = this.open();
      d.innerHTML = `<div class="card panel" style="text-align:center;width:min(600px,92vw)"><h1 style="font-size:28px">${hourName}</h1><p style="font-style:italic">${text}</p>${keeperLine ? `<p class="ember">${keeperLine}</p>` : ''}<div class="row-btns"><button class="primary" id="ok">Descend</button></div></div>`;
      (d.querySelector('#ok') as HTMLButtonElement).onclick = () => { this.close(); res(); };
      const k = (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { window.removeEventListener('keydown', k); this.close(); res(); } }; window.addEventListener('keydown', k);
    });
  }
  confirm(title: string, body: string, yes: string, no: string): Promise<boolean> {
    return new Promise(res => {
      const d = this.open('clear');
      d.innerHTML = `<div class="card panel" style="width:min(520px,92vw)"><h2>${title}</h2><p>${body}</p><div class="row-btns"><button class="primary" id="y">${yes}</button><button id="n">${no}</button></div></div>`;
      (d.querySelector('#y') as HTMLButtonElement).onclick = () => { this.close(); res(true); }; (d.querySelector('#n') as HTMLButtonElement).onclick = () => { this.close(); res(false); };
    });
  }
  settings(s: Settings, onChange: (s: Settings) => void, onClose: () => void, extra?: { label: string; action: () => void }[]) {
    const d = this.open();
    d.innerHTML = `<div class="card panel settings" style="width:min(520px,92vw)"><h2>Settings</h2>
      <label>Sound effects <input type="range" id="sfx" min="0" max="1" step="0.05" value="${s.sfx}"></label>
      <label>Music <input type="range" id="music" min="0" max="1" step="0.05" value="${s.music}"></label>
      <label>Ask before Holding with actions unspent <input type="checkbox" id="confirm" ${s.confirmEndTurn ? 'checked' : ''}></label>
      <label>Camera follows the party <input type="checkbox" id="follow" ${s.cameraFollow ? 'checked' : ''}></label>
      <div class="row-btns">${(extra ?? []).map((e, i) => `<button data-x="${i}">${e.label}</button>`).join('')}<button class="primary" id="ok">Done</button></div></div>`;
    const upd = () => { s.sfx = +(d.querySelector('#sfx') as HTMLInputElement).value; s.music = +(d.querySelector('#music') as HTMLInputElement).value; s.confirmEndTurn = (d.querySelector('#confirm') as HTMLInputElement).checked; s.cameraFollow = (d.querySelector('#follow') as HTMLInputElement).checked; onChange(s); };
    d.querySelectorAll('input').forEach(i => i.oninput = upd);
    (d.querySelector('#ok') as HTMLButtonElement).onclick = () => { this.close(); onClose(); };
    d.querySelectorAll<HTMLButtonElement>('[data-x]').forEach(b => b.onclick = () => { this.close(); extra![+b.dataset.x!].action(); });
  }
  help(onClose: () => void) {
    const d = this.open();
    d.innerHTML = `<div class="card panel" style="width:min(680px,92vw)"><h2>How to play</h2>
      <p>Left-click does the obvious thing. Hover first; the game shows you what will happen before you commit.</p>
      <div class="keys">
        <b>EXPLORING</b><span>Click a tile to walk the Lantern there. Click a door, chest or glowing thing to use it. <i>Space</i> explores to the nearest unseen place.</span>
        <b>COMBAT</b><span>Your whole Lantern acts, in any order; then everything else does. Each Lamplighter may <b>move</b> (blue tiles) and take <b>one action</b>: attack (click an enemy) or an ability (click it, or press 2–4, then click a target).</span>
        <b>RED TILES</b><span>Where enemies will strike at the start of their turn. They decide first and commit. Step out of red, or push them so they hit something else. Pushing an enemy moves its attack with it.</span>
        <b>UNDO</b><span>Movement can be undone (right-click, Z, or the undo link) until the Lamplighter acts.</span>
        <b>HOLD</b><span>Ends your turn (<i>Space</i>). The button pulses when everyone has acted.</span>
        <b>THE ROOM</b><span>Water slows and conducts lightning. Oil burns and spreads. Chasms are final. Braziers fall over. Doors shut. Pillars block sight and crumble. The thing in front of you is not the only thing in the room.</span>
        <b>CAMERA</b><span>Wheel zooms. WASD or arrows pan. <i>F</i> toggles following. <i>Tab</i> cycles Lamplighters. <i>Esc</i> cancels, then opens the menu.</span>
        <b>STAIRS</b><span>At every staircase you may go deeper or <b>Ascend</b> with the ember you carry. Coming back is the hard rule.</span>
      </div>
      <div class="row-btns"><button class="primary" id="ok">Go down slow</button></div></div>`;
    (d.querySelector('#ok') as HTMLButtonElement).onclick = () => { this.close(); onClose(); };
  }
  menu(o: { onResume: () => void; onSettings: () => void; onHelp: () => void; onAbandon: () => void }) {
    const d = this.open();
    d.innerHTML = `<div class="card panel" style="width:min(420px,92vw);text-align:center"><h2>Paused</h2><div class="row-btns" style="flex-direction:column"><button class="primary" id="r">Resume</button><button id="s">Settings</button><button id="h">How to Play</button><button id="a">Ascend without ember (abandon the descent)</button></div></div>`;
    (d.querySelector('#r') as HTMLButtonElement).onclick = () => { this.close(); o.onResume(); };
    (d.querySelector('#s') as HTMLButtonElement).onclick = () => { this.close(); o.onSettings(); };
    (d.querySelector('#h') as HTMLButtonElement).onclick = () => { this.close(); o.onHelp(); };
    (d.querySelector('#a') as HTMLButtonElement).onclick = () => { this.close(); o.onAbandon(); };
  }
}

/** Pick hub lines to show this visit: one per speaker, preferring unsaid conditional lines. */
export function selectHubLines(meta: Meta, lastRun: { died: boolean; ascended: boolean; emberBrought: number } | undefined): { speaker: string; text: string; key: string }[] {
  const out: { speaker: string; text: string; key: string }[] = [];
  const cond = (when: string): boolean => {
    const [k, v] = when.split(':');
    switch (k) {
      case 'run': return meta.runs + 1 >= +v && (meta.runs + 1 === +v || v === '1');
      case 'deaths': return meta.deaths >= +v;
      case 'flag': return !!meta.flags[v];
      case 'ascended': return meta.ascended >= +v;
      case 'ember': return (lastRun?.emberBrought ?? 0) >= +v;
      case 'default': return true;
    }
    return false;
  };
  for (const sp of ['warden', 'teodor', 'pim', 'anneke'] as const) {
    if (sp === 'anneke' && meta.runs < 1) continue;
    const cands = HUB_LINES.filter(l => l.speaker === sp && cond(l.when) && !(l.once && meta.linesSaid.includes(sp + '|' + l.when)));
    const pick = cands.find(l => l.when !== 'default') ?? cands[0];
    if (pick) out.push({ speaker: sp, text: pick.text, key: sp + '|' + pick.when });
  }
  return out;
}
export type { RosterMember };
