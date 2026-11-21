/**
 * Single route registry for the future React site.
 * Existing bookmarks are hash URLs. The new app does not mutate legacy views,
 * inject CSS, overwrite global handlers or request Firebase privileges.
 */
export const PRIMARY_LINKS = Object.freeze([
  { id: 'home', label: 'Home', href: '#home' },
  { id: 'handbook', label: 'Asteria Handbook', href: '#/compendium?group=rules&category=handbook' },
  { id: 'lore', label: 'Worlds & Lore', href: '#/compendium?group=world' },
  { id: 'compendium', label: 'Asteria Compendium', href: '#/compendium' },
  { id: 'character-forge', label: 'Character Forge', href: '#/character-forge' },
  { id: 'campaign-forge', label: 'Campaign Forge', href: '#/campaign-forge' },
  { id: 'friends', label: 'Friends', href: '#/account/friends' },
  { id: 'account', label: 'Account', href: '#/account' }
]);

const STATIC_ROUTES = Object.freeze({
  '/character-forge': ['character-forge', 'Character Forge', 'character-forge'],
  '/campaign-forge': ['campaign-forge', 'Campaign Forge', 'campaign-forge'],
  '/campaign-invitation': ['invitation', 'Campaign Invitation', 'campaign-forge'],
  '/version-log': ['version-log', 'Version Log', null],
  '/account': ['account', 'Account', 'account'],
  '/appearance': ['appearance', 'Appearance', 'account'],
  '/account/login': ['login', 'Login', 'account'],
  '/account/create': ['account-create', 'Create Account', 'account'],
  '/account/forgot-password': ['forgot-password', 'Reset Password', 'account'],
  '/account/profile': ['profile', 'My Profile', 'account'],
  '/account/settings': ['settings', 'Account Settings', 'account'],
  '/account/friends': ['friends', 'Friends', 'friends'],
  '/account/notifications': ['notifications', 'Notifications', 'account'],
  '/dashboard': ['dashboard', 'Dashboard', 'account']
});

const HASH_ALIASES = Object.freeze({
  '#playerHome': '/character-forge',
  '#campaigns': '/campaign-forge',
  '#loginPage': '/account/login',
  '#accountCreate': '/account/create',
  '#forgotPassword': '/account/forgot-password',
  '#devLog': '/version-log',
  '#asteriaFriendsPage': '/account/friends',
  '#asteriaNotificationsPage': '/account/notifications',
  '#asteriaAccountPage': '/account',
  '#gm': '/dashboard',
  '#/login': '/account/login',
  '#/register': '/account/create',
  '#/friends': '/account/friends',
  '#/notifications': '/account/notifications',
  '#/handbook': '/compendium?group=rules&category=handbook',
  '#/world': '/compendium?group=world'
});

// The original universal Compendium domain vocabulary. Scope aliases are
// explicit so unknown paths never fall back to the Handbook.
const COMPENDIUM_DOMAINS = Object.freeze({
  race: 'race', races: 'race',
  class: 'class', classes: 'class',
  creature: 'creature', creatures: 'creature',
  item: 'item', items: 'item', flora: 'item', minerals: 'item', materials: 'item',
  spell: 'spell', spells: 'spell', magic: 'spell',
  talent: 'talent', talents: 'talent',
  profession: 'profession', professions: 'profession',
  skill: 'skill', skills: 'skill',
  origin: 'origin', origins: 'origin', backgrounds: 'origin',
  location: 'location', locations: 'location', world: 'location', worlds: 'location',
  realm: 'location', realms: 'location', plane: 'location', planes: 'location',
  religion: 'religion', religions: 'religion', theology: 'religion', theologies: 'religion',
  god: 'religion', gods: 'religion', deity: 'religion', deities: 'religion',
  pantheon: 'religion', pantheons: 'religion', court: 'religion', courts: 'religion',
  faction: 'faction', factions: 'faction', guild: 'faction', guilds: 'faction',
  organization: 'faction', organizations: 'faction', organisation: 'faction', organisations: 'faction',
  lore: 'lore', history: 'lore', histories: 'lore', timeline: 'lore', timelines: 'lore', legend: 'lore',
  handbook: 'handbook', rules: 'handbook'
});
const COLLECTIONS = new Set(['flora', 'minerals', 'materials']);

function domainKey(value) {
  return decodePart(value).toLowerCase().replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '').replace(/-compendium$/, '');
}

function compendiumDomain(key) {
  return Object.hasOwn(COMPENDIUM_DOMAINS, key) ? COMPENDIUM_DOMAINS[key] : null;
}

function compendiumEntry(domain, reference, hash, query) {
  return createRoute('compendium-entry', 'Compendium Entry', 'compendium', hash,
    { domain, slug: decodePart(reference) }, query);
}

function scopedCompendium(domain, key, hash, query) {
  query.set('domain', domain);
  if (COLLECTIONS.has(key)) {
    if (!query.has('filter')) query.set('filter', 'collection');
    if (!query.has('value')) query.set('value', key);
  }
  return createRoute('compendium', 'Asteria Compendium', 'compendium', hash,
    { legacyDomain: true }, query);
}

function readCompendiumPath(path, hash, query) {
  const namespaced = path.match(/^\/?compendium\/([^/]+)(?:\/(.+))?$/);
  if (namespaced) {
    const [, rawDomain, reference] = namespaced;
    const key = domainKey(rawDomain);
    const domain = compendiumDomain(key);
    if (domain) return reference
      ? compendiumEntry(domain, reference, hash, query)
      : scopedCompendium(domain, key, hash, query);
    // Keep the error page that already handled a malformed entry address.
    return reference && !reference.includes('/')
      ? compendiumEntry(decodePart(rawDomain), reference, hash, query) : null;
  }

  const reference = path.replace(/^\//, '');
  const [first, second] = reference.split('/', 2);
  const key = domainKey(first);
  const domain = compendiumDomain(key);
  if (domain && second) return compendiumEntry(domain, reference, hash, query);
  if (domain && COLLECTIONS.has(key)) return scopedCompendium(domain, key, hash, query);

  // Source references remain lookup keys, never URLs to fetch.
  const decodedReference = decodePart(reference);
  if (second && /\.md$/i.test(decodedReference)) {
    const folder = domainKey(second);
    const sourceDomain = key === 'content' ? compendiumDomain(folder) : null;
    if (sourceDomain) return compendiumEntry(sourceDomain, reference, hash, query);
    if (key === 'asteria-ttrpg' && folder === 'z-asteria-handbook') {
      return compendiumEntry('handbook', reference, hash, query);
    }
  }

  // Original indexes also exposed typed ID and wiki references as bookmarks.
  const identity = decodedReference.match(/^(?:(wiki|creature-manifest):)?([a-z]+):.+$/i);
  if (!identity) return null;
  const namespace = identity[1]?.toLowerCase();
  const type = identity[2].toLowerCase();
  if (namespace === 'wiki' && !COLLECTIONS.has(type)) return null;
  if (namespace === 'creature-manifest' && type !== 'creature') return null;
  const typedDomain = compendiumDomain(type);
  return typedDomain ? compendiumEntry(typedDomain, reference, hash, query) : null;
}

function decodePart(part) {
  try { return decodeURIComponent(part); }
  catch { return String(part); }
}

function createRoute(id, title, navId, hash, params = {}, query = new URLSearchParams()) {
  return { id, title, navId, hash, params, query };
}

export function parseSiteRoute({ hash = '', search = '' } = {}) {
  const currentHash = String(hash ?? '').trim();
  const queryString = String(search ?? '');

  // Invitations are recognised, but are never redeemed or displayed by this
  // preview. They require the existing secure Firebase service when migrated.
  if (/^#(?:secure-campaign-invite|campaign-invite)=/i.test(currentHash)) {
    return createRoute('invitation', 'Campaign Invitation', null, currentHash);
  }

  // Explicit navigation takes priority over a stale query invitation.
  if (!currentHash || currentHash === '#') {
    const urlQuery = new URLSearchParams(queryString);
    if (urlQuery.has('campaign-invite') || urlQuery.has('invite')) {
      return createRoute('invitation', 'Campaign Invitation', null, currentHash);
    }
    return createRoute('home', 'Asteria', 'home', currentHash);
  }

  if (currentHash === '#home' || currentHash === '#/home' ||
      currentHash === '#/' || currentHash === '#site-main' || currentHash === '#mainContent') {
    return createRoute('home', 'Asteria', 'home', currentHash);
  }

  const alias = HASH_ALIASES[currentHash];
  const routePart = alias || currentHash.replace(/^#/, '');
  const queryOffset = routePart.indexOf('?');
  const path = (queryOffset === -1 ? routePart : routePart.slice(0, queryOffset))
    .replace(/\/+$/, '') || '/';
  const query = new URLSearchParams(queryOffset === -1 ? '' : routePart.slice(queryOffset + 1));

  if (path === '/compendium' || path === 'compendium') {
    const group = query.get('group');
    const category = query.get('category');
    if (group === 'rules' && category === 'handbook') {
      return createRoute('handbook', 'Asteria Handbook', 'handbook', currentHash, {}, query);
    }
    if (group === 'world') {
      return createRoute('lore', 'Worlds & Lore', 'lore', currentHash, {}, query);
    }
    return createRoute('compendium', 'Asteria Compendium', 'compendium', currentHash, {}, query);
  }

  const compendium = readCompendiumPath(path, currentHash, query);
  if (compendium) return compendium;

  const join = path.match(/^\/join\/(\d{12})$/);
  if (join) {
    return createRoute('invitation', 'Campaign Invitation', null, currentHash, { code: join[1] }, query);
  }

  const owned = path.match(/^\/react\/owned-character\/([^/]+)$/);
  if (owned) {
    return createRoute('character-dashboard', 'Character Dashboard', null, currentHash,
      { characterId: decodePart(owned[1]) }, query);
  }

  const gm = path.match(/^\/react\/gm\/([^/]+)$/);
  if (gm) {
    return createRoute('gm-dashboard', 'GM Dashboard', null, currentHash,
      { campaignId: decodePart(gm[1]) }, query);
  }

  const character = path.match(/^\/react\/character\/([^/]+)\/([^/]+)$/);
  if (character) {
    return createRoute('character-dashboard', 'Character Dashboard', null, currentHash,
      { campaignId: decodePart(character[1]), characterId: decodePart(character[2]) }, query);
  }

  const presentation = path.match(/^\/react\/presentation\/([^/]+)$/);
  if (presentation) {
    return createRoute('presentation', 'Player Presentation', null, currentHash,
      { campaignId: decodePart(presentation[1]) }, query);
  }

  if (Object.prototype.hasOwnProperty.call(STATIC_ROUTES, path)) {
    const [id, title, navId] = STATIC_ROUTES[path];
    if (id === 'character-forge' || id === 'campaign-forge') {
      const mode = query.get('mode');
      if (id === 'campaign-forge' && mode === 'join') {
        return createRoute('invitation', 'Campaign Invitation', navId, currentHash, { intent: 'join' }, query);
      }
      const intent = mode === 'create' ? 'create' : 'list';
      return createRoute(id, title, navId, currentHash, { intent }, query);
    }
    return createRoute(id, title, navId, currentHash, {}, query);
  }

  return createRoute('not-found', 'Page Not Found', null, currentHash, {}, query);
}
