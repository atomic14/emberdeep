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
- **Save anywhere:** a mid-floor snapshot is written after every action, so a refresh or a closed tab resumes exactly where you were, mid-fight included. Deaths are written to the Book the moment they happen.
- **Tests:** rules and generation unit tests plus a headless autoplayer that plays twelve full runs with a naive policy (reaches Hour III on most seeds, which is the intended difficulty for someone not reading the room).

## Controls (as shipped)

Left-click does the obvious thing. Hover previews. Right-click / Z undoes or cancels. Space is Hold (combat) or Explore (exploration). 1–4 arm attack and abilities. Tab cycles Lamplighters. WASD/arrows pan, wheel zooms, F toggles camera follow, H help, Esc cancels then opens the menu.

## Known gaps and next steps

- **Balance** is first-pass. The naive autoplayer dies in Hours II–III; a human reading intents should go further. Fever (meta difficulty) only rises on successful ascents past Hour I and on endings.
- **Hounds and the Pale** reuse tinted skeleton models; rats and spiders now have small procedural models of their own.
- **Relics** from events are simplified to ember and heals; the design doc's relic list is not implemented.
- **Danger map (hold Alt)** and a one-per-fight full-turn rewind from the research are not implemented.
- **Audio** is wired for every event and all referenced files exist, but mixing levels were set by ear in a few spots only.
- **Assets** total ~170 MB in `dist/` because of the music tracks; trimming or re-encoding would make hosting lighter.

## Where the design lives

`docs/design.md` (Koster checklist applied), `docs/story-bible.md` (world, characters, Hours, endings), `docs/research/` (three research reports: assets, design/controls, three.js stack).

## Playtest log (second pass)

Played several descents by hand in Chrome and with the scripted player. Fixed as a result: auto-explore now runs until something needs you; enemies can only see you when you could see them; the camera frames fights between the two groups instead of snapping to the party; Hold only asks for confirmation when someone could still strike; roots last through the turn they are meant to deny and can never chain (a spider could previously web one Lamplighter forever); the Warden names companions lost on the last run; the hub fits the viewport; Keepers have more HP; the Pale are a little faster so fights do not drag; Stokers and Ember Wights hit less hard; the next Choir Page is always the next one in the Choir's story; enemies that cannot reach anyone for two turns lose interest and the fight ends (a closed door against the Pale used to lock the game in combat forever); rooms cap their enemy count by Hour; everyone recovers 2 HP after a won fight and 2 more on each stair; rats and spiders have their own small models.

Scripted balance after these changes: a naive bot now averages about five turns per fight, clears Hour I on every seed, and dies in Hour II or III. A person who reads the red tiles should go further.
