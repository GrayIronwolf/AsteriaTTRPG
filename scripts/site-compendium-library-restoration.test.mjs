import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import * as scopeModel from '../frontend/src/compendium/compendiumModel.mjs';
import * as discovery from '../frontend/src/compendium/discoveryModel.mjs';
import { isPublishedDefinition } from '../frontend/src/compendium/publicationPolicy.mjs';

const legacy = await import('../frontend/src/compendium/legacyLibrary.mjs')
  .catch(error => { if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error; return {}; });
const preferences = await import('../frontend/src/compendium/libraryPreferences.mjs')
  .catch(error => { if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error; return {}; });

const parts = new URL('../data/compendium-parts/', import.meta.url);
const observedCounts = {
  rules:{core:0,skills:154,talents:226,conditions:0,handbook:5},
  characters:{races:201,classes:30,magic:3,origins:4},
  equipment:{items:23,resources:113,enchantments:0,runestones:0},
  crafting:{schematics:0,recipes:0,blueprints:0,patterns:0,formulas:0,designs:0,structures:0,professions:1},
  world:{theology:104,worlds:2,npcs:0,lore:1,languages:0,factions:1},
  adventures:{creatures:23,quests:0,gm:0}
};

const ore = {
  id:'item:iron-ore', domain:'item', title:'Iron Ore', categoryPath:['Materials','Ore'],
  libraryCategory:'resources', indexCode:'07-05-001-002', aliases:['Shining Stone'], filters:{rarity:'Common'}
};
const blade = {
  id:'item:steel-sword', domain:'item', title:'Steel Sword', categoryPath:['Weapons'],
  libraryCategory:'items', indexCode:'06-01-001-001', aliases:['Shining Blade'], filters:{rarity:'Rare'}
};

test('the six library groups retain their numbered categories and original published counts', () => {
  assert.equal(typeof legacy.getLibraryCounts, 'function');
  const entries = readdirSync(parts).filter(file => file.endsWith('.json'))
    .flatMap(file => JSON.parse(readFileSync(new URL(file, parts))).entries)
    .filter(isPublishedDefinition);
  const counts = legacy.getLibraryCounts(entries);
  assert.deepEqual(legacy.LEGACY_LIBRARY_GROUPS.map(group => group.id), Object.keys(observedCounts));
  for (const group of legacy.LEGACY_LIBRARY_GROUPS) {
    assert.deepEqual(group.categories.map(category => [category.id,counts.categories.get(category.id)]),
      Object.entries(observedCounts[group.id]), group.id);
    assert.equal(counts.groups.get(group.id), Object.values(observedCounts[group.id]).reduce((sum,n) => sum+n,0));
  }
  assert.equal(legacy.legacyLibraryCategory({domain:'item',metadata:{sourceCategory:'08 Schematics'}}),'schematics');
  assert.equal(legacy.legacyLibraryCategory({domain:'creature',categoryPath:['NPCs']}),'creatures');
});

test('group, category and favourites filters select definitions within the same domain', () => {
  const scope = scopeModel.resolveCompendiumScope('group=characters&category=resources');
  assert.equal(scope.group, 'equipment');
  assert.deepEqual(scopeModel.filterLibraryScope([ore,blade],scope), [ore]);
  assert.deepEqual(scopeModel.filterLibraryScope([ore,blade],
    scopeModel.resolveCompendiumScope('group=equipment'), {favourites:[blade.id]}), [blade]);
});

test('legacy scoped category paths, metadata, search preferences and alpha sort survive bookmark round-trips', () => {
  const scoped = scopeModel.resolveCompendiumScope(
    'domain=item&category=Materials%2FOre&q=Iron&saved=1&sort=category&filter=rarity&value=Common',
    {legacyDomain:true});
  const options = discovery.parseDiscoveryFilters(
    'domain=item&category=Materials%2FOre&q=Iron&saved=1&sort=category&filter=rarity&value=Common',
    {legacyDomain:true});
  assert.equal(scoped.category, '');
  assert.equal(options.saved,true);
  assert.equal(options.sort,'category');
  assert.deepEqual(options.path,['Materials','Ore']);
  assert.equal(options.field,'rarity');
  assert.equal(options.value,'Common');
  const href = discovery.createDiscoveryHref({
    domain:'item', query:scoped.search, path:options.path, sort:options.sort,
    saved:options.saved, field:options.field, value:options.value
  });
  assert.equal(href,'#/compendium?domain=item&q=Iron&path=Materials&path=Ore&sort=category&saved=1&filter=rarity&value=Common');
  assert.equal(discovery.parseDiscoveryFilters('sort=name').sort,'name');
  assert.equal(discovery.parseDiscoveryFilters('sort=za').sort,'za');
});

test('public aliases, exact and partial Asteria codes, and public body text remain searchable', () => {
  assert.deepEqual(discovery.filterDiscoveryEntries([blade,ore],{query:'shining stone'}), [ore]);
  assert.deepEqual(discovery.filterDiscoveryEntries([blade,ore],{query:'07-05'}), [ore]);
  assert.deepEqual(discovery.filterDiscoveryEntries([blade,ore],{query:'07-05-001-002'}), [ore]);
  assert.deepEqual(discovery.filterDiscoveryEntries([blade,ore],{
    query:'07-05-001-003',searchIndex:new Map([[ore.id,'07 05 001 003']])
  }), []);
  assert.deepEqual(discovery.filterDiscoveryEntries([blade,ore],{query:'ancient'}), []);
  assert.deepEqual(discovery.filterDiscoveryEntries([blade,ore],{
    query:'ancient',searchIndex:new Map([[ore.id,'ancient']])
  }), [ore]);
});

test('domain metadata facets use published values and compose with nested taxonomy', () => {
  assert.deepEqual(discovery.getMetadataFacets([blade,ore], 'item')
    .find(row => row.field === 'rarity').values, ['Common','Rare']);
  assert.deepEqual(discovery.filterDiscoveryEntries([blade,ore],{
    path:['Materials'], field:'rarity', value:'common'
  }), [ore]);
  assert.deepEqual(discovery.filterDiscoveryEntries([blade,ore],{
    field:'rarity', value:'Rare'
  }), [blade]);
});

test('favourites and recents use original keys for guest and verified accounts', () => {
  assert.equal(typeof preferences.createLibraryPreferenceStore,'function');
  const values = new Map();
  const storage = {getItem(key){return values.get(key) ?? null;},setItem(key,value){values.set(key,value);}};
  const store = preferences.createLibraryPreferenceStore(() => storage);
  store.toggleFavourite('guest',ore.id);
  store.recordRecent('verified-user',ore.id);
  store.recordRecent('verified-user',blade.id);
  store.recordRecent('verified-user',ore.id);
  assert.deepEqual(JSON.parse(values.get('asteria.library.favourites.guest')),[ore.id]);
  assert.deepEqual(JSON.parse(values.get('asteria.library.recent.verified-user')),[ore.id,blade.id]);
  assert.deepEqual(store.getSnapshot('verified-user').favourites,[]);
  store.toggleFavourite('guest',ore.id);
  assert.deepEqual(store.getSnapshot('guest').favourites,[]);
});

test('legacy storage updates and clearing refresh only the active scope', () => {
  assert.equal(typeof preferences.createLibraryPreferenceStore,'function');
  const values = new Map([['asteria.library.favourites.guest',JSON.stringify([ore.id])]]);
  const storage = {getItem(key){return values.get(key) ?? null;},setItem(key,value){values.set(key,value);}};
  const store = preferences.createLibraryPreferenceStore(() => storage);
  let changes = 0;
  const stop = store.subscribe('guest',() => changes++);
  assert.deepEqual(store.getSnapshot('guest').favourites,[ore.id]);
  values.set('asteria.library.favourites.guest',JSON.stringify([blade.id]));
  store.handleStorage({key:'asteria.library.favourites.someone-else',storageArea:storage});
  assert.equal(changes,0);
  store.handleStorage({key:'asteria.library.favourites.guest',storageArea:storage});
  assert.deepEqual(store.getSnapshot('guest').favourites,[blade.id]);
  values.clear();
  store.handleStorage({key:null,storageArea:storage});
  assert.deepEqual(store.getSnapshot('guest').favourites,[]);
  assert.equal(changes,2);
  stop();
});

test('disabled browser storage remains usable in memory and keeps account scope isolated', () => {
  assert.equal(typeof preferences.createLibraryPreferenceStore,'function');
  const store = preferences.createLibraryPreferenceStore(() => { throw new Error('Storage disabled'); });
  store.toggleFavourite('guest',ore.id);
  const before = store.getSnapshot('guest');
  store.recordRecent('guest',ore.id);
  const recent = store.getSnapshot('guest');
  store.recordRecent('guest',ore.id);
  assert.equal(store.getSnapshot('guest'), recent);
  assert.deepEqual(before.favourites,[ore.id]);
  assert.deepEqual(store.getSnapshot('guest').recent,[ore.id]);
  assert.deepEqual(store.getSnapshot('other-user'),{favourites:[],recent:[]});
  assert.equal(preferences.libraryPreferenceScope({
    status:'authenticated',profileAvailable:true,identity:{status:'authenticated',verified:true},
    user:{uid:'verified-user',email:'verified@example.test'}
  }),'verified-user');
  assert.equal(preferences.libraryPreferenceScope({status:'guest',user:{uid:'prior-user'}}),'guest');
});

test('an entry opened while the restored account is still being checked does not change guest history', () => {
  const values = new Map();
  const storage = {getItem(key){return values.get(key) ?? null;},setItem(key,value){values.set(key,value);}};
  const store = preferences.createLibraryPreferenceStore(() => storage);
  const pending = preferences.libraryPreferenceScope({status:'checking'});
  store.recordRecent(pending,ore.id);
  store.toggleFavourite(pending,ore.id);
  assert.deepEqual(store.getSnapshot(pending),{favourites:[],recent:[]});
  assert.equal(values.size,0);
});
