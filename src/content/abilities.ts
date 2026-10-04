import type { AbilityDef } from '../sim/types';

export const ABILITIES: Record<string, AbilityDef> = {
  // ---- Oriel / Shieldwarden
  shield_bash: { id: 'shield_bash', name: 'Shield Bash', desc: '2 damage to an adjacent unit and push it 1 tile.', cooldown: 2, range: 1, shape: 'single', targets: 'unit', icon: '🛡' },
  hold: { id: 'hold', name: 'Guard', desc: 'Until your next turn, the first attack that would hit an adjacent ally hits Oriel instead.', cooldown: 3, range: 0, shape: 'self', icon: '✋' },
  bulwark: { id: 'bulwark', name: 'Bulwark', desc: '+2 armour until your next turn, and every enemy within 3 tiles re-aims its attack at Oriel if it can.', cooldown: 3, range: 0, shape: 'self', icon: '⛨' },
  // ---- Brann / Breaker
  heave: { id: 'heave', name: 'Heave', desc: '2 damage to an adjacent unit and push it 2 tiles. Slams into walls deal +1 per blocked tile.', cooldown: 2, range: 1, shape: 'single', targets: 'unit', icon: '💪' },
  sunder: { id: 'sunder', name: 'Sunder', desc: '3 damage to an adjacent unit and break its armour for the fight. Or destroy an adjacent pillar, barrel or door.', cooldown: 3, range: 1, shape: 'single', targets: 'any', icon: '⛏' },
  roar: { id: 'roar', name: 'Roar', desc: 'Every enemy within 4 tiles re-aims its attack at Brann if it can.', cooldown: 4, range: 0, shape: 'self', icon: '📣' },
  // ---- Ysolde / Tallowmage
  gust: { id: 'gust', name: 'Gust', desc: 'A line of wind 3 tiles long. Every unit in it is pushed 1 tile away from Ysolde. Puts out fire in the line.', cooldown: 2, range: 3, shape: 'line', targets: 'tile', icon: '🌬' },
  kindle: { id: 'kindle', name: 'Kindle', desc: 'Ignite a tile within 4 (needs line of sight). Oil and braziers catch; a unit there takes 2 and burns.', cooldown: 2, range: 4, shape: 'tile', needsLos: true, targets: 'tile', icon: '🔥' },
  spark: { id: 'spark', name: 'Spark', desc: '2 damage to a unit within 4 (line of sight). If it stands in water, every unit in that water takes 2.', cooldown: 2, range: 4, shape: 'single', needsLos: true, targets: 'unit', icon: '⚡' },
  // ---- Caddis / Wickthief
  hook: { id: 'hook', name: 'Hook', desc: 'Pull a unit up to 2 tiles toward Caddis from 3 tiles away, for 1 damage.', cooldown: 2, range: 3, shape: 'single', needsLos: true, targets: 'unit', icon: '🪝' },
  smoke: { id: 'smoke', name: 'Smoke', desc: 'A 3×3 cloud within 3 tiles that blocks line of sight for 2 turns.', cooldown: 3, range: 3, shape: 'area', targets: 'tile', icon: '💨' },
  shadowstep: { id: 'shadowstep', name: 'Shadowstep', desc: 'Move up to 3 tiles, through units, without spending movement. Can be used after attacking.', cooldown: 3, range: 3, shape: 'tile', targets: 'empty', icon: '👣' },
  // ---- Hal / Wayfinder
  pin: { id: 'pin', name: 'Pin', desc: '2 damage to a unit within 5 (line of sight) and root it: it cannot move on its next turn.', cooldown: 2, range: 5, shape: 'single', needsLos: true, targets: 'unit', icon: '📌' },
  volley: { id: 'volley', name: 'Volley', desc: '2 damage to a target tile within 5 and the two tiles beside it.', cooldown: 3, range: 5, shape: 'tile', needsLos: true, targets: 'tile', icon: '🏹' },
  mark: { id: 'mark', name: 'Mark', desc: 'A unit within 6 takes +1 damage from everything for 2 turns.', cooldown: 2, range: 6, shape: 'single', targets: 'unit', icon: '🎯' },
};
