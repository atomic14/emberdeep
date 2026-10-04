/** Persistent meta state (the Vigil remembers) and per-run state. Saved to localStorage. */
import type { ClassId } from '../sim/types';
import { PARTY_DEFS, RECRUIT_NAMES } from '../content/units';

export interface RosterMember { classId: ClassId; name: string; alive: boolean; runs: number; kills: number; original: boolean }
export interface BookEntry { text: string; run: number; name: string }
export interface Settings { sfx: number; music: number; confirmEndTurn: boolean; cameraFollow: boolean; shownHelp: boolean }
export interface Meta {
  version: number; runs: number; deaths: number; ascended: number; emberBanked: number; emberTotal: number;
  upgrades: Record<string, number>; roster: RosterMember[]; pagesFound: number[]; flags: Record<string, boolean>;
  book: BookEntry[]; linesSaid: string[]; endings: string[]; fever: number; settings: Settings; bestHour: number;
}
export interface RunMember { classId: ClassId; name: string; hp: number; maxHp: number; boons: string[]; mods: Record<string, number>; kills: number; alive: boolean }
export interface Run {
  seed: number; hour: 1 | 2 | 3 | 4; floor: number; party: RunMember[]; ember: number; relics: string[];
  flags: Record<string, boolean>; eventsSeen: string[]; shrineHour: number; pagesThisRun: number[]; keepersSlain: string[]; wickUsed: boolean; turnsTaken: number;
}

const KEY = 'emberdeep.meta.v1';
const RUNKEY = 'emberdeep.run.v1';

export function newRoster(): RosterMember[] {
  return (['knight', 'barbarian', 'mage'] as ClassId[]).map(c => ({ classId: c, name: PARTY_DEFS[c].name, alive: true, runs: 0, kills: 0, original: true }));
}
export function newMeta(): Meta {
  return { version: 1, runs: 0, deaths: 0, ascended: 0, emberBanked: 0, emberTotal: 0, upgrades: {}, roster: newRoster(), pagesFound: [], flags: {}, book: [], linesSaid: [], endings: [], fever: 0, bestHour: 0,
    settings: { sfx: 0.8, music: 0.45, confirmEndTurn: true, cameraFollow: true, shownHelp: false } };
}
export function loadMeta(): Meta {
  try { const s = localStorage.getItem(KEY); if (s) { const m = JSON.parse(s) as Meta; return { ...newMeta(), ...m, settings: { ...newMeta().settings, ...(m.settings ?? {}) } }; } } catch { }
  return newMeta();
}
export function saveMeta(m: Meta) { try { localStorage.setItem(KEY, JSON.stringify(m)); } catch { } }
export function loadRun(): Run | undefined { try { const s = localStorage.getItem(RUNKEY); return s ? JSON.parse(s) as Run : undefined; } catch { return undefined; } }
export function saveRun(r: Run | undefined) { try { if (r) localStorage.setItem(RUNKEY, JSON.stringify(r)); else localStorage.removeItem(RUNKEY); } catch { } }
export function wipeAll() { localStorage.removeItem(KEY); localStorage.removeItem(RUNKEY); }

/** A fresh recruit of a class, after the named one is written in the Book. */
export function recruit(meta: Meta, classId: ClassId): RosterMember {
  const used = new Set([...meta.roster.map(r => r.name), ...meta.book.map(b => b.name)]);
  const name = RECRUIT_NAMES[classId].find(n => !used.has(n)) ?? RECRUIT_NAMES[classId][meta.deaths % RECRUIT_NAMES[classId].length];
  return { classId, name, alive: true, runs: 0, kills: 0, original: false };
}

export const UPGRADES: { id: string; name: string; desc: string; cost: number; max: number }[] = [
  { id: 'lantern', name: 'Wider Throw', desc: 'Lantern radius +1. You see further; so do they.', cost: 6, max: 2 },
  { id: 'cage', name: 'Ember Cage', desc: 'If the Lantern goes out, half the ember you carried still comes home.', cost: 8, max: 1 },
  { id: 'wick', name: 'The Wick', desc: 'Once per descent, a Lamplighter who would die stays at 1 HP instead.', cost: 12, max: 1 },
  { id: 'boons', name: 'Teodor\'s Eye', desc: 'Choose from four boons instead of three.', cost: 10, max: 1 },
  { id: 'coats', name: 'Coats', desc: 'Every Lamplighter starts the descent with +2 max HP.', cost: 7, max: 2 },
];

export function newRun(meta: Meta, classIds: ClassId[], seed = Date.now() % 1000000): Run {
  const party: RunMember[] = classIds.map(c => {
    const r = meta.roster.find(m => m.classId === c && m.alive)!; const def = PARTY_DEFS[c];
    const hp = def.hp + 2 * (meta.upgrades['coats'] ?? 0);
    return { classId: c, name: r.name, hp, maxHp: hp, boons: [], mods: {}, kills: 0, alive: true };
  });
  return { seed, hour: 1, floor: 1, party, ember: 0, relics: [], flags: {}, eventsSeen: [], shrineHour: 0, pagesThisRun: [], keepersSlain: [], wickUsed: false, turnsTaken: 0 };
}
