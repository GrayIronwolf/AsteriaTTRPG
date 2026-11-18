import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  normalizeDiscoveryText, discoveryTerms, normalizeCategoryPath,
  isCategoryPrefix, parseDiscoveryFilters, createDiscoveryHref,
  filterDiscoveryEntries, getDiscoveryFacets
} from '../frontend/src/compendium/discoveryModel.mjs';
import { parseSiteRoute } from '../frontend/src/router/siteRoutes.mjs';
import { MEGA_MENUS } from '../frontend/src/navigation/megaMenuRegistry.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=file=>readFileSync(resolve(root,file),'utf8');
const entries=[
  {id:'race:ailura-ursa',domain:'race',title:'Ailura Ursa',slug:'ailura-ursa',href:'#/compendium/race/ailura-ursa',categoryPath:['Beastkin Races','Ursa Races'],summary:'A bear-like people',tags:['ursa']},
  {id:'race:polaris-ursa',domain:'race',title:'Polaris Ursa',slug:'polaris-ursa',href:'#/compendium/race/polaris-ursa',categoryPath:['Beastkin Races','Ursa Races'],summary:'People of winter',tags:['polaris']},
  {id:'race:air-pixie',domain:'race',title:'Air Pixie',slug:'air-pixie',href:'#/compendium/race/air-pixie',categoryPath:['Fae Races'],summary:'Elemental Fae',tags:['pixie']},
  {id:'race:aasimar',domain:'race',title:'Aasimar',slug:'aasimar',href:'#/compendium/race/aasimar',categoryPath:['Demi Races'],summary:'Celestial heritage',tags:['demi']},
  {id:'race:plain',domain:'race',title:'Uncategorised Race',slug:'plain',href:'#/compendium/race/plain',categoryPath:[],summary:'Uncategorised',tags:[]}
];

test('Phase 3.3 category hierarchy supports case-folded prefixes and accurate descendant counts',()=>{
  assert.deepEqual(normalizeCategoryPath(['Beastkin Races','Ursa Races']),['Beastkin Races','Ursa Races']);
  assert.equal(isCategoryPrefix(entries[0],['beastkin races','ursa races']),true);
  assert.equal(isCategoryPrefix(entries[2],['Beastkin Races']),false);
  assert.equal(getDiscoveryFacets(entries).children.find(x=>x.label==='Beastkin Races').count,2);
  const nested=getDiscoveryFacets(entries,['Beastkin Races']);
  assert.deepEqual(nested.children.map(x=>[x.label,x.count]),[['Ursa Races',2]]);
  assert.equal(nested.directCount,0);
  const leaf=getDiscoveryFacets(entries,['Beastkin Races','Ursa Races']);
  assert.equal(leaf.directCount,2);
  assert.equal(leaf.children.length,0);
  assert.equal(getDiscoveryFacets(entries).directCount,1);
  assert.deepEqual(filterDiscoveryEntries(entries,{path:['Beastkin Races']}).map(e=>e.title),['Ailura Ursa','Polaris Ursa']);
});

test('Phase 3.3 shareable query keeps original mega-menu scope and repeated taxonomic path',()=>{
  const href=createDiscoveryHref({
    group:'characters',legacyCategory:'races',query:'Ursa',path:['Beastkin Races','Ursa Races'],sort:'za'
  });
  assert.equal(href,'#/compendium?group=characters&category=races&q=Ursa&path=Beastkin+Races&path=Ursa+Races&sort=za');
  const route=parseSiteRoute({hash:href});
  assert.equal(route.id,'compendium');
  const selected=parseDiscoveryFilters(route.query);
  assert.deepEqual(selected.path,['Beastkin Races','Ursa Races']);
  assert.equal(selected.sort,'za');
  assert.deepEqual(parseDiscoveryFilters('sort=evil&path=Race&path=Elf').path,['Race','Elf']);
  assert.equal(parseDiscoveryFilters('sort=evil').sort,'relevance');
  assert.equal(createDiscoveryHref({domain:'race',group:'world',legacyCategory:'races',query:'Ailura'}),
    '#/compendium?domain=race&q=Ailura');
  assert.equal(createDiscoveryHref({domain:'broken',query:'x'}),'#/compendium?q=x');
  for(const entry of MEGA_MENUS.compendium.entries) {
    const route=parseSiteRoute({hash:entry.href});
    assert.equal(route.id,'compendium',entry.href);
  }
});

test('Phase 3.3 ranked public search finds textual content without crossing category boundaries',()=>{
  const index=new Map([
    ['race:air-pixie','ancient primordial arcane sylvan'],
    ['race:polaris-ursa','winter bear ice'],
    ['race:ailura-ursa','primordial bear sylvan'],
    ['race:aasimar','light celestial'],
    ['race:plain','unmapped']
  ]);
  assert.deepEqual(discoveryTerms('Prímordial BEAR'),['primordial','bear']);
  assert.equal(normalizeDiscoveryText(' Ar’Zari — Fae '),'ar zari fae');
  assert.deepEqual(filterDiscoveryEntries(entries,{query:'primordial bear',searchIndex:index}).map(e=>e.id),['race:ailura-ursa']);
  assert.deepEqual(filterDiscoveryEntries(entries,{query:'ursa',sort:'relevance',searchIndex:index}).map(e=>e.title),['Ailura Ursa','Polaris Ursa']);
  assert.deepEqual(filterDiscoveryEntries(entries,{query:'ursa',sort:'za'}).map(e=>e.title),['Polaris Ursa','Ailura Ursa']);
  assert.deepEqual(filterDiscoveryEntries(entries,{query:'primordial',path:['Fae Races'],searchIndex:index}).map(e=>e.title),['Air Pixie']);
  assert.deepEqual(filterDiscoveryEntries(entries,{query:'primordial'}),[],'Metadata-only fallback must not fabricate full-text hits');
});

test('Phase 3.3 public search shards match filtered Phase 3.2 entries by canonical ID',()=>{
  let total=0, tokens=0;
  const domainIds=['race','class','creature','item','spell','talent','profession',
    'skill','origin','location','religion','faction','lore','handbook'];
  for(const domain of domainIds) {
    const index=JSON.parse(read('frontend/src/compendium/public-search-index/'+domain+'.json'));
    const source=JSON.parse(read('frontend/src/compendium/public-entry-index/'+domain+'.json'));
    assert.equal(index.version,1);
    assert.equal(index.domain,domain);
    assert.equal(index.entries.length,source.entries.length);
    const ids=new Set(source.entries.map(e=>e.id));
    const seen=new Set();
    for(const entry of index.entries){
      assert.ok(ids.has(entry.id),entry.id);
      assert.ok(!seen.has(entry.id),entry.id);
      seen.add(entry.id);
      assert.deepEqual(Object.keys(entry).sort(),['id','text']);
      assert.equal(typeof entry.text,'string');
      assert.ok(!entry.text.includes('GM-only information coming soon.'));
      assert.ok(!entry.text.includes('Hidden campaign notes can be added here.'));
      assert.ok(!entry.text.includes('<script'));
      assert.ok(!entry.text.includes('sourcePath'));
      tokens+=entry.text.length;
    }
    total+=index.entries.length;
  }
  assert.ok(total>200);
  assert.ok(tokens>10000);
  const source=read('scripts/site-compendium-search-index.mjs');
  assert.match(source,/public-entry-index/);
  assert.doesNotMatch(source,/data\/compendium-parts/);
});

test('Phase 3.3 integrated UI, generator and browser gates protect legacy content',()=>{
  const page=read('frontend/src/pages/CompendiumCataloguePage.jsx');
  assert.match(page,/getDiscoveryFacets/);
  assert.match(page,/loadPublicSearchDomain/);
  assert.match(page,/data-testid="site-discovery-taxonomy"/);
  assert.match(page,/data-testid="site-discovery-submit"/);
  assert.match(page,/createDiscoveryHref/);
  assert.doesNotMatch(page,/dangerouslySetInnerHTML|window\.AsteriaFirebase/);
  const pkg=JSON.parse(read('package.json'));
  for(const name of ['site:dev','site:check','site:build']){
    assert.match(pkg.scripts[name],/site-compendium-search-index\.mjs/);
    assert.ok(pkg.scripts[name].indexOf('site-compendium-public-entries.mjs')<
      pkg.scripts[name].indexOf('site-compendium-search-index.mjs'));
  }
  assert.match(pkg.scripts['site:check'],/site-compendium-phase3-3\.test\.mjs/);
  assert.match(pkg.scripts['site:discovery-browser'],/site-compendium-discovery-browser\.cjs/);
  const workflow=read('.github/workflows/site-foundation.yml');
  assert.match(workflow,/npm run site:discovery-browser/);
  assert.match(workflow,/asteria-phase-3-3-discovery-evidence/);
  assert.match(workflow,/npm run site:entry-browser/);
  assert.doesNotMatch(read('index.html'),/frontend\/src\/compendium/);
});
