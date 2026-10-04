/** Narrative content: event cards, Choir pages, hub dialogue, keeper lines, barks, epitaphs. Short by design. */

export interface EventChoice {
  text: string;
  stake: string;                    // visible mechanical stake, e.g. "+1 Ember. Two extra Pale next fight."
  requires?: string;                // class id required
  effect: string;                   // effect key handled by the game layer
}
export interface EventCard { id: string; hour: number[]; title: string; body: string; choices: EventChoice[]; }

export const EVENTS: EventCard[] = [
  {
    id: 'lamp_post', hour: [1], title: 'The Lamp Post',
    body: 'A Caddow street lamp stands upright in the black water, still lit. A cage of ember swings in it, two centuries old. Something has been feeding it. Wet footprints lead away.',
    choices: [
      { text: 'Take the ember.', stake: '+2 Ember. The Pale are drawn to you: two more in the next fight.', effect: 'ember:2;extra:pale:2' },
      { text: 'Leave it lit.', stake: 'Nothing now. Somewhere on this floor a dry room holds a Choir Page.', effect: 'page' },
      { text: 'Ysolde reads it.', stake: 'Everyone heals 3. The lamp goes out.', requires: 'mage', effect: 'heal:3' },
    ],
  },
  {
    id: 'shop_sign', hour: [1], title: 'Hask & Daughters, Ironmongers',
    body: 'A shop sign under the surface, letters picked out in brass. The Warden\'s family name. Through the doorway below the water, shelves still hold their goods.',
    choices: [
      { text: 'Dive for the shelves.', stake: 'Leader takes 2 damage (cold). Gain a relic.', effect: 'damage:leader:2;relic' },
      { text: 'Leave it.', stake: 'Nothing. The Warden will hear you were here.', effect: 'flag:saw_hask_sign' },
    ],
  },
  {
    id: 'lift_cage', hour: [1], title: 'The Lift Cage',
    body: 'An iron lift cage hangs over the drop on a chain that disappears upward into the dark. The chain is taut. Something, somewhere above or below, is holding the other end.',
    choices: [
      { text: 'Ring the bell.', stake: 'Summons the floor\'s enemies to you now, in the open. +3 Ember when they are dead.', effect: 'ambush;ember:3' },
      { text: 'Cut the chain.', stake: 'Brann only. The cage falls. Every chasm on this floor is one tile wider.', requires: 'barbarian', effect: 'flag:cut_chain;ember:1' },
      { text: 'Walk on.', stake: 'Nothing.', effect: 'none' },
    ],
  },
  {
    id: 'badges', hour: [2], title: 'The Niche of Badges',
    body: 'A hollow in the warm wall, lined with Lamplighter badges set in neat rows. Someone has polished them. One of them has a name you know.',
    choices: [
      { text: 'Take the badge.', stake: 'Gain a relic: the Badge (the wearer takes 1 less from the Spent). The Spent on this floor fight harder: +1 damage.', effect: 'relic:badge;buff:spent:1' },
      { text: 'Leave them.', stake: 'Everyone heals 2. Oriel, if present, remembers.', effect: 'heal:2;flag:left_badges' },
    ],
  },
  {
    id: 'wax_table', hour: [2], title: 'Set For Supper',
    body: 'A long table of bone, laid for eleven. Candles burn in every place. The food is wax, shaped carefully, still warm. One chair is pulled out, as if for you.',
    choices: [
      { text: 'Sit.', stake: 'Full heal. Mother Tallow knows your names: her Spent spawn one turn sooner.', effect: 'heal:99;flag:sat_at_table' },
      { text: 'Blow out the candles.', stake: 'The floor goes dark: lantern radius -1 here. Gain 2 Ember from the wax.', effect: 'lantern:-1;ember:2' },
      { text: 'Caddis pockets the cutlery.', stake: 'Gain a relic.', requires: 'rogue', effect: 'relic' },
    ],
  },
  {
    id: 'choir_grave', hour: [2], title: 'Rosalind',
    body: 'A grave, which is strange: nothing else down here is buried. A flat stone, a name, and under it, cut deep, GO DOWN SLOW. The stone is warm.',
    choices: [
      { text: 'Read the stone aloud.', stake: 'A Choir Page, if any remain.', effect: 'page' },
      { text: 'Hal copies it.', stake: 'Mark lasts 3 turns instead of 2 for the rest of the run.', requires: 'ranger', effect: 'mod:ranger:mark_turns:1' },
      { text: 'Leave her.', stake: 'Nothing.', effect: 'none' },
    ],
  },
  {
    id: 'stoker_mess', hour: [3], title: 'The Stokers\' Mess',
    body: 'Benches, bowls, a kettle on a hob cut into the living wall. The Stokers eat here between shifts. There is bread. There is a rota pinned to a board with a nail, and your Hour is on it.',
    choices: [
      { text: 'Eat.', stake: 'Everyone heals 4.', effect: 'heal:4' },
      { text: 'Take the rota.', stake: 'Enemy intents on this floor are shown one turn earlier. The Church will know.', effect: 'flag:took_rota;foresight' },
      { text: 'Kick over the kettle.', stake: 'Nothing. Brann feels better.', effect: 'bark:barbarian' },
    ],
  },
  {
    id: 'flinch', hour: [3], title: 'The Wall Flinches',
    body: 'A Stoker channel runs along this gallery, fire fed into a groove in the wall. Where the fire touches, the wall moves, very slightly, the way skin moves when you press a bruise.',
    choices: [
      { text: 'Put the fire out.', stake: 'The ember on this floor stops glowing: -2 Ember found here. Mark one Choir Page as understood.', effect: 'ember:-2;flag:put_out_channel' },
      { text: 'Feed it.', stake: '+3 Ember. The wall screams; every enemy on the floor comes to you.', effect: 'ember:3;ambush' },
      { text: 'Ysolde puts her hand on it.', stake: 'Ysolde takes 3 (burn). Learn the Hearth\'s nature.', requires: 'mage', effect: 'damage:mage:3;flag:touched_wall' },
    ],
  },
  {
    id: 'kept', hour: [4], title: 'An Alcove',
    body: 'A man asleep in a hollow of warm stone, a Lamplighter badge on his coat. He is smiling. His name is stitched inside his collar: T. VANCE.',
    choices: [
      { text: 'Wake him.', stake: 'He cannot wake. Oriel, if present, takes 3 (grief) and gains +2 damage for the fight ahead.', effect: 'flag:found_tam;grief' },
      { text: 'Let him sleep.', stake: 'Nothing. You will remember where he is.', effect: 'flag:found_tam' },
    ],
  },
  {
    id: 'pims_mother', hour: [4], title: 'A Coat You Know',
    body: 'A woman asleep in an alcove. Her coat has a child\'s drawing folded in the pocket: a tall shape with a lantern, and a small shape, and the word MUM.',
    choices: [
      { text: 'Take the drawing for Pim.', stake: 'Gain the drawing. Pim will have something warm.', effect: 'flag:pim_drawing' },
      { text: 'Leave it with her.', stake: 'Nothing.', effect: 'none' },
    ],
  },
  {
    id: 'cold_room', hour: [1, 2, 3], title: 'A Cold Room',
    body: 'The one honest place on the floor: no ember, no warmth, frost on the walls. Your breath shows. Nothing is dreaming here.',
    choices: [
      { text: 'Rest a moment.', stake: 'Everyone heals 2. Burning ends.', effect: 'heal:2' },
      { text: 'Move on.', stake: 'Nothing.', effect: 'none' },
    ],
  },
  {
    id: 'drip', hour: [1, 2], title: 'The Drip',
    body: 'Water falls from somewhere above into a stone basin, one drop at a time, and has done so for two hundred years. The basin is full of coins. People made wishes here, once.',
    choices: [
      { text: 'Take the coins.', stake: '+1 Ember. Caddis, if present, is pleased.', effect: 'ember:1;bark:rogue' },
      { text: 'Make a wish.', stake: 'One random ability cooldown is 1 lower for this run.', effect: 'wish' },
    ],
  },
];

export const CHOIR_PAGES: Record<number, string> = {
  1: 'We went down to listen. Eleven of us. The Church gave us lanterns and a blessing, which tells you they did not expect us back. Below the Cistern the walls are warm. Rosalind put her hand on one and said it had a pulse. We laughed. We were still at the laughing part.',
  2: 'The Pale are not dead. We have checked. They breathe, slowly, and they follow the lanterns, and when we put the lanterns out they stood quite still and waited. Benedek says they came down in the first winter for the warmth and never found a reason to go back. I think that is the whole of it.',
  3: 'The galleries below the Cistern are not mined. Nobody cut them. The arches are grown, like the inside of a shell. Hal would say: they are the shape of something breathing.',
  4: 'The Spent fight in lines. They hold doors. They shield each other. They are still Lamplighters, in whatever is left of them. I do not know if that is comforting. Rosalind says it is a kind of memory, and the thing below is keeping it, the way you keep a letter.',
  5: 'Ember is warm because it is alive. We cracked one open and it did not burn; it bled light, slowly, for a day, and then it was stone. Caddow has been burning them for two hundred years. I have stopped being able to look at a lantern.',
  6: 'There is a place below the Ossuary where the Church keeps fires going into the wall. Not out of it. Into it. The men there are called Stokers and they are kind and they fed us. The wall flinches where the fire touches. The ember grows thickest there. I understand now, and I wish I did not.',
  7: 'It is not a god. Gods want. This only hurts. I think it fell, a long time ago, burning, and everything since has been it cooling, and the cooling is what it has instead of a life. We have been keeping it warm. We have been keeping it.',
  8: 'It dreams. The things we fight are its fever: our own shapes, handed back. The Pale are its dream of the people who came for warmth. The Spent are its dream of us. I do not want to see what it dreams of the Church.',
  9: 'Rosalind is gone. Not dead. There is an alcove, and she is in it, and she is warm, and she is smiling, and she will not wake. It has taken her the way a child takes a hot stone to bed. I sat with her for a day. I am ashamed to say she looked happy.',
  10: 'We argued all night. Benedek wants to quench it: let it go cold, let it die, let Caddow learn to be a city again on what is stockpiled. Mira wants to go back and tell them. I said: tell them what? That the bread is warm because something is screaming? They will hang us and eat the bread.',
  11: 'Four of us left. We are going down to the end of it. If you find this page you are a Lamplighter and you were told to go down slow. Here is what that means. It means look at the room before you act in it. It means the thing in front of you is not the only thing in the room. It means we never did.',
  12: 'If you are reading this you have come further than we did. There is nothing to kill down there. I am going to sit with it for a while. If the ember keeps, you will know why. Tell Maudrey. No. She knows. Go down slow.',
};

/** Hub dialogue, selected by the game layer from flags and run count. Each entry: speaker, condition key, lines. */
export interface HubLine { speaker: 'warden' | 'teodor' | 'pim' | 'anneke'; when: string; text: string; once?: boolean }
export const HUB_LINES: HubLine[] = [
  { speaker: 'warden', when: 'run:1', text: 'You\'re the Candle: first time down. Pick three; that\'s your Lantern. The job is ember. Bring it up and the city eats; climb out at any stair and I bank it. Three rules: go down slow, don\'t count the stairs, come back. The third one\'s the hard one.', once: true },
  { speaker: 'warden', when: 'deaths:1', text: 'Spent, not lost. I\'ll write them tonight. Pick your Lantern.', once: true },
  { speaker: 'warden', when: 'lost', text: '{lost}. I\'ll write it tonight, in the big book with the red cover. You came back, which is the rule. Sit a minute before you choose again.' },
  { speaker: 'warden', when: 'deaths:3', text: 'You read the Book. Good. Everyone should. There are two names in my hand near the front. I don\'t need to tell you how I know their handwriting was worse than mine.', once: true },
  { speaker: 'warden', when: 'flag:saw_hask_sign', text: 'My grandmother\'s shop. The water took it the third winter. She said the ember would see us through. It did. It has. ...Go on, then.', once: true },
  { speaker: 'warden', when: 'flag:reached_hour3', text: 'Sit. ... Yes. I knew. Thirty years. Tell me what you\'d have done with it, and then tell me what you\'d have done with the winter.', once: true },
  { speaker: 'warden', when: 'flag:reached_hour2', text: 'The Ossuary. Hold your lines and kill the singers first. If you see a woman made of candles, do not let her hold your hand.', once: true },
  { speaker: 'warden', when: 'ascended:1', text: 'You came back. That\'s the rule people forget. Bank it with Teodor and sleep.', once: true },
  { speaker: 'warden', when: 'default', text: 'Go down slow.' },
  { speaker: 'teodor', when: 'run:1', text: 'I make light. Other people decide what to do in it. Bring me ember and I\'ll make you more of it: wider lanterns, warmer coats, a spare breath. Don\'t ask me for a sword; I\'d only hurt myself.', once: true },
  { speaker: 'teodor', when: 'ember:5', text: 'That\'s real ember, that. Warm as a hand. I could widen your lantern\'s throw with that. Or stitch you a Wick: one more breath when you\'ve none left.', once: true },
  { speaker: 'teodor', when: 'default', text: 'Lantern\'s a lantern. Light goes where you point it. The trick is deciding where to point.' },
  { speaker: 'pim', when: 'run:1', text: 'Are you going down? Bring back something warm. Mum used to.', once: true },
  { speaker: 'pim', when: 'ember:1', text: 'You brought something! Here. It\'s a button. It was in Mum\'s coat. You can have it, I\'ve got the other one.', once: true },
  { speaker: 'pim', when: 'flag:pim_drawing', text: '...That\'s mine. I drew that. Where did you... Is she warm? Is she warm down there?', once: true },
  { speaker: 'pim', when: 'default', text: 'Bring back something warm.' },
  { speaker: 'anneke', when: 'run:2', text: 'The Church pays fair and pays today. Whatever you bring up, the city eats tonight because of you. I mean that. Soup\'s on the stove.', once: true },
  { speaker: 'anneke', when: 'flag:reached_hour3', text: 'You\'ve seen the Stokeworks. Then you know the arithmetic. Eleven thousand people. Forty towns. One winter without ember and I can tell you to the week when the children start to die. I have the figures. Would you like to see them?', once: true },
  { speaker: 'anneke', when: 'default', text: 'Warmth for the living. Mind the stairs.' },
];

export const KEEPER_LINES: Record<string, { before: string; after: string }> = {
  ferryman: { before: '"Three of you. That\'s a light load. Hold the rail."', after: '"Tell Maudrey the lift\'s running again."' },
  tallow: { before: '"You\'ve come down without coats. Come here, come here, I\'ll have you warm in a minute."', after: '"Who\'s keeping the Book now? Is it still the big one with the red cover? Good. Good."' },
  prelate: { before: '"You\'ve seen it now. Good. I\'ve always said the guild should be told. Sit. There is bread. Let me explain what it costs to keep a city alive."', after: '"Someone will have to feed it tonight. Someone always does."' },
  hearth: { before: 'It does not speak. The warmth comes up through your boots like a held breath.', after: '' },
};

export const HOUR_INTRO: Record<number, string> = {
  1: 'The Cistern. Caddow\'s own drowned streets, fallen into the Shaft. Cold water, honest dark. The Pale follow lanterns.',
  2: 'The Ossuary. The walls are warm here. Lamplighter badges in neat rows. The Spent still hold their lines.',
  3: 'The Stokeworks. Iron, soot and roaring light. The Church feeds fire into the wall, and the wall flinches.',
  4: 'The Warm Hour. No walls. A slow breathing. In the alcoves, the Kept sleep, smiling.',
};

export const BARKS: Record<string, Record<string, string[]>> = {
  knight: { lowhp: ['I\'ll hold.', 'Not yet.'], kill: ['Down.', 'Next.'], descend: ['I\'ll go first. That\'s not bravery, it\'s the order of march.'], ally_down: ['No. No, get up.'], fire: ['Mind the oil.'] },
  barbarian: { lowhp: ['Mercy says that hurt.', 'Still standing.'], kill: ['Sorry.', 'Mercy\'s right again.'], descend: ['Dark down there. Fine. Fine.'], ally_down: ['I\'ve got you. I\'ve got you.'], fire: ['That\'ll spread.'] },
  mage: { lowhp: ['Ow. Noted.', 'That is a lot of blood.'], kill: ['Gifts don\'t flinch. That did.'], descend: ['Warmer. Interesting. Bad, but interesting.'], ally_down: ['Stay with me. Stay.'], fire: ['Oh, that\'s lovely.'] },
  rogue: { lowhp: ['Fine.', 'Had worse from the Watch.'], kill: ['Somebody\'s.', 'Hungry, though.'], descend: ['Don\'t count the stairs.'], ally_down: ['Get up. I\'m not carrying you.'], fire: ['Mind your coat.'] },
  ranger: { lowhp: ['Noting that.', 'Still mapping.'], kill: ['Marked.'], descend: ['The east gallery\'s moved again.'], ally_down: ['...I\'ll write it down.'], fire: ['Wind\'s wrong for that.'] },
};

/** One fixed truth per named companion, for the Book of Spent. */
export const TRUTHS: Record<string, string> = {
  'Oriel Vance': 'Her brother went down before her. She never said so.',
  'Brann Kettle': 'He was afraid of the dark and went anyway.',
  'Ysolde Marrow': 'She wanted to see it. She said so, and meant it.',
  'Caddis': 'Said nothing kind. Did nothing else.',
  'Hal Ferrier': 'His maps were wrong every time. He kept making them.',
};

export function epitaph(name: string, title: string, hourName: string, hour: number, lastAction: string | undefined, cause: string): string {
  const where = `Fell in ${hourName}, Hour ${['I', 'II', 'III', 'IV'][hour - 1]}`;
  const doing = lastAction ? `, ${lastAction}` : '';
  const truth = TRUTHS[name] ?? pickTruth(name);
  return `${name}. ${title}. ${where}${doing}. Taken by ${cause}. ${truth}`;
}
function pickTruth(name: string) {
  const t = ['Came back once. Went down again.', 'Kept the rules. All three.', 'Did not count the stairs.', 'Was warm to the end.', 'Asked to go.'];
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0; return t[h % t.length];
}

export const ENDINGS: Record<string, { title: string; text: string }> = {
  bank: {
    title: 'Warmth for the Living',
    text: 'You climb. The Stokeworks roar behind you and the wall flinches and the ember grows thick as frost. Caddow eats. The Church hangs a banner from the Vigil\'s door, and Sister Anneke brings soup, and means it.\n\nThe Deep dreams worse each year. The Book fills faster. In the alcoves the Kept sleep on, smiling, and Pim grows up selling wicks at the Shaft mouth, and nobody tells her what the Book is for.\n\nThe Warden writes your names in the front, under a heading of her own: Came Back. She does not say whether it is praise.',
  },
  quench: {
    title: 'Cold Is Honest',
    text: 'You put it out. It takes the whole of the Warm Hour and all the water in the Cistern and when it is done the breathing stops and the light goes grey, and for the first time in ten thousand years the thing beneath the mountain is not in pain.\n\nThe Kept wake, old. Tam Vance asks what year it is. Pim\'s mother asks for her coat.\n\nCaddow has thirty years of ember in the cellars and a winter to learn to be a city again. Sister Anneke has the figures. The Warden closes the Book and does not open it again, and the guild goes down one last time, with coats, to bring everyone home.',
  },
  keep: {
    title: 'Kept',
    text: 'Someone stays. One of you sits down in an alcove and does not sleep, and talks, the way you would talk to anyone who was cold and alone and hurting in the dark. It stops dreaming of monsters. The ember keeps, a little. Enough.\n\nThe others climb. In the Vigil the Warden opens the Book and turns past Spent to a page nobody has used, and writes one name under a heading she has to think about for a long time before she chooses it.\n\nKept.\n\nGo down slow.',
  },
};
