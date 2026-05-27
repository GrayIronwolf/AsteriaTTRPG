/* Asteria bootstrap state.
   Static globals are intentional here: legacy systems and newer helper modules both read these values. */

var rulePages = (window.ASTERIA_CONTENT && window.ASTERIA_CONTENT.pages) || [];

var users = {
  gm: {
    gm: { password: 'test' }
  },
  player: {
    kael: { password: 'test', character: 'kael' },
    lyra: { password: 'test', character: 'lyra' },
    tharrnak: { password: 'test', character: 'tharrnak' },
    mako: { password: 'test', character: 'mako' }
  }
};

var chars = {
  kael: {
    initial: 'K',
    name: 'Kael',
    race: 'Unselected',
    klass: 'New Character',
    level: 0,
    hp: [10, 10],
    sp: [10, 10],
    mp: [10, 10],
    xp: 0,
    xpMax: 5000,
    campaign: 'Shadows of Elarion',
    session: 'Session 1: New Beginning',
    conditions: [],
    cp: 0,
    tp: 0,
    resourceMods: { hp: 0, sp: 0, mp: 0 }
  },
  lyra: {
    initial: 'L',
    name: 'Lyra',
    race: 'Unselected',
    klass: 'New Character',
    level: 0,
    hp: [10, 10],
    sp: [10, 10],
    mp: [10, 10],
    xp: 0,
    xpMax: 5000,
    campaign: 'Shadows of Elarion',
    session: 'Session 1: New Beginning',
    conditions: [],
    cp: 0,
    tp: 0,
    resourceMods: { hp: 0, sp: 0, mp: 0 }
  },
  tharrnak: {
    initial: 'T',
    name: 'Tharrnak Frostbjorn',
    race: 'Polaris Ursa',
    klass: 'Cleric / Paladin',
    level: 8,
    hp: [132, 132],
    sp: [82, 90],
    mp: [96, 110],
    xp: 6200,
    xpMax: 9000,
    campaign: 'Shadows of Elarion',
    session: 'Session 12: The Eclipse Gate',
    conditions: []
  },
  mako: {
    initial: 'M',
    name: 'Mako Valen Court',
    race: 'Undien',
    klass: 'Artificer / Blood Hunter',
    level: 7,
    hp: [74, 96],
    sp: [60, 80],
    mp: [110, 140],
    xp: 4800,
    xpMax: 8000,
    campaign: 'Shadows of Elarion',
    session: 'Session 12: The Eclipse Gate',
    conditions: []
  }
};

chars.kael.characteristics = { strength: 0, dexterity: 0, agility: 0, constitution: 0, endurance: 0, intelligence: 0, wisdom: 0, charisma: 0, luck: 0 };
chars.lyra.characteristics = { strength: 0, dexterity: 0, agility: 0, constitution: 0, endurance: 0, intelligence: 0, wisdom: 0, charisma: 0, luck: 0 };
chars.tharrnak.characteristics = { strength: 22, dexterity: 10, agility: 10, constitution: 24, endurance: 20, intelligence: 12, wisdom: 18, charisma: 16, luck: 11 };
chars.mako.characteristics = { strength: 12, dexterity: 17, agility: 14, constitution: 16, endurance: 15, intelligence: 23, wisdom: 20, charisma: 11, luck: 10 };

var creatures = {
  'pinocco': {
    name: 'Pinocco',
    type: 'Monster',
    tier: 'Tier 3 Threat',
    hp: 120,
    sp: 60,
    mp: 30,
    ac: 15,
    initiative: 18,
    status: 'None',
    notes: 'A child-spirit trapped in a wooden puppet form, driven to harvest flesh and organs to rebuild what was lost.',
    attacks: [['Puppet Lash', '1d20+6', '1d8+4'], ['Splinter Bite', '1d20+5', '2d6+3']]
  },
  'umbral-stalker': {
    name: 'Umbral Stalker',
    type: 'Monster',
    tier: 'Tier 2 Threat',
    hp: 120,
    sp: 45,
    mp: 40,
    ac: 16,
    initiative: 12,
    status: 'Shadowmarked',
    notes: 'A shadow predator that stalks prey from dim light and broken silhouettes.',
    attacks: [['Claw Rend', '1d20+6', '1d10+4'], ['Umbral Pounce', '1d20+7', '2d6+4']]
  },
  'woodling-scout': {
    name: 'Woodling Scout',
    type: 'Beast / Fae-touched',
    tier: 'Tier 1 Threat',
    hp: 45,
    sp: 30,
    mp: 10,
    ac: 13,
    initiative: 14,
    status: 'None',
    notes: 'A quick forest creature used as a scout or ambusher in wooded regions.',
    attacks: [['Thorn Jab', '1d20+4', '1d6+2']]
  },
  'woodling-brute': {
    name: 'Woodling Brute',
    type: 'Beast / Fae-touched',
    tier: 'Tier 2 Threat',
    hp: 85,
    sp: 55,
    mp: 15,
    ac: 14,
    initiative: 9,
    status: 'None',
    notes: 'A heavier woodling variant that uses strength and terrain to pin enemies down.',
    attacks: [['Branch Slam', '1d20+6', '1d12+4'], ['Root Snare', '1d20+4', '1d6+2']]
  }
};

var campaigns = [
  { name: 'Shadows of Elarion', party: ['kael', 'lyra', 'tharrnak', 'mako'], partySize: 4, access: { dashboard: true, inventory: true, spells: true, journal: true, quests: true, notes: false } },
  { name: 'Secrets of the Void', party: ['mako', 'lyra'], partySize: 2, access: { dashboard: true, inventory: true, spells: true, journal: true, quests: true, notes: false } }
];

var quests = [
  { name: 'The Heart of the Woods', status: 'In Progress', detail: 'Investigate the disturbances in Eldergrove.' },
  { name: 'A Child’s Lament', status: 'In Progress', detail: 'Confront the spirit bound to Pinocco.' },
  { name: 'Fragments of the Fallen', status: '2 / 5', detail: 'Collect five Ancient Shards.' }
];

var session = { role: 'guest', character: null };
var selected = 'kael';
var activeCampaign = 0;
var turnIndex = 0;
var viewedCreature = 'pinocco';

var initiative = [
  { name: 'Lyra', roll: 18, type: 'player' },
  { name: 'Kael', roll: 17, type: 'player' },
  { name: 'Tharrnak', roll: 14, type: 'player' },
  { name: 'Umbral Stalker', roll: 12, type: 'enemy' },
  { name: 'Mako', roll: 9, type: 'player' }
];

var enemies = [
  { id: 'umbral-stalker', name: 'Umbral Stalker', hp: 88, max: 120, status: 'Shadowmarked' },
  { id: 'woodling-scout', name: 'Woodling Scout', hp: 45, max: 45, status: 'None' }
];

window.AsteriaState = {
  get snapshot(){
    return { rulePages, users, chars, creatures, campaigns, quests, session, selected, activeCampaign, turnIndex, viewedCreature, initiative, enemies };
  },
  replaceObjectContents(target, value){
    if(!value || typeof value !== 'object') return target;
    Object.keys(target).forEach(key => delete target[key]);
    Object.assign(target, value);
    return target;
  }
};
