import { PRIMARY_LINKS } from '../router/siteRoutes.mjs';

/**
 * One React-owned catalogue for the existing seven Asteria mega-menu groups.
 * All destinations are real preview bookmarks; no legacy setView/controllers.
 * Account/campaign/player features remain fail-closed until migrated.
 */
const entry = (id, label, description, href, artwork = null) =>
  Object.freeze({ id, label, description, href, artwork });

function group(id, title, entries) {
  const link = PRIMARY_LINKS.find(item => item.id === id);
  if (!link) throw new Error('Menu has no canonical primary destination: ' + id);
  return Object.freeze({ id, title, defaultHref: link.href, entries: Object.freeze(entries) });
}

export const MEGA_MENUS = Object.freeze({
  handbook: group('handbook', 'Asteria Handbook', [
    entry('players-guide', 'Asteria Players Guide', 'Player guides and advice', '#/compendium?group=rules&category=handbook'),
    entry('gm-guide', 'Asteria GM Guide', 'Game Master resources', '#/compendium?group=adventures&category=gm'),
    entry('rules', 'Rules', 'Foundational game rules', '#/compendium?group=rules&category=core'),
    entry('systems', 'Systems', 'Game systems and mechanics', '#/compendium?group=rules'),
    entry('quests', 'Quests', 'Quest and adventure reference', '#/compendium?group=adventures&category=quests'),
    entry('campaigns', 'Campaigns', 'Campaign guidance', '#/compendium?group=adventures')
  ]),
  lore: group('lore', 'Worlds & Lore', [
    entry('worlds', 'Worlds', 'Explore the world', '#/compendium?group=world&category=worlds&q=World'),
    entry('realms', 'Realms', 'The realms of Asteria', '#/compendium?group=world&category=worlds&q=Realm'),
    entry('planes', 'Planes', 'The planes of existence', '#/compendium?group=world&category=worlds&q=Plane'),
    entry('theology', 'Theology', 'Gods and pantheons', '#/compendium?group=world&category=theology'),
    entry('npc', 'NPC', 'People of Asteria', '#/compendium?group=world&category=npcs'),
    entry('lore', 'Lore', 'History and stories', '#/compendium?group=world&category=lore'),
    entry('languages', 'Languages', 'Spoken and written languages', '#/compendium?group=world&category=languages'),
    entry('factions', 'Factions', 'Guilds and factions', '#/compendium?group=world&category=factions')
  ]),
  compendium: group('compendium', 'Asteria Compendium', [
    entry('races', 'Races', 'Playable peoples', '#/compendium?group=characters&category=races'),
    entry('classes', 'Classes', 'Character classes', '#/compendium?group=characters&category=classes'),
    entry('magic', 'Magical & Element', 'Magic and elemental reference', '#/compendium?group=characters&category=magic'),
    entry('resources', 'Resources', 'Materials and resources', '#/compendium?group=equipment&category=resources'),
    entry('blueprints', 'Blueprints', 'Construction blueprints', '#/compendium?group=crafting&category=blueprints'),
    entry('recipes', 'Recipes', 'Recipes and crafting', '#/compendium?group=crafting&category=recipes'),
    entry('schematics', 'Schematics', 'Schematics and plans', '#/compendium?group=crafting&category=schematics'),
    entry('patterns', 'Patterns', 'Crafting patterns', '#/compendium?group=crafting&category=patterns'),
    entry('formulas', 'Formulas', 'Formulas and procedures', '#/compendium?group=crafting&category=formulas'),
    entry('design', 'Design', 'Designs and drawings', '#/compendium?group=crafting&category=designs')
  ]),
  'character-forge': group('character-forge', 'Character Forge', [
    entry('forge-character', 'Forge a Character', 'Create a new hero', '#/character-forge?mode=create'),
    entry('my-characters', 'My Characters', 'Your saved characters', '#/character-forge?view=my-characters')
  ]),
  'campaign-forge': group('campaign-forge', 'Campaign Forge', [
    entry('forge-campaign', 'Forge A Campaign', 'Create a new campaign', '#/campaign-forge?mode=create', 'campaign-book'),
    entry('my-campaigns', 'My Campaigns', 'Your campaigns', '#/campaign-forge?view=my-campaigns'),
    entry('join-campaign', 'Join A Campaign', 'Enter your 12-digit UCN', '#/campaign-forge?mode=join')
  ]),
  friends: group('friends', 'Friends', [
    entry('my-friends', 'My Friends', 'Friends, requests and profiles', '#/account/friends?section=friends'),
    entry('chats', 'Chats', 'Your campaign conversations', '#/account/friends?section=chats')
  ]),
  account: group('account', 'Account', [
    entry('profile', 'Profile', 'Your profile', '#/account/profile'),
    entry('settings', 'Account Settings', 'Account preferences', '#/account/settings'),
    entry('appearance', 'Appearance', 'Website appearance', '#/appearance'),
    entry('security', 'Password & Security', 'Account protection', '#/account/settings?tab=security')
  ])
});

export function getMegaMenu(navId) {
  return Object.hasOwn(MEGA_MENUS, navId) ? MEGA_MENUS[navId] : null;
}

export function filterMegaMenuEntries(menu, query = '') {
  if (!menu) return [];
  const needle = String(query).trim().toLocaleLowerCase();
  if (!needle) return menu.entries;
  return menu.entries.filter(item =>
    (item.label + ' ' + item.description).toLocaleLowerCase().includes(needle));
}
