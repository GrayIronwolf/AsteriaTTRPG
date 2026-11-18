import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRIMARY_LINKS, parseSiteRoute } from '../frontend/src/router/siteRoutes.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFileSync(resolve(root, path), 'utf8');
const route = (hash, search = '') => parseSiteRoute({ hash, search });

test('one canonical link for every primary destination', () => {
  assert.equal(PRIMARY_LINKS.length, 8);
  assert.equal(new Set(PRIMARY_LINKS.map(link => link.id)).size, PRIMARY_LINKS.length);
  for (const link of PRIMARY_LINKS) {
    assert.match(link.href, /^#/);
    assert.equal(route(link.href).navId, link.id, link.label);
  }
});

test('initial Home, legacy Home aliases and explicit deep links are stable', () => {
  for (const hash of ['', '#', '#home', '#/home', '#/', '#site-main']) {
    assert.equal(route(hash).id, 'home', hash);
  }
  assert.equal(route('', '?campaign-invite=abc').id, 'invitation');
  assert.equal(route('#/account', '?campaign-invite=abc').id, 'account',
    'A stale invitation query must not override deliberate navigation');
});

test('existing Asteria Compendium links preserve query parameters and entry tabs', () => {
  const handbook = route('#/compendium?group=rules&category=handbook');
  assert.equal(handbook.id, 'handbook');
  assert.equal(handbook.navId, 'handbook');
  assert.equal(handbook.query.get('category'), 'handbook');

  const lore = route('#/compendium?group=world');
  assert.equal(lore.id, 'lore');
  assert.equal(lore.query.get('group'), 'world');

  const search = route('#/compendium?group=equipment&q=primdale&sort=az&saved=1');
  assert.equal(search.id, 'compendium');
  assert.equal(search.query.get('q'), 'primdale');
  assert.equal(search.query.get('saved'), '1');
  assert.equal(search.hash, '#/compendium?group=equipment&q=primdale&sort=az&saved=1');

  const entry = route('#/compendium/race/cavern-sprite?tab=Racial+Sheet');
  assert.equal(entry.id, 'compendium-entry');
  assert.equal(entry.params.domain, 'race');
  assert.equal(entry.params.slug, 'cavern-sprite');
  assert.equal(entry.query.get('tab'), 'Racial Sheet');
  assert.equal(entry.navId, 'compendium');
});

test('Forges, Account and social routes have distinct React owners', () => {
  const expected = new Map([
    ['#/character-forge', 'character-forge'],
    ['#/campaign-forge', 'campaign-forge'],
    ['#/account', 'account'],
    ['#/account/login', 'login'],
    ['#/account/create', 'account-create'],
    ['#/account/forgot-password', 'forgot-password'],
    ['#/account/profile', 'profile'],
    ['#/account/settings', 'settings'],
    ['#/account/friends', 'friends'],
    ['#/account/notifications', 'notifications'],
    ['#/dashboard', 'dashboard'],
    ['#loginPage', 'login'],
    ['#playerHome', 'character-forge'],
    ['#campaigns', 'campaign-forge'],
    ['#asteriaFriendsPage', 'friends'],
    ['#/friends', 'friends'],
    ['#/handbook', 'handbook'],
    ['#/world', 'lore']
  ]);
  for (const [hash, expectedId] of expected) {
    assert.equal(route(hash).id, expectedId, hash);
  }
});

test('bookmarked GM/player dashboards are recognised but not authenticated here', () => {
  const gm = route('#/react/gm/campaign123');
  assert.equal(gm.id, 'gm-dashboard');
  assert.equal(gm.params.campaignId, 'campaign123');

  const player = route('#/react/character/campaign123/player%201');
  assert.equal(player.id, 'character-dashboard');
  assert.equal(player.params.characterId, 'player 1');

  const owned = route('#/react/owned-character/owned123');
  assert.equal(owned.id, 'character-dashboard');
  assert.equal(owned.params.characterId, 'owned123');

  const presentation = route('#/react/presentation/campaign123');
  assert.equal(presentation.id, 'presentation');
  assert.equal(presentation.params.campaignId, 'campaign123');
});

test('invitation tokens never turn into public routes or DOM content', () => {
  for (const hash of [
    '#/join/123456789012', '#secure-campaign-invite=sensitive-token',
    '#campaign-invite=sensitive-token'
  ]) {
    assert.equal(route(hash).id, 'invitation', hash);
  }
  assert.equal(route('#/join/not-a-code').id, 'not-found');
  const preview = read('frontend/src/pages/RoutePreviewPage.jsx');
  assert.doesNotMatch(preview, /route\.params|route\.query|route\.hash/);
});

test('unknown routes are not sent back to Home; malformed encodings are safe', () => {
  assert.equal(route('#/not-a-real-page').id, 'not-found');
  assert.equal(route('#/react/character/one').id, 'not-found');
  assert.equal(route('#/compendium/race/%E0%A4%A').id, 'compendium-entry');
  assert.equal(route('#/account/other').id, 'not-found');
});

test('single route event owner and no links into legacy controllers', () => {
  const app = read('frontend/src/app/App.jsx');
  const hook = read('frontend/src/router/useSiteRoute.js');
  const shell = read('frontend/src/components/SiteShell.jsx');
  assert.match(app, /useSiteRoute\(\)/);
  assert.match(app, /<RoutePreviewPage route={route}/);
  assert.equal((hook.match(/addEventListener\('hashchange'/g) || []).length, 1);
  assert.equal((hook.match(/removeEventListener\('hashchange'/g) || []).length, 1);
  assert.equal((hook.match(/addEventListener\('popstate'/g) || []).length, 1);
  assert.equal((hook.match(/removeEventListener\('popstate'/g) || []).length, 1);
  assert.doesNotMatch(app + hook + shell, /window\.(?:setView|AsteriaRouter|AsteriaReactMigration)/);
  assert.doesNotMatch(shell, /onclick\s*=/i);
  assert.match(shell, /aria-current={route.navId === link.id/);
  assert.match(shell, /aria-label="Mobile navigation"/);
});
