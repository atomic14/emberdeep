# Emberdeep

*A Lamplighter's descent.* A browser-based isometric roguelike with a small party, turn-based tactical combat on a grid, procedural floors, and a story that persists across deaths.

Two hundred years after the sun went grey, the mountain city of Caddow stays warm by burning the stones it mines from beneath its own streets. You lead the Lamplighters who go down for them. Go down slow.

## Run it

```
npm install
npm run dev        # http://localhost:5180
npm run build      # static bundle in dist/
npm test           # simulation tests + headless autoplayer
```

Developer shortcuts: `?hour=2&floor=1&seed=7&party=knight,mage,rogue` jumps straight into a floor; `&keeper=1` loads that Hour's Keeper arena. In the console, `game.dev.explore()`, `game.dev.fight(n)` and `game.dev.state()` drive a scripted playtest.

## How it plays

- **One click does the obvious thing.** Click a tile to walk the Lantern there, a door to open it, a chest to loot it, an enemy to attack it. Hover first: the game previews the exact outcome before you commit.
- **Enemies decide first.** At the end of their turn every enemy commits to an attack on specific tiles, drawn in red. Step out of red, or push the enemy so it hits something else. Pushing an enemy moves its attack with it.
- **The room is the weapon.** Water conducts lightning. Oil burns and spreads. Chasms are final. Braziers topple. Doors shut. Pillars block sight and crumble. Numbers are small and deterministic, so you can do the arithmetic in your head.
- **Ascend or go deeper.** Every staircase offers the way out with the ember you carry. Coming back is the hard rule.
- **The Vigil remembers.** Companions who die are written in the Book of Spent with an epitaph composed from how they fell. New recruits take their place. Choir Pages found across runs unlock the hidden ending.

## Design

The design is built on Raph Koster's *A Theory of Fun*: the single thing the game teaches is **read the room before you act; position beats power.** See `docs/design.md` for the Koster checklist applied system by system, `docs/story-bible.md` for the world and characters, and `docs/research/` for the research that fed both.

## Layout

```
src/sim/       headless simulation: grid, pathfinding, FOV, rules (push/fire/water), AI, turn engine, generator
src/content/   units, abilities, boons, story (events, Choir pages, hub dialogue, epitaphs, endings)
src/render/    three.js: asset loading, isometric camera + post, world builder (autotiled walls, fog of war, lights), actors, overlays, effects, audio
src/game/      run/meta state, the orchestrator, dev helpers
src/ui/        HUD and full-screen panels (plain DOM)
tests/         vitest: rules, generation, and a headless autoplayer that plays whole runs
```

## Credits

All art and audio are third-party assets used under their licences; see `CREDITS.md`.
