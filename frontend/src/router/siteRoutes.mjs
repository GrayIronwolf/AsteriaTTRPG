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
      currentHash === '#/' || currentHash === '#site-main') {
    return createRoute('home', 'Asteria', 'home', currentHash);
  }

  const alias = HASH_ALIASES[currentHash];
  const routePart = alias || currentHash.replace(/^#/, '');
  const queryOffset = routePart.indexOf('?');
  const path = (queryOffset === -1 ? routePart : routePart.slice(0, queryOffset))
    .replace(/\/+$/, '') || '/';
  const query = new URLSearchParams(queryOffset === -1 ? '' : routePart.slice(queryOffset + 1));

  if (path === '/compendium') {
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

  const entry = path.match(/^\/compendium\/([^/]+)\/([^/]+)$/);
  if (entry) {
    return createRoute('compendium-entry', 'Compendium Entry', 'compendium', currentHash,
      { domain: decodePart(entry[1]), slug: decodePart(entry[2]) }, query);
  }

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
    return createRoute(id, title, navId, currentHash, {}, query);
  }

  return createRoute('not-found', 'Page Not Found', null, currentHash, {}, query);
}
