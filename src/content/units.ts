import type { UnitDef } from '../sim/types';

export const PARTY_DEFS: Record<string, UnitDef> = {
  knight: { id: 'knight', name: 'Oriel Vance', title: 'Shieldwarden', faction: 'party', model: 'knight', hp: 14, armour: 1, move: 4, attack: 3, attackRange: 1, abilities: ['shield_bash', 'hold', 'bulwark'] },
  barbarian: { id: 'barbarian', name: 'Brann Kettle', title: 'Breaker', faction: 'party', model: 'barbarian', hp: 16, armour: 0, move: 4, attack: 4, attackRange: 1, abilities: ['heave', 'sunder', 'roar'] },
  mage: { id: 'mage', name: 'Ysolde Marrow', title: 'Tallowmage', faction: 'party', model: 'mage', hp: 10, armour: 0, move: 4, attack: 2, attackRange: 4, abilities: ['gust', 'kindle', 'spark'] },
  rogue: { id: 'rogue', name: 'Caddis', title: 'Wickthief', faction: 'party', model: 'rogue', hp: 11, armour: 0, move: 5, attack: 3, attackRange: 1, abilities: ['hook', 'smoke', 'shadowstep'] },
  ranger: { id: 'ranger', name: 'Hal Ferrier', title: 'Wayfinder', faction: 'party', model: 'ranger', hp: 11, armour: 0, move: 4, attack: 2, attackRange: 5, abilities: ['pin', 'volley', 'mark'] },
};

/** Replacement recruits when a named companion is written in the Book. */
export const RECRUIT_NAMES: Record<string, string[]> = {
  knight: ['Marit Sallow', 'Edwin Thorne', 'Agnes Carrow', 'Piers Holloway'],
  barbarian: ['Dunstan Moor', 'Hob Garrick', 'Wenna Blackstone', 'Tobias Reed'],
  mage: ['Isolde Penn', 'Corwin Ash', 'Beatrix Lowe', 'Silas Wren'],
  rogue: ['Nell', 'Crake', 'Tamsin Pike', 'Jory'],
  ranger: ['Rosalind Vey', 'Aldo Fenn', 'Mab Collier', 'Osric Hale'],
};

export const ENEMY_DEFS: Record<string, UnitDef> = {
  // Hour I — The Cistern
  rat: { id: 'rat', name: 'Cistern Rat', faction: 'enemy', model: 'rat', hp: 2, armour: 0, move: 5, attack: 1, attackRange: 1, abilities: [], ai: 'melee', threat: 1, flags: ['swarm'] },
  pale: { id: 'pale', name: 'the Pale', faction: 'enemy', model: 'pale', hp: 5, armour: 0, move: 3, attack: 2, attackRange: 1, abilities: [], ai: 'grab', threat: 2 },
  drowned: { id: 'drowned', name: 'Drowned', faction: 'enemy', model: 'drowned', hp: 4, armour: 0, move: 3, attack: 2, attackRange: 1, abilities: [], ai: 'melee', threat: 2, flags: ['aquatic'] },
  spider: { id: 'spider', name: 'Cistern Spider', faction: 'enemy', model: 'spider', hp: 3, armour: 0, move: 4, attack: 1, attackRange: 4, abilities: [], ai: 'ranged', threat: 2 },
  // Hour II — The Ossuary
  spent: { id: 'spent', name: 'the Spent', faction: 'enemy', model: 'skeleton_warrior', hp: 5, armour: 1, move: 3, attack: 2, attackRange: 1, abilities: [], ai: 'melee', threat: 3, flags: ['opensDoors'] },
  spent_archer: { id: 'spent_archer', name: 'Spent Archer', faction: 'enemy', model: 'skeleton_rogue', hp: 3, armour: 0, move: 3, attack: 2, attackRange: 5, abilities: [], ai: 'ranged', threat: 3, flags: ['opensDoors'] },
  crawler: { id: 'crawler', name: 'Tallow Crawler', faction: 'enemy', model: 'crawler', hp: 4, armour: 0, move: 4, attack: 2, attackRange: 1, abilities: [], ai: 'melee', threat: 2, flags: ['oilTrail'] },
  chorister: { id: 'chorister', name: 'Bone Chorister', faction: 'enemy', model: 'skeleton_mage', hp: 4, armour: 0, move: 3, attack: 1, attackRange: 3, abilities: [], ai: 'healer', threat: 3, flags: ['opensDoors'] },
  // Hour III — The Stokeworks
  stoker: { id: 'stoker', name: 'Stoker', faction: 'enemy', model: 'stoker', hp: 6, armour: 1, move: 3, attack: 2, attackRange: 1, abilities: [], ai: 'melee', threat: 4, flags: ['opensDoors'] },
  bellows: { id: 'bellows', name: 'Bellows-Priest', faction: 'enemy', model: 'bellows', hp: 4, armour: 0, move: 3, attack: 1, attackRange: 3, abilities: [], ai: 'pusher', threat: 4, flags: ['opensDoors'] },
  hound: { id: 'hound', name: 'Ash Hound', faction: 'enemy', model: 'hound', hp: 3, armour: 0, move: 6, attack: 2, attackRange: 1, abilities: [], ai: 'melee', threat: 3 },
  wight: { id: 'wight', name: 'Ember Wight', faction: 'enemy', model: 'wight', hp: 5, armour: 0, move: 3, attack: 2, attackRange: 1, abilities: [], ai: 'melee', threat: 4, flags: ['explodes'] },
  // Hour IV — dreams
  dream_pale: { id: 'dream_pale', name: 'Fever (Pale)', faction: 'enemy', model: 'pale', hp: 6, armour: 0, move: 3, attack: 3, attackRange: 1, abilities: [], ai: 'grab', threat: 4, tint: 0xffaa66 },
  dream_spent: { id: 'dream_spent', name: 'Fever (Spent)', faction: 'enemy', model: 'skeleton_warrior', hp: 6, armour: 1, move: 4, attack: 3, attackRange: 1, abilities: [], ai: 'melee', threat: 4, tint: 0xffaa66 },
  dream_archer: { id: 'dream_archer', name: 'Fever (Archer)', faction: 'enemy', model: 'skeleton_rogue', hp: 4, armour: 0, move: 3, attack: 3, attackRange: 5, abilities: [], ai: 'ranged', threat: 4, tint: 0xffaa66 },
  // Keepers
  ferryman: { id: 'ferryman', name: 'The Ferryman', faction: 'enemy', model: 'ferryman', hp: 24, armour: 1, move: 2, attack: 3, attackRange: 1, abilities: [], ai: 'ferryman', threat: 0, flags: ['keeper', 'noPush'] },
  tallow: { id: 'tallow', name: 'Mother Tallow', faction: 'enemy', model: 'tallow', hp: 26, armour: 0, move: 1, attack: 2, attackRange: 1, abilities: [], ai: 'tallow', threat: 0, flags: ['keeper', 'noPush', 'oilTrail'] },
  prelate: { id: 'prelate', name: 'The Prelate Below', faction: 'enemy', model: 'prelate', hp: 28, armour: 2, move: 3, attack: 3, attackRange: 4, abilities: [], ai: 'prelate', threat: 0, flags: ['keeper', 'noPush', 'opensDoors'] },
  hearth: { id: 'hearth', name: 'The Hearth', faction: 'enemy', model: 'hearth', hp: 30, armour: 0, move: 0, attack: 0, attackRange: 0, abilities: [], ai: 'hearth', threat: 0, flags: ['keeper', 'noPush', 'stationary'] },
};

/** Spawn tables per hour: weights for the threat-budget generator. */
export const SPAWN_TABLES: Record<number, { id: string; w: number }[]> = {
  1: [{ id: 'rat', w: 4 }, { id: 'pale', w: 5 }, { id: 'drowned', w: 3 }, { id: 'spider', w: 3 }],
  2: [{ id: 'spent', w: 5 }, { id: 'spent_archer', w: 3 }, { id: 'crawler', w: 3 }, { id: 'chorister', w: 2 }, { id: 'pale', w: 1 }],
  3: [{ id: 'stoker', w: 4 }, { id: 'bellows', w: 3 }, { id: 'hound', w: 4 }, { id: 'wight', w: 3 }, { id: 'spent', w: 1 }],
  4: [{ id: 'dream_pale', w: 3 }, { id: 'dream_spent', w: 3 }, { id: 'dream_archer', w: 2 }, { id: 'wight', w: 2 }, { id: 'hound', w: 2 }],
};
