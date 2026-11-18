import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createDisposableScope } from '../frontend/src/runtime/disposableScope.mjs';
import {
  createLocationStore, readLocationKey, parseLocationKey
} from '../frontend/src/router/locationStore.mjs';
import {
  createAppServices, previewServices, ServiceUnavailableError, SERVICE_DOMAINS
} from '../frontend/src/services/appServices.mjs';
import {
  ROUTE_FEATURES, getFeatureForRoute, canActivateRoute
} from '../frontend/src/app/featureRegistry.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFileSync(resolve(repoRoot, path), 'utf8');

function fakeLocationSource() {
  const callbacks = new Map([['hashchange', new Set()], ['popstate', new Set()]]);
  return {
    location: { hash: '', search: '' },
    addEventListener(type, fn) { callbacks.get(type)?.add(fn); },
    removeEventListener(type, fn) { callbacks.get(type)?.delete(fn); },
    dispatch(type) { for (const fn of [...callbacks.get(type)]) fn(); },
    count(type) { return callbacks.get(type).size; }
  };
}

test('shared location source owns one listener pair for all subscribers', () => {
  const source = fakeLocationSource();
  const store = createLocationStore(source);
  assert.equal(store.getSnapshot(), '\u0000');
  assert.equal(store.getServerSnapshot(), '\u0000');
  assert.deepEqual(parseLocationKey(store.getSnapshot()), { hash: '', search: '' });

  let a = 0;
  let b = 0;
  const unsubscribeA = store.subscribe(() => { a += 1; });
  const unsubscribeB = store.subscribe(() => { b += 1; });
  assert.equal(store.getSubscriberCount(), 2);
  assert.equal(source.count('hashchange'), 1);
  assert.equal(source.count('popstate'), 1);
  source.location.hash = '#/compendium';
  source.dispatch('hashchange');
  source.dispatch('popstate'); // same URL: must not publish twice
  assert.equal(a, 1);
  assert.equal(b, 1);
  assert.deepEqual(parseLocationKey(store.getSnapshot()), { search: '', hash: '#/compendium' });

  unsubscribeA();
  unsubscribeA(); // StrictMode-style cleanup remains idempotent
  assert.equal(source.count('hashchange'), 1);
  source.location.hash = '#/account';
  source.dispatch('hashchange');
  assert.equal(a, 1);
  assert.equal(b, 2);

  unsubscribeB();
  assert.equal(store.getSubscriberCount(), 0);
  assert.equal(source.count('hashchange'), 0);
  assert.equal(source.count('popstate'), 0);

  let remounted = 0;
  const unsubscribeAgain = store.subscribe(() => { remounted += 1; });
  assert.equal(source.count('hashchange'), 1);
  source.location.search = '?campaign-invite=x';
  source.dispatch('popstate');
  assert.equal(remounted, 1);
  assert.equal(readLocationKey(source.location), '?campaign-invite=x\u0000#/account');
  unsubscribeAgain();
  assert.equal(source.count('hashchange'), 0);
  assert.equal(source.count('popstate'), 0);
});

test('disposable scope releases listeners and realtime callbacks even on errors', () => {
  const source = fakeLocationSource();
  const scope = createDisposableScope();
  let cleanupCount = 0;
  const detach = scope.listen(source, 'hashchange', () => {});
  scope.own(() => { cleanupCount += 1; });
  assert.equal(scope.count, 2);
  assert.equal(source.count('hashchange'), 1);
  detach();
  detach();
  assert.equal(source.count('hashchange'), 0);
  assert.equal(scope.count, 1);
  scope.dispose();
  scope.dispose();
  assert.equal(scope.disposed, true);
  assert.equal(scope.count, 0);
  assert.equal(cleanupCount, 1);
  assert.throws(() => scope.listen(source, 'popstate', () => {}), /disposed scope/);

  const errorScope = createDisposableScope();
  errorScope.own(() => { throw new Error('expected cleanup error'); });
  errorScope.own(() => { cleanupCount += 1; });
  assert.throws(() => errorScope.dispose(), AggregateError);
  assert.equal(cleanupCount, 2, 'Other cleanups still run after one fails');
});

test('services are explicit, immutable, known-domain adapters; no live Firebase', () => {
  assert.equal(previewServices.has('auth'), false);
  assert.equal(previewServices.has('campaigns'), false);
  assert.equal(previewServices.get('auth'), null);
  assert.throws(() => previewServices.require('auth'), ServiceUnavailableError);
  assert.throws(() => previewServices.require('auth'), /not been migrated/);
  assert.equal(SERVICE_DOMAINS.includes('gameplay'), true);
  assert.throws(() => createAppServices(null), TypeError);
  assert.throws(() => createAppServices({ unknown: {} }), /Unknown Asteria service domain/);
  assert.throws(() => createAppServices({ auth: null }), /explicitly implemented object/);
  const auth = { currentUser: () => ({ id: 'test' }) };
  const stub = createAppServices({ auth });
  assert.ok(Object.isFrozen(stub));
  assert.equal(stub.has('auth'), true);
  assert.equal(typeof stub.require('auth').currentUser, 'function');
  assert.equal(stub.has('campaigns'), false);
  assert.throws(() => stub.require('campaigns'), ServiceUnavailableError);
});

test('every future React destination has a fail-closed migration owner', () => {
  const routes = [
    'home', 'appearance', 'handbook', 'lore', 'compendium', 'compendium-entry',
    'character-forge', 'campaign-forge', 'account', 'login', 'account-create',
    'forgot-password', 'profile', 'settings', 'friends', 'notifications',
    'dashboard', 'gm-dashboard', 'character-dashboard', 'presentation',
    'invitation', 'not-found'
  ];
  assert.deepEqual(Object.keys(ROUTE_FEATURES).sort(), routes.sort());
  assert.equal(getFeatureForRoute('home').status, 'ready');
  assert.equal(canActivateRoute('home', previewServices), true);
  assert.equal(getFeatureForRoute('appearance').status, 'ready');
  assert.equal(canActivateRoute('appearance', previewServices), true);
  const injected = createAppServices({
    auth: {}, campaigns: {}, characters: {}, compendium: {},
    friends: {}, notifications: {}, gameplay: {}
  });
  for (const id of routes.filter(value => !['home', 'appearance', 'account', 'profile', 'settings', 'friends', 'notifications', 'character-forge', 'campaign-forge', 'invitation'].includes(value))) {
    const feature = getFeatureForRoute(id);
    assert.equal(feature.status, 'preview', 'Unmigrated route must be preview-only: ' + id);
    assert.equal(canActivateRoute(id, previewServices), false, id);
    assert.equal(canActivateRoute(id, injected), false,
      'Injecting a service must not auto-enable an unmigrated page: ' + id);
  }
  for (const id of ['account','profile','settings','friends','notifications','character-forge','campaign-forge','invitation']) {
    const feature = getFeatureForRoute(id);
    assert.equal(feature.status,'ready',id);
    assert.equal(canActivateRoute(id,previewServices),false,id);
    if(id==='invitation')assert.equal(canActivateRoute(id,injected),false,
      'Campaign settings alone do not enable secure invitations.');
    else assert.equal(canActivateRoute(id,injected),true,id);
  }
  for (const id of ['account', 'profile', 'friends', 'notifications', 'gm-dashboard', 'character-dashboard']) {
    assert.equal(getFeatureForRoute(id).access, 'protected', id);
    assert.ok(getFeatureForRoute(id).requiredServices.includes('auth'), id);
  }
  assert.equal(getFeatureForRoute('unknown-route').status, 'preview');
});

function scanJs(dir) {
  return readdirSync(resolve(repoRoot, dir), { withFileTypes: true })
    .flatMap(entry => entry.isDirectory() ? scanJs(dir + '/' + entry.name)
      : /\.(?:js|jsx|mjs)$/.test(entry.name) ? [dir + '/' + entry.name] : []);
}

test('React JavaScript imports neither legacy globals nor a competing event owner', () => {
  const paths = scanJs('frontend/src');
  const stripComments = code => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const location = read('frontend/src/router/locationStore.mjs');
  const hook = read('frontend/src/router/useSiteRoute.js');
  const app = read('frontend/src/app/App.jsx');
  const main = read('frontend/src/main.jsx');
  assert.match(hook, /useSyncExternalStore/);
  assert.match(hook, /getBrowserLocationStore/);
  assert.match(location, /createDisposableScope\(/);
  assert.match(location, /listenerScope.listen\(source, 'hashchange', changed\)/);
  assert.match(location, /listenerScope.listen\(source, 'popstate', changed\)/);
  assert.match(app, /canActivateRoute\(route.id, services\)/);
  assert.match(app, /useRouteEffects\(route\)/);
  assert.match(main, /<AuthBootstrap>/);
  assert.match(read('frontend/src/auth/AuthBootstrap.jsx'), /<AppServicesProvider services=\{services\}>/);
  for (const file of paths) {
    const code = stripComments(read(file));
    assert.doesNotMatch(code, /(?:from|import)\s*['"][^'"]*(?:\/js\/|\/src\/app\/legacyBridge|css\/styles\.css|asteria-page-template)/, file);
    assert.doesNotMatch(code, /window\.(?:setView|AsteriaFirebase|AsteriaState|AsteriaReactMigration)\b/, file);
    assert.doesNotMatch(code, /document\.addEventListener\(['"](?:click|DOMContentLoaded|hashchange)/, file);
    if (!file.endsWith('locationStore.mjs') && !file.endsWith('disposableScope.mjs')) {
      assert.doesNotMatch(code, /addEventListener\(['"](?:hashchange|popstate)['"]/, file);
    }
  }
});
