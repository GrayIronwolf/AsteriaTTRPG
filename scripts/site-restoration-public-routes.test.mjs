import assert from 'node:assert/strict';
import test from 'node:test';
import { canActivateRoute } from '../frontend/src/app/featureRegistry.mjs';
import { parseSiteRoute } from '../frontend/src/router/siteRoutes.mjs';

const open = hash => parseSiteRoute({ hash });

test('bare Compendium bookmarks open the catalogue without changing the hash', () => {
  for (const hash of ['#compendium', '#compendium?group=equipment&q=iron', '#/compendium/']) {
    const route = open(hash);
    assert.equal(route.id, 'compendium', hash);
    assert.equal(route.hash, hash);
  }
  assert.equal(open('#compendium?q=iron').query.get('q'), 'iron');
});

test('historical and canonical domain paths supply an authoritative domain and retain all other query values', () => {
  const hash = '#/compendium/races?domain=class&category=Fae+Races%2FSprites&filter=rarity&value=Rare&q=sprite&tab=Gallery&saved=1&sort=category&path=A&path=B';
  const route = open(hash);
  assert.equal(route.id, 'compendium');
  assert.equal(route.hash, hash);
  assert.equal(route.params.legacyDomain, true);
  assert.equal(route.query.get('domain'), 'race');
  assert.deepEqual([...route.query.entries()].filter(([key]) => key !== 'domain'),
    [...new URLSearchParams(hash.split('?')[1]).entries()].filter(([key]) => key !== 'domain'));
  for (const [alias, domain] of [
    ['race', 'race'], ['Classes', 'class'], ['creatures', 'creature'], ['items', 'item'],
    ['Magic', 'spell'], ['talents', 'talent'], ['professions', 'profession'], ['skills', 'skill'],
    ['backgrounds', 'origin'], ['worlds', 'location'], ['pantheons', 'religion'],
    ['organisations', 'faction'], ['timelines', 'lore'], ['rules', 'handbook'],
    ['Races%20Compendium', 'race']
  ]) {
    assert.equal(open('#/compendium/' + alias).query.get('domain'), domain, alias);
  }
  assert.equal(open('#/world').id, 'lore');
  assert.equal(open('#/handbook').id, 'handbook');
});

test('standalone collection addresses retain their original collection scope and explicit filters', () => {
  for (const collection of ['flora', 'minerals', 'materials']) {
    for (const prefix of ['#/', '#/compendium/']) {
      const hash = prefix + collection + '?q=iron&sort=name';
      const route = open(hash);
      assert.equal(route.id, 'compendium');
      assert.equal(route.hash, hash);
      assert.equal(route.params.legacyDomain, true);
      assert.equal(route.query.get('domain'), 'item');
      assert.equal(route.query.get('filter'), 'collection');
      assert.equal(route.query.get('value'), collection);
      assert.equal(route.query.get('q'), 'iron');
      assert.equal(route.query.get('sort'), 'name');
    }
  }
  const explicit = open('#/materials?filter=rarity&value=Legendary');
  assert.equal(explicit.query.get('filter'), 'rarity');
  assert.equal(explicit.query.get('value'), 'Legendary');
});

test('entry routes retain canonical domains, opaque reference tails and the selected tab', () => {
  const cases = [
    ['#/compendium/race/cavern-sprite', 'race', 'cavern-sprite'],
    ['#/compendium/races/race%3Acontent-races-cavern-sprite-index', 'race', 'race:content-races-cavern-sprite-index'],
    ['#compendium/classes/classes/artificer', 'class', 'classes/artificer'],
    ['#/compendium/Talents/Divine%20Aegis', 'talent', 'Divine Aegis'],
    ['#/materials/common/metals/iron-ingot', 'item', 'materials/common/metals/iron-ingot'],
    ['#/races/fae-races/cavern-sprite/cavern-sprite.md', 'race', 'races/fae-races/cavern-sprite/cavern-sprite.md'],
    ['#content/races/cavern-sprite/index.md', 'race', 'content/races/cavern-sprite/index.md'],
    ['#/Asteria%20TTRPG/z.%20Asteria%20Handbook/2.%20Asteria%20Rule/1.%20Campaign%20Rules/1.0%20Rule%20of%20cool.md', 'handbook', 'Asteria TTRPG/z. Asteria Handbook/2. Asteria Rule/1. Campaign Rules/1.0 Rule of cool.md'],
    ['#wiki:flora:rose', 'item', 'wiki:flora:rose'],
    ['#creature-manifest:creature:ash-imp', 'creature', 'creature-manifest:creature:ash-imp']
  ];
  for (const [path, domain, slug] of cases) {
    const hash = path + '?tab=Racial+Sheet&saved=1';
    const route = open(hash);
    assert.equal(route.id, 'compendium-entry', path);
    assert.deepEqual(route.params, { domain, slug }, path);
    assert.equal(route.hash, hash);
    assert.equal(route.query.get('tab'), 'Racial Sheet');
    assert.equal(route.query.get('saved'), '1');
  }
});

test('the original Version Log alias and canonical route are both public', () => {
  for (const hash of ['#devLog', '#/version-log']) {
    const route = open(hash);
    assert.equal(route.id, 'version-log');
    assert.equal(route.title, 'Version Log');
    assert.equal(route.hash, hash);
    assert.equal(canActivateRoute(route.id), true);
  }
});

test('Forge menu bookmarks encode list, creation and independently guarded campaign join intents', () => {
  for (const [hash, id, intent] of [
    ['#/character-forge?mode=create', 'character-forge', 'create'],
    ['#/character-forge?view=my-characters', 'character-forge', 'list'],
    ['#/campaign-forge?mode=create', 'campaign-forge', 'create'],
    ['#/campaign-forge?view=my-campaigns', 'campaign-forge', 'list'],
    ['#/campaign-forge?mode=join', 'invitation', 'join'],
    ['#playerHome', 'character-forge', 'list'],
    ['#campaigns', 'campaign-forge', 'list'],
    ['#/character-forge?mode=edit&character=unknown', 'character-forge', 'list']
  ]) {
    const route = open(hash);
    assert.equal(route.id, id, hash);
    assert.equal(route.params.intent, intent, hash);
    assert.equal(route.hash, hash);
    assert.equal(canActivateRoute(route.id, new Map()), false);
  }
  const services = new Map([['auth', {}], ['campaigns', {}]]);
  assert.equal(canActivateRoute(open('#/campaign-forge?mode=create').id, services), true);
  assert.equal(canActivateRoute(open('#/campaign-forge?mode=join').id, services), false);
  services.set('campaigns', { connections: { availability: () => ({ enabled: true }) } });
  assert.equal(canActivateRoute(open('#/campaign-forge?mode=join').id, services), true);
});

test('both main-content bookmark aliases open the public Home view', () => {
  for (const hash of ['#mainContent', '#site-main']) {
    const route = open(hash);
    assert.equal(route.id, 'home');
    assert.equal(route.hash, hash);
  }
});

test('legacy public aliases do not change invitation, private or unknown route handling', () => {
  for (const hash of ['#/not-a-real-page', '#/compendium/unknown-domain', '#/join/not-a-code', '#/react/character/one', '#workspace', '#creature']) {
    assert.equal(open(hash).id, 'not-found', hash);
  }
  assert.equal(open('#/join/000012345678').params.code, '000012345678');
  assert.equal(open('#secure-campaign-invite=invalid').id, 'invitation');
  assert.equal(open('#/react/owned-character/example').params.characterId, 'example');
  assert.equal(open('#/account/settings?tab=security').id, 'settings');
});
