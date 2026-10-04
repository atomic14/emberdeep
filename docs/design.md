# EMBERDEEP — Game Design Document

Browser-based isometric roguelike adventure. Small party, turn-based tactical combat on a grid, procedural descent, story that persists across deaths. Built on Raph Koster's *A Theory of Fun*: fun is learning a pattern; a game must know the one thing it teaches, reveal it at the right pace, make skill matter, and expect to be solved.

---

## 1. The One Thing

> **Read the room before you act. Position beats power.**

Every fight in Emberdeep is a small spatial puzzle with perfect information. You can see what every enemy intends to do next turn. You can see the water, the oil, the chasm, the door, the brazier. Winning is not about bigger numbers; it is about noticing that the Pale about to grab Caddis is standing in water, and Ysolde is holding a lightning spell, and the Spent archer behind it is on the edge of a drop.

Koster: "Asking the player to be thorough is a subtler lesson than asking for speed." Our whole game is that lesson. It is turn-based with no timer. It is deterministic in combat. It shows you everything. The only thing it withholds is what is in the next room, and it gives you tools to find that out too.

**Every system must serve this.** Anything that does not (hidden hit chances, stat bloat, inventory tetris, twitch inputs) is cut.

### Secondary theme (fiction, not mechanics)
What we burn to stay warm; keeping versus keeping alive. See `story-bible.md`. The fiction reinforces the lesson: Caddow never read the room.

---

## 2. Koster's Checklist Applied

| Question | Our answer |
|---|---|
| Must you prepare before the challenge? | Yes: choose your Lantern (3 of the roster), pick boons between fights, decide whether to Ascend or go deeper, scout rooms before committing (open door, Flare, Mark). |
| Can you prepare in different ways and still succeed? | Yes: five classes, any three; boons branch builds (push-heavy, fire, control, burst). |
| Does the environment affect the challenge? | It is the challenge: water, oil, fire, chasms, doors, braziers, pillars, heat vents, darkness. |
| Are the rules solid and defined? | Deterministic damage, visible intents, fixed push rules, visible ranges. No hidden modifiers. |
| Can the rule set support several kinds of challenge? | Rooms are puzzles: kill all, hold a door for N turns, cross a flooded hall, kill the Chorister first, escort Pim, Keeper fights with mechanics. |
| Can the player bring several abilities to bear? | Each unit: move + one action; three units; abilities interact (Gust pushes into Kindle's fire). |
| At high difficulty, must they? | Yes: later Hours' enemies have armour that only breaks from pushes/Sunder, support units that heal, explosive units that punish melee. |
| Does using an ability take skill? | Yes: geometry. A push is only good if you know where the enemy ends up. |
| Is there more than one success state? | Kill everything; escape to the stairs; hold the door until the Spent give up; take the Prelate's deal; Ascend early with ember. |
| Do advanced players gain nothing from easy challenges? | Boons scale with Hour; Hour I gives little ember; the Mastery problem is also handled by threat scaling (see §8). |
| Does failure at least force a retry? | Permadeath. The party is gone. The Vigil remembers. |

### Variable feedback
Combat itself is deterministic (the lesson must be learnable, and a miss roll teaches nothing). Variability comes from procedural floors, enemy placement, which intents enemies choose, which boons are offered, what event cards appear, and what loot drops. Koster's variable feedback requirement is met at the run level, not the dice level; this is the Into the Breach argument.

### What the brain chunks, and in what order
1. Click to move, click to attack. (Minute 1)
2. Enemies show their intent. Move out of the red tiles. (Minute 3)
3. Water conducts; chasms kill; pushing exists. (Floor 1)
4. Flanking doubles Caddis; doors are chokepoints. (Floor 2)
5. Oil + Kindle; braziers; kill the Chorister first. (Hour II)
6. Armour breaks under pushes; explosive deaths; heat vents on timers. (Hour III)
7. Everything at once, with a choice at the bottom. (Hour IV)

Each Hour introduces exactly two new patterns and recombines the old ones. Not slower (repetitive), not faster (noise).

---

## 3. Controls: "Do the obvious thing"

Design target: a player who has never read a tutorial can play with the left mouse button alone. Everything else is a shortcut.

### Exploration mode (no enemies aware)
- **Left-click a floor tile:** the whole Lantern walks there (leader paths, followers trail in formation). Path previews on hover.
- **Left-click a door:** walk there and open it.
- **Left-click a chest / lever / shrine / NPC:** walk there and use it.
- **Left-click an unexplored dark area:** walk to the nearest reachable edge of it.
- **Hover anything:** a tooltip names it and says what clicking will do ("Open", "Loot", "Talk", "Descend").
- **Shift+click a party portrait, or click it:** make that unit the leader (optional; never needed).
- **Space / "Explore" button:** auto-explore to the nearest unexplored room, stopping when anything of interest appears (Brogue's `x`).
- **Mouse wheel:** zoom. **Middle-drag or WASD/arrows:** pan. Camera also follows the party by default (toggle). Edge-of-screen panning is off by default.
- **Q / E:** rotate camera 90° (snaps). Default angle is fixed; rotation is an aid, not a requirement.

### Combat mode (an enemy has seen you)
Combat begins automatically; the camera eases to frame it; a one-line banner says why ("The Pale have seen your light").

- Turn order: **the whole Lantern acts, in any order, then all enemies act.** No initiative list to read. Each unit has **Move** (tiles, shown as blue reach) and **one Action** (attack or ability).
- **Left-click a reachable blue tile:** move there. Movement is **undoable** (Into the Breach) until the unit takes an action; a small Undo arrow appears next to it, and Z / right-click also undoes.
- **Left-click an enemy in range:** basic attack. Hover first shows the exact damage, and what will happen (pushed into water, killed, armour broken).
- **Left-click an ability button (or 1–4):** enters targeting; valid tiles highlight; hover previews outcome; click to confirm; **right-click / Escape** cancels.
- **Click a party portrait or the unit itself:** select it. Tab cycles.
- **Enemy intents:** every enemy shows a red marker over the tiles it will attack next turn and an icon of what it will do (attack, grab, shoot a line, heal, explode). Hover an enemy for the exact numbers.
- **End Turn:** big button bottom-right, and Space. It shows how many Lamplighters have acted, pulses when everyone has, and asks once if someone could still strike an enemy. Optional automatic turn ending in settings.
- **Dangerous actions confirm once:** moving onto a tile an enemy will attack pulses the tile; attacking an Ember Wight while adjacent shows the explosion preview. No modal dialogs in combat.

### Things we deliberately do not have
No key combos (Ctrl+anything). No double-click. No drag-selecting units. No pause-and-queue real-time mode (BG1's pause is a workaround for real time; we are turn-based so the workaround is unnecessary). No initiative order to memorise. No inventory grid: items are a short list of relics with passive effects plus a few consumables on the hotbar.

---

## 4. Core Mechanics

### The grid
Square grid, 8-direction movement (diagonals cost the same; no corner-cutting through walls). One unit per tile. Tiles have a floor type and may hold one prop.

| Floor | Effect |
|---|---|
| Stone | None |
| Water (shallow) | Costs 2 move to enter; lightning hitting any water tile hits every unit standing in connected water; fire cannot enter |
| Oil | Fire spreads across connected oil; units standing in oil that ignites take 2 and keep burning 1/turn until they move off |
| Ice (Ysolde's Still) | Walkable water; no conduction; pushes slide 1 extra |
| Chasm | A unit pushed in dies (enemies) or is lost (party: dies, Book entry "fell"). Flying units ignore |
| Heat vent (Hour III) | Every 3rd enemy turn, erupts: 3 fire damage on the tile; shows a countdown |

| Prop | Effect |
|---|---|
| Door | Blocks movement/LoS when closed; one action to open/close; the Pale cannot open doors, the Spent can |
| Brazier | Push it over: the tile and the tile beyond ignite |
| Pillar | Blocks LoS; Sunder/push an enemy into it: +2 damage and the pillar may crumble, blocking the tile |
| Barrel (oil) | Breaks when hit or pushed: spills oil in a plus shape |
| Chest | Loot |
| Lamp post (Cistern) | Light source; enemies in light are visible from afar |

### Units
Each unit: **HP**, **Armour** (flat reduction per hit; some pushes and Sunder "break" armour to 0 for the fight), **Move** (tiles), **one Action**, and 2–4 **abilities** with cooldowns (in turns). No mana. No misses.

Damage is a small integer (2–6). Numbers stay small so the player can do the arithmetic in their head; that is what makes "read the room" possible.

**Flanking:** a melee attack against a unit that has an attacker's ally adjacent to it, or from directly behind, deals +1 (Caddis: double).

**Pushing** is the signature verb. Push N: the target slides N tiles directly away from the pusher; stops at walls/units (taking +1 per blocked tile, "slammed"); falls into chasms; lands in water/oil/fire with those effects. Pushing is deterministic and previewed.

### The party
Three units from the roster. Leader choice matters only for exploration pathing. All three must be alive to continue? No: a Lantern of one can still Ascend, but can't go deeper (fiction: "you don't go down short-handed"). This creates a natural decision when one dies.

### Enemy intents
At the start of the player's turn each living enemy chooses and displays its plan. Melee enemies mark the tile(s) they will strike (they move first, then strike; the mark shows where they will strike *if you do nothing*; if their target moves, they re-path and strike whoever is adjacent after moving, which is shown live as you hover moves). Ranged enemies mark a line or tile and will fire there regardless. Support enemies mark whom they will heal. Explosive enemies show their blast radius. The rule is readable: **red tiles are where enemies will hurt you if you end your turn there.**

The preview updates live as you hover a move. This is the single most important UI feature in the game.

### Fog of war and light
Unexplored tiles are black. Explored but unseen tiles are dim and show only props. Units are seen only with line of sight. The party carries a lantern (radius 6 default, upgradeable); enemies in darkness beyond lantern range are not visible unless they stand in a lit tile (lamp posts, braziers, ember veins). Ysolde's Flare and Hal's Mark extend information. This is where the "variables outside the rules" live.

---

## 5. Run Structure

```
Vigil (hub) → Hour I (2 floors + Keeper) → Hour II (2 + Keeper) → Hour III (2 + Keeper) → Hour IV (the Warm Hour: the Hearth, then the choice)
```

(Shipped as two floors per Hour rather than three: with party fights of 3–6 turns, ten floors lands the full run at roughly an hour, the target in §5.)

- A **floor** is 5–8 rooms linked by corridors, 2–3 combat rooms, 1 event room, 0–1 treasure room, stairs down. Target time per floor: 6–8 minutes. Target full run: 60–75 minutes. Partial runs (Ascend after Hour I) ~20 minutes, which is a satisfying session.
- Every combat won offers a **boon** choice (3 options, Hades-style), scaled by Hour: new abilities, ability upgrades (Heave pushes 3), passives (Oriel starts fights with +2 armour).
- **Ember** is the run currency. Found in rooms and dropped by Keepers. Spent at the Vigil on permanent upgrades (Teodor) and on relighting the Great Lamp (story progress).
- **Ascend** is available at every staircase. You keep all ember; the run ends as a success in the fiction.
- **Bank the Lamp** (rest) is available once per Hour at a shrine; heals fully. Not available anywhere else, so there is no free resting.

### Difficulty
Each floor has a **threat budget** spent on enemies and room modifiers. Threat rises per floor and per Hour. The Mastery problem: a deliberately modest **fever** meter rises each time the player banks a successful run; higher fever adds modifiers (more Pale, armoured Spent, extra heat vents) and more ember. Players who bottom-feed (Ascend after Hour I every time) find Hour I quickly becomes less rewarding (ember yield scales with Hour; fever raises Hour I difficulty without raising its yield). This nudges the player on without a wall.

---

## 6. Meta-progression (deliberately modest)

Koster: games should push you to move on, not feed a power fantasy. Meta gains make more *options* available, not bigger numbers.

- **Roster:** start with Oriel, Brann, Ysolde. Caddis and Hal join at the Vigil after run 1 and run 2 (story: they volunteer after the first names are written).
- **Teodor's workshop (ember):** lantern radius +1 (×2), cage capacity (carry more ember past a death: an insurance mechanic), one extra boon offer per Hour, "the Wick" (once per run, a Lamplighter at 0 HP survives at 1 — single use, costly).
- **Knowledge:** Choir Pages (12) are permanent; event cards seen are remembered (their outcomes shown on repeat); Keeper patterns, once seen, are noted in Hal's journal.
- **Story flags:** who has died, what the player knows, which ending is open.

---

## 7. Presentation

- **Camera:** fixed isometric orthographic, yaw 45°, pitch ~35°, 90° snap rotation. Smooth follow with easing; zoom in 3 steps.
- **Look:** low-poly modular dungeon, single-atlas textures, dark ambient with warm point lights (torches, ember, lantern), cool rim light from above in the Cistern shifting to warm orange-white in the Warm Hour. ACES tone mapping, mild bloom on emissives, vignette, distance fog that gets *warmer* (not darker) with depth: Hour I fog is blue-black, Hour IV fog is cream-orange. Fog of war as a darkened overlay that lifts in a soft radius around the lantern.
- **Readability over spectacle in combat:** reach tiles (blue), attack tiles (orange), enemy intents (red hatched), path (dotted line), selected unit (outline). Damage numbers float up, white for damage, cyan for armour absorbed, orange for fire, with an icon.
- **Animation:** idle/walk/attack/hit/death clips from the character packs; attack impact timed to the clip; pushes are tweened slides with a small bounce on slam; deaths leave the model as a corpse for the floor (the Spent later rise from Lamplighter corpses in the fiction).
- **Audio:** ambient loop per Hour; combat layer fades in; footsteps on stone/water; UI clicks are soft; the Book of Spent screen has a pen-scratch sound.
- **UI:** HTML overlay, serif display font for titles, readable humanist body font, parchment-dark palette (#1a1612 ink, #e8dcc4 paper, ember orange #ff8c3a accent, cistern blue #4a7fa5). Tooltips appear after 150 ms; no tooltip ever covers the thing it describes.

---

## 8. Anti-patterns we are designing out

| Anti-pattern | Our answer |
|---|---|
| Door-dancing / kiting forever | Enemies that reach a closed door open it (the Spent) or wait and the fever rises; most rooms are entered, not fought from corridors; intents make kiting a conscious puzzle, not an exploit |
| Resting to full for free | One shrine per Hour |
| Unreadable deaths | Everything is telegraphed; a death always has a visible cause; the Book names it |
| Inventory tedium | No grid; relics are passives; consumables are 2 hotbar slots |
| Stat bloat | HP, Armour, Move, damage. That is all. |
| Grinding | No XP; power comes from boons and position; ember yield scales with depth |
| Overlong runs | 60–75 minutes full; Ascend any time |
| Story walls | Nothing over 100 words appears during a run; hub lines are 30–90 words; everything skippable |

---

## 9. Scope for the first build

**Shipped in the first build:** Vigil hub (roster with permadeath and recruits, the Book of Spent, Teodor's five upgrades, four NPCs with state-driven lines), Hours I–III with two floors and a Keeper each, Hour IV with the Hearth and the three endings, 5 classes with 3 abilities each, 17 enemy types, all floor and prop types above, 22 boons, 12 event cards, 12 Choir Pages, procedural epitaphs, save/continue, settings (volumes, camera follow, Hold confirmation), a developer URL shortcut and a headless autoplayer test.

**Out (later):** multiple save slots, daily seeds, achievements, controller support, localisation.

---

## 10. Test plan

Koster: test the mechanics bare. Before any art is wired up, the combat simulation runs headless in tests: pushes into chasms, water conduction, oil ignition, flanking, intents, undo. Then a "grey box" build with cubes. Only then the real assets. A fun-check: the Cistern's first three rooms must be fun with cubes.
