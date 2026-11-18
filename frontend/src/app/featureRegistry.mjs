/**
 * Single migration/activation boundary for React routes.
 * Recognising a bookmark does NOT mean its data, backend or permissions have
 * been migrated. All protected features remain fail-closed until complete.
 */
const define = (domain, requiredServices = [], access = 'public', status = 'preview') =>
  Object.freeze({ domain, requiredServices: Object.freeze([...requiredServices]), access, status });

const HOME = define('shell', [], 'public', 'ready');
const COMPENDIUM = define('compendium', ['compendium']);
const ACCOUNT = define('account', ['auth'], 'protected', 'ready');
const LOGIN = define('account', ['auth']);
const SOCIAL = define('social', ['auth', 'friends'], 'protected','ready');
const CAMPAIGN = define('campaigns', ['auth', 'campaigns'], 'protected','ready');
const CHARACTER = define('characters', ['auth', 'characters'], 'protected','ready');
const GM = define('gameplay', ['auth', 'campaigns', 'gameplay'], 'protected','ready');

export const ROUTE_FEATURES = Object.freeze({
  home: HOME,
  appearance: define('appearance', [], 'public', 'ready'),
  handbook: COMPENDIUM,
  lore: COMPENDIUM,
  compendium: COMPENDIUM,
  'compendium-entry': COMPENDIUM,
  'character-forge': CHARACTER,
  'campaign-forge': CAMPAIGN,
  account: ACCOUNT,
  login: LOGIN,
  'account-create': LOGIN,
  'forgot-password': LOGIN,
  profile: ACCOUNT,
  settings: ACCOUNT,
  friends: SOCIAL,
  notifications: define('social', ['auth', 'notifications'], 'protected','ready'),
  dashboard: GM,
  'gm-dashboard': GM,
  'character-dashboard': define('characters', ['auth', 'characters'], 'protected','ready'),
  presentation: define('gameplay', ['auth', 'campaigns', 'gameplay'], 'protected'),
  invitation: define('campaigns', ['auth', 'campaigns'], 'protected','ready'),
  'not-found': define('system')
});

export function getFeatureForRoute(routeId) {
  return Object.hasOwn(ROUTE_FEATURES, routeId) ? ROUTE_FEATURES[routeId] : ROUTE_FEATURES['not-found'];
}

/**
 * An explicit migration flip is never sufficient to expose private content:
 * the required services must also be registered. Future route loaders must
 * separately enforce Firebase access checks with the authenticated user.
 */
export function canActivateRoute(routeId, services) {
  const feature = getFeatureForRoute(routeId);
  const ready=feature.status==='ready'&&feature.requiredServices.every(key=>services?.has(key)===true);
  // Phase 5.3 connection actions are independently opted in. Simply providing
  // a campaign-settings adapter never unlocks invitations.
  if(routeId==='character-dashboard')return ready&&
    services.get('characters')?.dashboard?.availability().enabled===true;
  if(routeId==='invitation')return ready&&
    services.get('campaigns')?.connections?.availability().enabled===true;
  return ready;
}
