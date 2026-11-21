import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { before, after, test } from 'node:test';
import { createServer } from 'vite';
import { createPublicSectionHref, resolvePublicEntry } from '../frontend/src/compendium/publicEntryModel.mjs';
import { validatePublishedEntry } from '../frontend/src/compendium/publicationPolicy.mjs';
import { createPublicSourceLinkProjector } from './site-compendium-source.mjs';
import { createPublicArtworkRegistry } from './site-compendium-presentation.mjs';
import {
  classifyCompendiumBookmark,
  isCompatibleBookmark,
  readCompendiumRouteBaseline
} from './site-restoration-compendium-baseline.mjs';

const baseline = readCompendiumRouteBaseline();
let vite;
let loadEntry;
let resolveReference;

before(async () => {
  // site:check already publishes every shard before its concurrent Node tests.
  const stages=process.env.npm_lifecycle_event==='site:check'?[]:['public-index','public-entries','search-index'];
  for(const stage of stages) {
    execFileSync(process.execPath, [
      fileURLToPath(new URL('./site-compendium-'+stage+'.mjs', import.meta.url))
    ], { stdio: 'inherit' });
  }
  vite = await createServer({
    configFile: false,
    root: fileURLToPath(new URL('../frontend', import.meta.url)),
    appType: 'custom',
    server: { middlewareMode: true, hmr: false, watch: null }
  });
  ({ loadPublicEntry: loadEntry, resolvePublicReference: resolveReference } = await vite.ssrLoadModule('/src/compendium/publicEntryLoader.mjs'));
});

after(async () => {
  await vite?.close();
});

test('all 891 original Compendium URLs retain their exact original definition identity', async t => {
  const counts = {};
  const regressions = [];
  const results = [];
  for (const bookmark of baseline) {
    const outcome = await classifyCompendiumBookmark(bookmark, loadEntry);
    counts[outcome.status] = (counts[outcome.status] ?? 0) + 1;
    const result = { ...bookmark, ...outcome };
    results.push(result);
    if (outcome.status !== 'resolved') regressions.push(result);
  }
  if (process.env.ASTERIA_COMPENDIUM_REPORT) {
    await writeFile(process.env.ASTERIA_COMPENDIUM_REPORT, JSON.stringify({ counts, results }, null, 2) + '\n');
  }
  t.diagnostic(JSON.stringify(counts));
  assert.equal(regressions.length, 0, JSON.stringify(regressions.slice(0, 15), null, 2));
});

test('bookmarked routes distinguish no route from no published definition', async () => {
  const definitionId = 'item:content-materials-1-common-metals-iron-ingot-index';
  assert.deepEqual(
    await classifyCompendiumBookmark({ href: '#/nonexistent-route', definitionId }, loadEntry),
    { status: 'missing', stage: 'router' }
  );
  assert.deepEqual(
    await classifyCompendiumBookmark({ href: '#/compendium/item/nonexistent-definition', definitionId }, loadEntry),
    { status: 'missing', stage: 'entry' }
  );
});

test('a catalogue landing is an incorrect destination for an entry bookmark', async () => {
  const outcome = await classifyCompendiumBookmark({
    href: '#/compendium', definitionId: 'item:content-materials-1-common-metals-iron-ingot-index'
  }, loadEntry);
  assert.deepEqual(outcome, { status: 'wrong-destination', routeId: 'compendium' });
});

test('an entry page showing the wrong definition ID is a regression', async () => {
  const outcome = await classifyCompendiumBookmark({
    href: '#/compendium/item/iron-ingot', definitionId: 'item:content-minerals-1-common-ores-iron-ore-index'
  }, loadEntry);
  assert.deepEqual(outcome, {
    status: 'wrong-definition', actualId: 'item:content-materials-1-common-metals-iron-ingot-index'
  });
});

test('an ambiguous entry cannot satisfy a unique bookmark', async () => {
  const candidates = [
    { id: 'talent:first-definition', slug: 'shared-name' },
    { id: 'talent:second-definition', slug: 'shared-name' }
  ];
  const outcome = await classifyCompendiumBookmark({
    href: '#/compendium/talent/shared-name', definitionId: 'talent:first-definition'
  }, async (_domain, slug) => resolvePublicEntry(candidates, slug));
  assert.deepEqual(outcome, { status: 'ambiguous' });
});

test('only known gaps may stay missing, and a correct fix passes without changing the oracle', () => {
  const resolved = { status: 'resolved' };
  const missing = { status: 'missing', stage: 'entry' };
  assert.equal(isCompatibleBookmark({ phase1Status: 'ready' }, missing), false);
  assert.equal(isCompatibleBookmark({ phase1Status: 'missing' }, missing), true);
  assert.equal(isCompatibleBookmark({ phase1Status: 'missing' }, resolved), true);
  for (const status of ['wrong-destination', 'wrong-definition', 'ambiguous']) {
    assert.equal(isCompatibleBookmark({ phase1Status: 'missing' }, { status }), false);
  }
});

const root=fileURLToPath(new URL('../',import.meta.url));
const json=path=>JSON.parse(readFileSync(resolve(root,path),'utf8'));
const readShards=(path,files)=>files.flatMap(filename=>json(path+'/'+filename).entries);
const sourcePath='data/compendium-parts';
const source=readShards(sourcePath,readdirSync(resolve(root,sourcePath)).filter(name=>
  /^[a-z]+-[a-f0-9]+\.json$/.test(name)));
const domains=[...new Set(source.map(row=>row.domain))];
const files=domains.map(domain=>domain+'.json');

test('all 891 original route identities agree across catalogue, detail and search',()=>{
  const catalogue=new Map(readShards('frontend/src/compendium/public-index',files).map(row=>[row.id,row]));
  const entries=readShards('frontend/src/compendium/public-entry-index',files);
  const search=new Map(readShards('frontend/src/compendium/public-search-index',files).map(row=>[row.id,row]));
  const qualified=source.filter(row=>row.domain==='talent');
  const baseline=source.filter(row=>row.domain!=='talent');
  assert.equal(baseline.length,665);
  assert.equal(qualified.length,226);
  assert.equal(catalogue.size,891);
  assert.equal(search.size,891);
  for(const raw of [...baseline,...qualified]){
    assert.equal(catalogue.get(raw.id)?.href,'#'+raw.route,raw.id);
    const result=resolvePublicEntry(entries.filter(row=>row.domain===raw.domain),raw.route.split('/').at(-1));
    assert.equal(result.entry?.id,raw.id,raw.route);
    assert.equal(result.state,'ready',raw.route);
    assert.ok(search.has(raw.id),raw.id);
  }
  const talents=entries.filter(row=>row.domain==='talent');
  for(const alias of ['blessed-resilience','divine-aegis','mana-well','sacred-judgement']){
    const result=resolvePublicEntry(talents,alias);
    assert.equal(result.state,'ambiguous',alias);
    assert.equal(result.entry,null,alias);
    assert.equal(result.choices.length,2,alias);
    assert.ok(result.choices.every(choice=>choice.slug!==alias));
  }
});

test('canonical keys win over aliases and exact public references preserve their target',()=>{
  const one={id:'talent:cleric-aegis',slug:'cleric-divine-aegis',domain:'talent',
    title:'Divine Aegis',categoryPath:['Cleric'],aliases:['divine-aegis','/compendium/talent/classes/divine-aegis']};
  const two={id:'talent:paladin-aegis',slug:'paladin-divine-aegis',domain:'talent',
    title:'Divine Aegis',categoryPath:['Paladin'],aliases:['divine-aegis','cleric-divine-aegis']};
  const entries=[two,one];
  assert.equal(resolvePublicEntry(entries,'cleric-divine-aegis').entry?.id,one.id);
  assert.equal(resolvePublicEntry(entries,'classes/divine-aegis').entry?.id,one.id);
  assert.equal(resolvePublicEntry(entries,'talent:paladin-aegis').entry?.id,two.id);
  assert.equal(resolvePublicEntry(entries,'Divine Aegis').state,'ambiguous');
  assert.equal(resolvePublicEntry(entries,'../secret').state,'missing');
  assert.equal(createPublicSectionHref('talent',one.slug,'Rank 2'),
    '#/compendium/talent/cleric-divine-aegis?tab=Rank+2');
});

test('projected public details, related entries and approved artwork come from canonical data',async()=>{
  const raw=json('frontend/src/compendium/public-entry-index/race.json').entries.find(row=>row.slug==='dark-pixie');
  assert.equal(raw.details.naturalAC,1);
  assert.equal(raw.gallery.length,2);
  const original=readFileSync(resolve(root,'assets/races/dark-pixie/dark-pixie-female-adult.png'));
  assert.deepEqual(readFileSync(resolve(root,'frontend/src/compendium/public-entry-index/artwork',raw.artwork)),original);
  const pixie=(await loadEntry('race','dark-pixie')).entry;
  assert.match(pixie.artwork,/^\/?[^?#]+\.png(?:\?.*)?$/);
  assert.ok(pixie.gallery.every(image=>image.url&&image.alt));
  const spell=(await loadEntry('spell','heal-minor')).entry;
  assert.equal(spell.details.cost,'70 MP');
  assert.equal(spell.details.element,'Life Magic');
  const spellblade=(await loadEntry('class','spellblade')).entry;
  assert.equal(spellblade.talents.length,19);
  assert.ok(spellblade.talents.some(row=>row.slug==='spellblade-arcane-cut'&&row.tier===4));
  const ritual=(await loadEntry('talent','cleric-ritual-blessing')).entry;
  assert.ok(ritual.related.some(row=>row.slug==='cleric-channel-divinity'));
  assert.equal((await resolveReference('Channel Divinity',ritual)).entry.slug,'cleric-channel-divinity');
  const legacySource='content/classes/cleric/talents/tier-1/channel-divinity/index.md';
  assert.equal((await resolveReference(legacySource,ritual)).entry.slug,'cleric-channel-divinity');
  assert.equal((await loadEntry('talent',legacySource)).entry.id,
    'talent:content-classes-cleric-talents-tier-1-channel-divinity-index');
  assert.equal((await resolveReference('Mana Well',ritual)).state,'ambiguous');
  assert.equal((await resolveReference('#/compendium/talent/spellblade-arcane-cut?tab=Rank+2',ritual)).entry.section,'Rank 2');
  assert.equal((await resolveReference('javascript:alert(1)',ritual)).state,'missing');
});

test('public shards reject nested private metadata, file-path aliases and arbitrary media',()=>{
  const row=json('frontend/src/compendium/public-entry-index/race.json').entries.find(x=>x.slug==='dark-pixie');
  const validate=options=>validatePublishedEntry({...row,...options},'race');
  assert.throws(()=>validate({aliases:['content/races/dark-pixie/index.md']}),/Untrusted/);
  assert.throws(()=>validate({artwork:'https://external.example/secret.png'}),/Untrusted/);
  assert.throws(()=>validate({sourceKeys:['/raw/vault/path.md']}),/Untrusted/);
  assert.throws(()=>validate({details:{naturalAC:4,ownerUid:'secret'}}),/Untrusted/);
  assert.throws(()=>validate({details:{naturalAC:4,racialTraits:[{name:'Private',notes:'secret'}]}}),/Untrusted/);
  assert.throws(()=>validate({gallery:[{asset:'https://external.example/secret.png',alt:'Private',caption:''}]}),/Untrusted/);
  assert.throws(()=>validate({related:[{domain:'character',slug:'private',title:'Private',categoryPath:[]}]}),/Untrusted/);
  const serialized=JSON.stringify(row);
  assert.ok(!serialized.includes('assets/races/dark-pixie/'));
  assert.ok(!serialized.includes('sourceFileId'));
  assert.ok(!serialized.includes('sourcePath'));
});

test('all 62 original covers and every distinct approved gallery image retain their exact bytes',()=>{
  const rawEntries=readShards('frontend/src/compendium/public-entry-index',files);
  const rawCatalogue=readShards('frontend/src/compendium/public-index',files);
  const publishedById=new Map(rawEntries.map(row=>[row.id,row]));
  const catalogueById=new Map(rawCatalogue.map(row=>[row.id,row]));
  const assetDirectory=resolve(root,'frontend/src/compendium/public-entry-index/artwork');
  const expectedAssets=new Set(),covers=source.filter(row=>Boolean(row.imagePath));
  assert.equal(covers.length,62);
  const readAsset=path=>{
    const bytes=readFileSync(resolve(root,path));
    const name=createHash('sha256').update(bytes).digest('hex')+'.png';
    if(!expectedAssets.has(name))assert.deepEqual(readFileSync(resolve(assetDirectory,name)),bytes,path);
    expectedAssets.add(name);
    return name;
  };
  for(const original of source){
    const row=publishedById.get(original.id);
    if(original.imagePath){
      const cover=readAsset(original.imagePath);
      assert.equal(row.artwork,cover,original.id);
      assert.equal(catalogueById.get(original.id).artwork,cover,original.id);
    }
    const gallery=[...new Set(Object.values(original.images).filter(Boolean).map(readAsset))].sort();
    assert.deepEqual(row.gallery.map(image=>image.asset).sort(),gallery,original.id);
  }
  assert.deepEqual(readdirSync(assetDirectory).sort(),[...expectedAssets].sort());
});

test('relative Markdown links keep published tabs and omit nonpublic source paths',()=>{
  const sourceEntry={sourcePath:'content/rules/current/index.md'};
  const next={entry:{sourcePath:'content/rules/next/index.md'},identity:{
    id:'handbook:next',domain:'handbook',slug:'next'
  }};
  const [section]=createPublicSourceLinkProjector([next])([{title:'Public',body:[
    'Read [Next](../next/index.md#Further%20Reading) and [unavailable](../private/index.md).',
    'See [Source](https://example.org/guide.md).','~~~markdown','[Example](../next/index.md)','~~~'
  ].join('\n')}],sourceEntry);
  assert.equal(section.body,[
    'Read [Next](#/compendium/handbook/next?tab=Further+Reading) and unavailable.',
    'See [Source](https://example.org/guide.md).','~~~markdown','[Example](../next/index.md)','~~~'
  ].join('\n'));
});

test('artwork registry accepts record-owned pixels and excludes unapproved paths',()=>{
  const registry=createPublicArtworkRegistry(root);
  const original=source.find(row=>row.slug==='dark-pixie');
  const projected=registry.project({...original,imagePath:'https://example.org/remote.png',images:{
    male:original.images.male,
    female:'assets/races/life-pixie/life-pixie-female-adult.png',
    image:'assets/races/dark-pixie/../life-pixie/life-pixie-female-adult.png'
  },imageReferences:{private:'assets/races/life-pixie/life-pixie-male-adult.png'}},[
    {body:'![[private]]'}
  ]);
  assert.equal(projected.gallery.length,1);
  assert.equal(registry.assets.size,1);
  assert.equal(projected.gallery[0].asset,projected.artwork);
  assert.deepEqual(projected.imageReferences,{});
});
