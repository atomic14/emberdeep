# EMBERDEEP — Story Bible

*A Lamplighter's descent. Working title; the game is "Emberdeep", the guild is "the Vigil", the dungeon is "the Deep".*

---

## Logline

Two hundred years after the sun went grey, the mountain city of Caddow survives by burning the warm stones it mines from beneath its own streets. You are the Lamplighters who go down for them. The thing you have been mining has started to dream about you.

## Thesis

Every great fantasy has an argument underneath it. Ours: **the difference between keeping something and keeping it alive.** Caddow keeps itself alive by keeping the Deep warm. The Church keeps the fires fed. The Warden keeps the Book. The Deep keeps the Lamplighters it takes, the way a child keeps a hot stone in a cold bed. The game asks what you owe to the thing you burn to stay warm, and whether sitting with something is a kind of answer.

This matches the game's single mechanical lesson (see `design.md`): **read the room before you act.** Caddow never read the room. It found warmth and burned it.

## Tone

Cold above, warm below. The city is grey, frugal, kind in small ways and cruel in large ones. The Deep gets warmer, brighter and more comfortable the further you go, and that is the horror. The monsters are not shadows; they are fevers. The writing is spare: short sentences, concrete nouns, dry guild humour, no "thee" and no exclamation marks. Nobody explains the lore to you; you find it in what people do not say and in the pages the Choir left behind.

Reference points for voice: Ursula K. Le Guin's *Tombs of Atuan* (a dark place that is also a home), Susanna Clarke's *Piranesi* (a vast interior, tenderness toward the strange), *Sunless Sea* (short cards, hard choices), *Hades* (a hub that remembers). Never *Diablo*.

---

## The World

### The Grey
In the Year of Ash the sky dimmed and did not recover. Crops failed in the lowlands. The great cities of the plain emptied. Caddow, a hard little mining town on a cold mountain, should have died first. Instead it became the last rich city in the world, because its founders had built over a hole.

### The Shaft and the Ember
The Shaft is an ancient well in the centre of Caddow, far older than the city. In the first winter of the Grey, people climbed down it to get out of the wind, and found that the stones at the bottom were warm.

**Ember** is a porous, faintly glowing stone that is warm to the touch and, when cracked open, burns for years with a soft orange light. One fist of ember heats a house for a winter. Caddow mines it, cages it in iron lanterns, and sells it to every town still standing. Ember is why Caddow has bread.

Ember grows back. Nobody official asks why.

### The Vigil
The Lamplighters' guildhall is built around the Shaft mouth: a round stone hall with a great iron lamp at its centre (the Great Lamp) and a lectern holding **the Book of Spent**, in which every Lamplighter who did not come back is written by hand.

A Lamplighter on their first descent is a **Candle**. A party of three is a **Lantern**. If a Lantern comes back with ember, they relight the Great Lamp from their own lanterns, and the city eats. If nobody comes back, the Warden writes three names.

Guild sayings, used in UI and dialogue:
- "Go down slow." (The game's whole tactical philosophy in three words. Shown on the title screen.)
- "Cold is honest." (Said of bad news given plainly.)
- "Don't count the stairs." (Don't think about how deep you are.)
- "Spent, not lost." (Said when a name is written.)

### The Church of the Kept Flame
Caddow's church teaches that the ember is **the Gift under the Mountain**, given so that the faithful might outlast the Grey. The Church buys the ember, prices it, ships it, and tithes the city. Its clergy are kind, well fed and absolutely sincere. Beneath the official mines, in a place the Lamplighters are not told about, the Church runs **the Stokeworks**: furnaces tended by Stokers who feed fire *into* the Deep. The ember grows faster when the thing beneath is in pain. The Church knows this. It calls the pain "the Kindling" and has a hymn about it.

### The Choir
A heretical circle of Lamplighters and scholars from sixty years ago who went down not to mine but to listen. They concluded the Deep was a single living thing, that it was dying of cold, and that the city was keeping it alive against its will. They wrote what they learned on **Choir Pages** and hid them in the Deep for whoever came after. The Church hanged the ones who came back. The ones who did not come back are still down there, warm, asleep.

### The Deep
Not a mine. The galleries below the Cistern are arched and worked and nobody built them. The Wayfinders' maps are wrong every time; the Deep grows. The Choir's conclusion, which the player pieces together: the Deep is **the Hearth**, something that fell burning ten thousand years ago and has been cooling ever since. Its cooling is its life. Its dreams are what we meet down there. It is not a god and does not want worship. It is cold, and lonely, and in pain, and it has learned that the small warm things with lanterns can be kept.

---

## The Descent (Run Structure)

Lamplighters measure depth in **Hours** of descent. Each Hour is a biome of three floors ending with a **Keeper**: something that was once a person.

### Hour I — The Cistern
Caddow's own drowned under-streets, collapsed into the Shaft over two centuries. Black water, fallen lamp posts, shop signs under the surface. Cold. This is the only honest place in the Deep.

- **Enemies:** *Rats* (swarm, weak, numerous); *the Pale* (people who climbed down to escape the cold and never came up; hollow, slow, drawn to lanterns, grab and hold); *Drowned* (rise from water tiles; vulnerable to lightning through water); *Cistern Spiders* (ranged web, root).
- **Environment lessons taught:** water slows and conducts; chasms kill; doors are chokepoints; oil barrels burn.
- **Keeper: The Ferryman (Aldous Grebe).** Ran the Shaft lifts for forty years. When the lift chains broke he kept lowering people by hand, then by rope, then by promise. He is still lowering them. A tall, patient figure pulling a chain that goes nowhere; the fight is on a platform ringed by chasm, and he pulls party members toward the edge.
  - Before: *"Three of you. That's a light load. Hold the rail."*
  - After: *"Tell Maudrey the lift's running again."*

### Hour II — The Ossuary
Galleries walled with something like bone that is not bone. Warm to the touch. Niches hold Lamplighter badges and lanterns, carefully arranged. The Spent walk here.

- **Enemies:** *the Spent* (skeletal Lamplighters who still remember formation: they hold doors, shield each other, fight in lines); *Spent Archers*; *Tallow Crawlers* (things of melted candle, leave oil trails); *Bone Choristers* (buff/heal the Spent; kill first).
- **Environment lessons:** fire spreads along oil; braziers can be knocked into enemies; flanking matters against shield lines; killing the support first.
- **Keeper: Mother Tallow.** The first Warden of the Vigil. She went down to find her apprentices and stayed to keep them warm. She is a seated figure of a thousand melted candles, and when she stands the floor is wax. She heals the Spent; the fight is about separating her from them.
  - Before: *"You've come down without coats. Come here, come here, I'll have you warm in a minute."*
  - After: *"Who's keeping the Book now? Is it still the big one with the red cover? Good. Good."*

### Hour III — The Stokeworks
Iron, soot, and roaring light. The Church's secret furnace-city. Stokers in leather aprons feed fire into channels cut into the living wall. The wall flinches. Here the player learns what the ember is.

- **Enemies:** *Stokers* (human, armoured, firebrands); *Bellows-Priests* (ranged, push with blasts of hot air); *Ash Hounds* (fast, the Church's dogs dreamt back); *Ember Wights* (explode on death: position matters).
- **Environment lessons:** heat vents on a timer; chains and winches; fire as a wall you can use; enemies that are dangerous to kill in the wrong place.
- **Keeper: The Prelate Below (Ignatius Crane).** Runs the Stokeworks. Kind, reasonable, half ember himself: his left side glows through his vestments. He offers the party a deal mid-fight (an actual choice: accept and the fight ends, with consequences for the ending).
  - Before: *"You've seen it now. Good. I've always said the guild should be told. Sit. There is bread. Let me explain what it costs to keep a city alive."*
  - After (if killed): *"Someone will have to feed it tonight. Someone always does."*

### Hour IV — The Warm Hour
No walls. A slow breathing. Warm light from everywhere and nowhere. Alcoves in the living stone hold sleeping Lamplighters, warm, smiling, badges polished. Some of them are names from the Book. One of them is Oriel's brother. One of them is Pim's mother.

- **The Hearth.** The final encounter is not a boss fight in the usual sense; it is a fight against its fever (dream-forms of everything met above), while the Choir's last page is read aloud, and ends in a choice.

### Ascending
At any staircase between floors the Lantern may **Ascend**: climb out with the ember they carry. Banked ember upgrades the Vigil. Going deeper risks everything for more. This is the game's central risk decision and the fiction supports it: Lamplighters who come back are honoured, whatever they bring.

---

## The Three Endings

Reached by the choice in the Warm Hour. Which choices are available depends on what the player has done across runs.

1. **Bank the Fire** (always available). Leave the Stokeworks burning. Caddow prospers. The Deep's fever worsens; future runs are harder and richer. The sleeping Lamplighters never wake. Sister Anneke thanks you in the Vigil and the Church hangs a banner. *"Warmth for the living."*
2. **Let It Go Out** (available if the player has killed or spared the Prelate without accepting his deal). Quench the heart. The Deep goes cold and quiet. The ember stops growing; Caddow has perhaps thirty years in its stockpile and will have to learn to be a city again. The Kept wake, old, into a cold hall. Oriel's brother asks what year it is. *"Cold is honest."*
3. **Keep the Vigil** (hidden; requires all twelve Choir Pages found across runs and bringing Ysolde or Hal to the Warm Hour). Someone stays. One Lamplighter sits down in an alcove with the Hearth and does not sleep. It stops dreaming of monsters because it is no longer alone. The ember keeps, a little, enough. The Warden opens the Book and writes the name under a heading no one has used before: not *Spent* but **Kept**. *"Go down slow."*

---

## People

### The Vigil (hub)

**Warden Maudrey Hask.** Sixty, one arm, a voice like a shut door. Keeps the Book of Spent and writes every name herself. Lost her arm in the Ossuary thirty years ago and came back alone; the two names from that Lantern are in her handwriting and she still touches them when she passes the lectern. Knows about the Stokeworks. Has decided the city is worth the lie. She is not a villain; she is the game's conscience, and she is wrong about one thing.
- Run 1: *"You're the Candle. Lantern's lit. Three rules: go down slow, don't count the stairs, come back. The third one's the hard one."*
- After a death: *"Spent, not lost. I'll write them tonight. Pick your Lantern."*
- After the Stokeworks: *"Sit. ... Yes. I knew. Thirty years. Tell me what you'd have done with it."*

**Teodor Vell, Lampwright.** Builds lanterns and ember cages. Thin, ink-fingered, nervous laugh, the only person in Caddow who finds things funny. Runs the upgrade shop: lantern radius, cage capacity, spare wicks. Refuses to make weapons: *"I make light. Other people decide what to do in it."*

**Pim.** Nine. Sells wicks and matches at the Shaft mouth and asks every Candle to *"bring back something warm."* If you do (any ember), Pim gives you a small thing: a button, a drawing, a Choir Page she found in her mother's coat. Pim's mother was a Lamplighter. Pim does not know what the Book is for and nobody has told her. She is in the Warm Hour.

**Sister Anneke.** The Church's liaison: buys the ember, pays fairly, remembers your name, brings soup to the Vigil on cold nights. Entirely sincere. After the Stokeworks she is the one who explains the arithmetic of a city, and she is very good at it.

### The Roster (companions; permadeath; new recruits of each class arrive when one is written in the Book)

The classes map to the five Adventurer models: Knight, Barbarian, Mage, Rogue, Ranger.

**Oriel Vance — Shieldwarden (Knight).** Former Watch sergeant. Exact, dry, protective to a fault; stands between people and things. Her younger brother Tam went down as a Candle six years ago. She does not mention this; the Book does, if you read it. Her abilities are about control: *Shield Bash* (push 1), *Hold* (intercept the first attack on an adjacent ally), *Bulwark* (gain armour, draw intents).
- *"I'll go first. That's not bravery, it's the order of march."*

**Brann Kettle — Breaker (Barbarian).** Ember-miner, huge, gentle, terrified of the dark and will not say so. Talks to his pick, which is named Mercy. Abilities are about moving the world: *Heave* (push 2, into walls for damage), *Sunder* (destroy an object or strip armour), *Roar* (all enemy intents in range retarget him).
- *"Mercy says this wall's load-bearing. Mercy's usually right."*

**Ysolde Marrow — Tallowmage (Mage).** Excommunicated Church scholar; reads ember by touch like braille; cheerfully heretical and the only person who wants to go deeper for its own sake. Abilities are about the elements already in the room: *Gust* (push everything in a line), *Kindle* (ignite oil, brazier or unit), *Still* (freeze a water tile into walkable ice; stops conduction), *Flare* (reveal the room, show hidden intents).
- *"The Church says it's a gift. Gifts don't flinch."*

**Caddis — Wickthief (Rogue).** One name. Robbed Church tithe-carts for a decade and took the Lamplighter oath to avoid the gallows. Says nothing kind and does everything kind. Abilities about angles: *Backstab* (double damage from behind or when flanking), *Hook* (pull an enemy 2 tiles toward you), *Smoke* (a tile cloud that breaks line of sight).
- *"Everyone down here was somebody's. Doesn't make them less hungry."*

**Hal Ferrier — Wayfinder (Ranger).** Mapmaker. Quiet; keeps a journal of the Deep's growth; his maps are wrong every time and he keeps making them. Abilities about information and tempo: *Pin* (root a unit in place), *Volley* (hit a 3-tile line), *Mark* (an enemy's intent becomes visible two turns ahead and it takes +1 damage).
- *"It's moved the east gallery again. I'm starting to think it does it when I'm not looking."*

---

## How Story Is Delivered (and how much)

Koster: story bolted onto a game is a side dish. So every beat is short, optional to read closely, and attached to a mechanical moment.

| Channel | Where | Length | Count |
|---|---|---|---|
| Vigil dialogue | Hub, between runs | 30–90 words | Advances with run count + flags |
| Book of Spent entry | On party death | 1–3 lines, composed | One per fallen Lamplighter |
| Event cards | 1 per floor, in a room | 50–100 words, 2–3 choices with real costs | ~30 authored |
| Choir Pages | Hidden in dead-end rooms, chests | 30–60 words | 12 |
| Keeper lines | Before/after each Keeper | 1–2 lines | 4 Keepers |
| Companion barks | On events (low health, kill, loot, descend) | 1 line | ~6 per companion |
| Ending | Warm Hour | ~200 words each | 3 |

### The Book of Spent (procedural epitaphs)
When a companion dies, the Warden writes a line composed from: name, class title, where they fell, what they were doing (last action: *holding a door*, *pulling Caddis back from the edge*, *lighting the oil*), and one fixed truth about them. Example:

> *Brann Kettle. Breaker. Fell in the Cistern, Hour I, holding a door. He was afraid of the dark and went anyway.*

The Book is readable in the Vigil at any time. Reading it is how you learn about Tam Vance.

### Sample Event Card (Cistern)
> **The Lamp Post.** A Caddow street lamp stands upright in the black water, still lit; a cage of ember swings in it, two centuries old. Something has been feeding it. Wet footprints lead away.
> - **Take the ember.** (+1 Ember. The Pale in this floor are drawn to you: next combat starts with two extra.)
> - **Leave it lit.** (Nothing now. Later on this floor you find a dry room with a Choir Page.)
> - **Ysolde reads it.** (Requires Ysolde. Learn the Pale's intents one turn earlier for the rest of the floor.)

### Sample Choir Pages
1. *"We went down to listen. Eleven of us. The Church gave us lanterns and a blessing, which tells you they did not expect us back. Below the Cistern the walls are warm. Rosalind put her hand on one and said it had a pulse. We laughed. We were still at the laughing part."*
7. *"It is not a god. Gods want. This only hurts. I think it fell, a long time ago, burning, and everything since has been it cooling, and the cooling is what it has instead of a life. We have been keeping it warm. We have been keeping it."*
12. *"If you are reading this you have come further than we did. There is nothing to kill down there. I am going to sit with it for a while. If the ember keeps, you will know why. Tell Maudrey — no. She knows. Go down slow."*

---

## Names and Register

Caddow names are English-rural with worn edges: Hask, Vell, Kettle, Ferrier, Grebe, Marrow, Crane. Church names are Latinate: Ignatius, Anneke, Benedek. Things in the Deep are named by what they did: the Ferryman, Mother Tallow, the Prelate Below, the Spent, the Pale, the Kept. Nothing is called a "demon" or a "lich". The word "monster" is never used by anyone except Pim.

UI copy follows the guild voice: *End Turn* is "Hold"; *Rest* is "Bank the Lamp"; *Flee/Retreat* is "Ascend"; the death screen is "The Book of Spent"; new game is "Light a Candle".
