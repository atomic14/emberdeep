/** Shared simulation types. The sim is headless: no three.js here. */

export interface Vec2 { x: number; y: number }
export const v2 = (x: number, y: number): Vec2 => ({ x, y });
export const eq = (a: Vec2, b: Vec2) => a.x === b.x && a.y === b.y;
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const key = (p: Vec2) => p.x + ',' + p.y;
export const cheb = (a: Vec2, b: Vec2) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
export const manhattan = (a: Vec2, b: Vec2) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
/** Direction from a to b, clamped to one of 8 unit steps (or 0,0). */
export const dirTo = (a: Vec2, b: Vec2): Vec2 => ({ x: Math.sign(b.x - a.x), y: Math.sign(b.y - a.y) });

export const DIRS8: Vec2[] = [
  { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }, { x: -1, y: 1 },
  { x: -1, y: 0 }, { x: -1, y: -1 }, { x: 0, y: -1 }, { x: 1, y: -1 },
];
export const DIRS4: Vec2[] = [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 }];

export type TileKind = 'void' | 'wall' | 'stone' | 'water' | 'oil' | 'ice' | 'chasm' | 'vent';

export type PropKind =
  | 'door' | 'brazier' | 'pillar' | 'barrel' | 'chest' | 'lamp' | 'stairs' | 'shrine'
  | 'event' | 'ember' | 'rubble' | 'page' | 'niche' | 'exit';

export interface Prop {
  kind: PropKind;
  open?: boolean;        // door
  lit?: boolean;         // brazier / lamp
  broken?: boolean;      // brazier / pillar / barrel
  used?: boolean;        // chest / shrine / event / ember / page
  eventId?: string;      // event
  pageId?: number;       // page
  amount?: number;       // ember
}

export interface Tile {
  kind: TileKind;
  prop?: Prop;
  fire: number;          // turns of fire remaining (0 = none)
  smoke: number;         // turns of smoke remaining
  vent?: number;         // countdown for heat vents (vent tiles only)
  explored: boolean;
  visible: boolean;
  lit: boolean;          // lit by a static light source (lamp, brazier, ember vein)
  room: number;          // room id or -1
}

export type Faction = 'party' | 'enemy';

export type StatusKind = 'burning' | 'rooted' | 'marked' | 'guarded' | 'bulwark' | 'hidden';
export interface Status { kind: StatusKind; turns: number; power?: number; sourceId?: string }

export type ClassId = 'knight' | 'barbarian' | 'mage' | 'rogue' | 'ranger';

export interface AbilityDef {
  id: string;
  name: string;
  desc: string;            // short, concrete, numbers included
  cooldown: number;
  range: number;           // 0 = self, 1 = adjacent, n = tiles (chebyshev) ; line abilities use 'line'
  shape: 'self' | 'single' | 'line' | 'tile' | 'area';
  needsLos?: boolean;
  targets?: 'enemy' | 'ally' | 'any' | 'unit' | 'tile' | 'prop' | 'empty';
  icon: string;            // emoji or short glyph used by the HUD
}

export interface UnitDef {
  id: string;              // template id
  name: string;
  title?: string;          // class title shown in UI (Shieldwarden...)
  faction: Faction;
  model: string;           // asset key
  hp: number;
  armour: number;
  move: number;
  attack: number;          // basic attack damage
  attackRange: number;     // 1 = melee; >1 = ranged line
  abilities: string[];     // ability ids
  ai?: AiKind;
  flags?: UnitFlag[];
  threat?: number;         // budget cost for generation
  tint?: number;
}
export type UnitFlag = 'flying' | 'opensDoors' | 'explodes' | 'oilTrail' | 'aquatic' | 'keeper' | 'noPush' | 'swarm' | 'stationary';
export type AiKind = 'melee' | 'grab' | 'ranged' | 'healer' | 'pusher' | 'ferryman' | 'tallow' | 'prelate' | 'hearth' | 'none';

export interface IntentTarget { tiles: Vec2[]; }
export interface Intent {
  kind: 'strike' | 'grab' | 'shoot' | 'heal' | 'pull' | 'blast' | 'summon' | 'wait' | 'explode';
  /** Direction relative to the unit; attacks are directional so pushing the unit moves the attack. */
  dir: Vec2;
  range: number;           // how far along dir (1 for melee)
  damage: number;
  label: string;           // "Strike 2", "Grab", "Shoot 2", "Heal 2"
  /** Optional pre-resolved target id (for heals). */
  targetId?: string;
}

export interface Unit {
  id: string;
  def: UnitDef;
  name: string;
  faction: Faction;
  pos: Vec2;
  facing: Vec2;
  hp: number;
  maxHp: number;
  armour: number;
  armourBroken: boolean;
  move: number;
  moveLeft: number;
  acted: boolean;
  movedFrom?: Vec2;        // for undo (position before this turn's move)
  cooldowns: Record<string, number>;
  statuses: Status[];
  intent?: Intent;
  alive: boolean;
  boons: string[];
  /** Per-run adjustable numbers (from boons). */
  mods: Record<string, number>;
  kills: number;
  lastAction?: string;     // for the Book of Spent
}

export type Phase = 'explore' | 'player' | 'enemy' | 'event' | 'won' | 'lost';

export interface Room {
  id: number;
  x: number; y: number; w: number; h: number;
  role: 'start' | 'combat' | 'event' | 'treasure' | 'shrine' | 'stairs' | 'arena' | 'corridor' | 'empty' | 'page';
  cleared: boolean;
  entered: boolean;
}

export interface FloorMeta {
  hour: 1 | 2 | 3 | 4;
  index: number;           // 1..3 within the hour, 4 = keeper
  name: string;
  isKeeper: boolean;
  seed: number;
}

export interface Level {
  w: number; h: number;
  tiles: Tile[];           // row-major
  rooms: Room[];
  units: Unit[];
  meta: FloorMeta;
  start: Vec2;
}

/** Events emitted by the sim for the presentation layer to animate, in order. */
export type SimEvent =
  | { t: 'move'; id: string; path: Vec2[]; kind?: 'walk' | 'push' | 'pull' | 'slide' | 'dash' }
  | { t: 'attack'; id: string; targetPos: Vec2; ability?: string }
  | { t: 'damage'; id: string; amount: number; absorbed: number; kind: 'hit' | 'fire' | 'shock' | 'slam' | 'fall' | 'explode' | 'heal' }
  | { t: 'status'; id: string; status: StatusKind; on: boolean }
  | { t: 'die'; id: string; cause: string }
  | { t: 'fall'; id: string; pos: Vec2 }
  | { t: 'fire'; pos: Vec2; on: boolean }
  | { t: 'smoke'; pos: Vec2; on: boolean }
  | { t: 'shock'; tiles: Vec2[] }
  | { t: 'prop'; pos: Vec2; prop: Prop | undefined; change: 'open' | 'close' | 'break' | 'use' | 'spawn' | 'remove' }
  | { t: 'tile'; pos: Vec2; kind: TileKind }
  | { t: 'intent'; id: string; intent: Intent | undefined }
  | { t: 'spawn'; id: string }
  | { t: 'ability'; id: string; ability: string; targetPos?: Vec2 }
  | { t: 'projectile'; from: Vec2; to: Vec2; kind: 'arrow' | 'web' | 'spark' | 'fire' | 'gust' | 'hook' }
  | { t: 'combatStart'; reason: string }
  | { t: 'combatEnd'; won: boolean }
  | { t: 'turn'; phase: Phase }
  | { t: 'bark'; id: string; text: string }
  | { t: 'text'; text: string; style?: 'info' | 'warn' | 'story' }
  | { t: 'vent'; pos: Vec2; countdown: number };
