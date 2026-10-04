# Status: first playable build

## What is here

A complete, playable loop in the browser (`npm run dev`):

- **Title → Vigil (hub) → descent → stairs/Ascend → Keeper → next Hour → the Hearth → one of three endings → Vigil.** Save and continue at any floor start.
- **Tactical combat** on a grid with committed, telegraphed enemy intents (red tiles), deterministic damage, undoable movement, pushes that move an enemy's attack with it, flanking, armour and armour-breaking, line-of-sight and a lantern radius.
- **The room as a weapon:** water (slow, conducts lightning), oil (burns, spreads, left behind by Tallow Crawlers), ice (from boons), chasms (final), heat vents (Hour III), braziers (topple and ignite), barrels (spill oil), pillars (block sight, slam damage, crumble), doors (block sight and the Pale).
- **Five Lamplighters** with three abilities each: Oriel (Shield Bash, Hold, Bulwark), Brann (Heave, Sunder, Roar), Ysolde (Gust, Kindle, Spark), Caddis (Hook, Smoke, Shadowstep), Hal (Pin, Volley, Mark).
- **Seventeen enemies** across four Hours and four Keepers with bespoke behaviour: the Ferryman's chain, Mother Tallow's healing and waking of the Spent, the Prelate's fire line, summons and mid-fight deal, and the Hearth's dreams.
- **Story that survives death:** the Book of Spent with procedurally composed epitaphs, named recruits replacing the fallen, hub lines that react to what happened, twelve Choir Pages, twelve event cards with mechanical stakes, Keeper lines, companion barks, and three endings (one hidden behind thoroughness).
- **Presentation:** KayKit low-poly sets in three.js with a fixed isometric orthographic camera, lowered camera-facing walls, per-Hour colour moods, torch flicker, a lantern light on the party, fog of war in three states, bloom and vignette, floating damage numbers, hover previews computed by simulating the action on a cloned level.
- **Tests:** rules and generation unit tests plus a headless autoplayer that plays twelve full runs with a naive policy (reaches Hour III on most seeds, which is the intended difficulty for someone not reading the room).

## Controls (as shipped)

Left-click does the obvious thing. Hover previews. Right-click / Z undoes or cancels. Space is Hold (combat) or Explore (exploration). 1–4 arm attack and abilities. Tab cycles Lamplighters. WASD/arrows pan, wheel zooms, F toggles camera follow, H help, Esc cancels then opens the menu.

## Known gaps and next steps

- **Balance** is first-pass. The naive autoplayer dies in Hours II–III; a human reading intents should go further. Fever (meta difficulty) only rises on successful ascents past Hour I and on endings.
- **Rats, spiders and hounds** reuse the skeleton minion/rogue models scaled and tinted. They read fine at distance but would benefit from dedicated models (Quaternius/KayKit itch-only packs could not be fetched without a browser click).
- **Relics** from events are simplified to ember and heals; the design doc's relic list is not implemented.
- **Reloading mid-floor** restarts the floor from its seed (pickups return; deaths are permanent). A per-tile floor save would remove the duplicate-pickup edge case.
- **Danger map (hold Alt)** and a one-per-fight full-turn rewind from the research are not implemented.
- **Audio** is wired for every event and all referenced files exist, but mixing levels were set by ear in a few spots only.
- **Assets** total ~170 MB in `dist/` because of the music tracks; trimming or re-encoding would make hosting lighter.

## Where the design lives

`docs/design.md` (Koster checklist applied), `docs/story-bible.md` (world, characters, Hours, endings), `docs/research/` (three research reports: assets, design/controls, three.js stack).
