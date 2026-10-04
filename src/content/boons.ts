/** Boons: offered after each won fight. Options, not raw power; each is one readable sentence with numbers. */
import type { Unit } from '../sim/types';

export interface Boon {
  id: string;
  name: string;
  desc: string;
  classId?: string;        // restricted to a class
  hourMin?: number;        // first hour it can appear
  apply: (u: Unit) => void;
  once?: boolean;
}

const mod = (k: string, v: number) => (u: Unit) => { u.mods[k] = (u.mods[k] ?? 0) + v; };

export const BOONS: Boon[] = [
  // general
  { id: 'stride', name: 'Long Stride', desc: '+1 movement.', apply: mod('move', 1) },
  { id: 'hardy', name: 'Hardy', desc: '+4 max HP, healed by 4.', apply: u => { u.maxHp += 4; u.hp += 4; } },
  { id: 'keen', name: 'Keen Edge', desc: '+1 damage on basic attacks.', apply: mod('attack', 1) },
  { id: 'plated', name: 'Plated', desc: '+1 armour.', apply: mod('armour', 1), hourMin: 2 },
  { id: 'second_wind', name: 'Second Wind', desc: 'Heal 6 now.', apply: u => { u.hp = Math.min(u.maxHp, u.hp + 6); }, once: false },
  // Oriel
  { id: 'bash_far', name: 'Heavy Shield', desc: 'Shield Bash pushes 2 instead of 1.', classId: 'knight', apply: mod('shield_bash_push', 1) },
  { id: 'bash_hard', name: 'Iron Rim', desc: 'Shield Bash deals 4 instead of 2.', classId: 'knight', apply: mod('shield_bash_dmg', 2) },
  { id: 'hold_fast', name: 'Oath of Hold', desc: 'Hold cooldown 2 instead of 3.', classId: 'knight', apply: mod('hold_cd', -1) },
  // Brann
  { id: 'heave_far', name: 'Mercy\'s Reach', desc: 'Heave pushes 3 instead of 2.', classId: 'barbarian', apply: mod('heave_push', 1) },
  { id: 'heave_hard', name: 'Miner\'s Shoulders', desc: 'Heave deals 4 instead of 2.', classId: 'barbarian', apply: mod('heave_dmg', 2) },
  { id: 'sunder_quick', name: 'Load-Bearing', desc: 'Sunder cooldown 2 instead of 3.', classId: 'barbarian', apply: mod('sunder_cd', -1) },
  // Ysolde
  { id: 'gust_far', name: 'Long Breath', desc: 'Gust reaches 5 tiles instead of 3.', classId: 'mage', apply: mod('gust_range', 2) },
  { id: 'gust_hard', name: 'Gale', desc: 'Gust pushes 2 instead of 1.', classId: 'mage', apply: mod('gust_push', 1) },
  { id: 'kindle_hot', name: 'Tallow Heart', desc: 'Kindle deals 4 to a unit instead of 2.', classId: 'mage', apply: mod('kindle_dmg', 2) },
  { id: 'spark_hot', name: 'Grounded', desc: 'Spark deals 3 instead of 2 (and through water).', classId: 'mage', apply: mod('spark_dmg', 1) },
  { id: 'spark_quick', name: 'Static', desc: 'Spark cooldown 1 instead of 2.', classId: 'mage', apply: mod('spark_cd', -1) },
  // Caddis
  { id: 'hook_far', name: 'Long Line', desc: 'Hook reaches 5 tiles instead of 3.', classId: 'rogue', apply: mod('hook_range', 2) },
  { id: 'hook_quick', name: 'Quick Hands', desc: 'Hook cooldown 1 instead of 2.', classId: 'rogue', apply: mod('hook_cd', -1) },
  { id: 'step_quick', name: 'Soot-Footed', desc: 'Shadowstep cooldown 2 instead of 3.', classId: 'rogue', apply: mod('shadowstep_cd', -1) },
  // Hal
  { id: 'pin_hard', name: 'Barbed', desc: 'Pin deals 4 instead of 2.', classId: 'ranger', apply: mod('pin_dmg', 2) },
  { id: 'volley_hard', name: 'Full Quiver', desc: 'Volley deals 3 per tile instead of 2.', classId: 'ranger', apply: mod('volley_dmg', 1) },
  { id: 'mark_quick', name: 'Sharp Eye', desc: 'Mark cooldown 1 instead of 2.', classId: 'ranger', apply: mod('mark_cd', -1) },
];

export function boonsFor(u: Unit, hour: number, rng: { pick<T>(a: readonly T[]): T; shuffle<T>(a: T[]): T[] }, count = 3): Boon[] {
  const pool = BOONS.filter(b => (!b.classId || b.classId === u.def.id) && (b.hourMin ?? 1) <= hour && (!u.boons.includes(b.id) || b.id === 'second_wind' || b.id === 'hardy'));
  const classBoons = pool.filter(b => b.classId); const general = pool.filter(b => !b.classId);
  const out: Boon[] = [];
  rng.shuffle(classBoons); rng.shuffle(general);
  // at least one class boon, at least one general
  if (classBoons.length) out.push(classBoons.pop()!);
  if (general.length) out.push(general.pop()!);
  while (out.length < count) { const src = (classBoons.length && (!general.length || Math.random() < 0.5)) ? classBoons : general; if (!src.length) break; out.push(src.pop()!); }
  return out;
}
