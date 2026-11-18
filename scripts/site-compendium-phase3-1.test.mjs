import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveCompendiumScope, createCompendiumHref, filterPublicCatalogue, groupPublicCategories, PUBLIC_DOMAINS } from '../frontend/src/compendium/compendiumModel.mjs';
import { parseSiteRoute } from '../frontend/src/router/siteRoutes.mjs';
import { canActivateRoute } from '../frontend/src/app/featureRegistry.mjs';
import { previewServices } from '../frontend/src/services/appServices.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>readFileSync(resolve(root,p),'utf8');

test('Phase 3.1 public catalogue shards are generated from existing canonical entries and strip private content',()=>{
 const source=readdirSync(resolve(root,'data/compendium-parts')).filter(x=>/^[a-z]+-[a-f0-9]+\.json$/.test(x));
 assert.ok(source.length>=PUBLIC_DOMAINS.length);
 const expected=new Map(PUBLIC_DOMAINS.map(d=>[d.id,[]]));
 let omitted=0;
 for(const file of source){
  const data=JSON.parse(read('data/compendium-parts/'+file));
  for(const item of data.entries){
   if(item.visibility!=='public' || item.gmOnly===true || item.metadata?.visibility==='gm-only'){omitted++;continue;}
   expected.get(data.domain).push(item);
  }
 }
 let count=0;
 for(const domain of PUBLIC_DOMAINS){
  const shard=JSON.parse(read('frontend/src/compendium/public-index/'+domain.id+'.json'));
  assert.equal(shard.domain,domain.id);
  assert.equal(shard.version,1);
  assert.equal(shard.entries.length,expected.get(domain.id).length);
  for(const row of shard.entries){
   const keys=Object.keys(row).sort();
   assert.deepEqual(keys,['category','categoryPath','domain','href','id','slug','summary','tags','title'].sort());
   assert.match(row.href,/^#\/compendium(?:\/[a-z]+\/|\?domain=)/);
   assert.equal(typeof row.id,'string');
   assert.equal(row.domain,domain.id);
   assert.ok(!JSON.stringify(row).includes('sourceFileId'));
   assert.ok(!JSON.stringify(row).includes('GM-only information coming soon'));
  }
  count+=shard.entries.length;
 }
 assert.ok(count>0);
 assert.ok(omitted>=0);
 const publicModule=read('frontend/src/compendium/publicCatalogue.mjs');
 assert.match(publicModule,/import\.meta\.glob/);
 assert.match(publicModule,/pending\.delete\(domain\)/);
 assert.doesNotMatch(publicModule,/data\/compendium(?:-parts|\.js)/);
});

test('routing and category search preserve original bookmarks and deliberately exclude private entry contents',()=>{
 assert.equal(resolveCompendiumScope('group=world').domainIds.includes('location'),true);
 assert.deepEqual(resolveCompendiumScope('group=characters&category=races').domainIds,['race']);
 assert.deepEqual(resolveCompendiumScope('group=equipment&category=resources').domainIds,['item']);
 assert.deepEqual(resolveCompendiumScope('group=rules&category=handbook').domainIds,['handbook']);
 assert.deepEqual(resolveCompendiumScope('domain=spell').domainIds,['spell']);
 assert.equal(resolveCompendiumScope('domain=malicious').domainIds.length,14);
 const href=createCompendiumHref({domain:'race',query:'Ailura Ursa'});
 assert.equal(href,'#/compendium?domain=race&q=Ailura+Ursa');
 assert.equal(parseSiteRoute({hash:href}).id,'compendium');
 const rows=[
  {title:'Red Primdale',id:'item:primdale',domain:'item',summary:'Herb',categoryPath:['Plants & Herbs'],category:'Flower',tags:['red']},
  {title:'Blue Stone',id:'item:stone',domain:'item',summary:'Mineral',categoryPath:['Ores'],category:'Ore',tags:[]}
 ];
 assert.deepEqual(filterPublicCatalogue(rows,{search:'PRIMDALE'}).map(x=>x.title),['Red Primdale']);
 assert.deepEqual(filterPublicCatalogue(rows,{category:'ores'}).map(x=>x.title),['Blue Stone']);
 assert.deepEqual(groupPublicCategories(rows),['Ores','Plants & Herbs']);
 for(const type of ['account','friends','notifications','gm-dashboard','character-dashboard','compendium-entry']){
  assert.equal(canActivateRoute(type,previewServices),false,type);
 }
 const page=read('frontend/src/pages/CompendiumCataloguePage.jsx');
 assert.match(page,/loadPublicDomain/);
 assert.match(page,/data-testid="site-compendium-catalogue"/);
 assert.match(page,/Full definition pages and GM-only campaign notes/);
 assert.doesNotMatch(page,/dangerouslySetInnerHTML|window\.AsteriaFirebase/);
});
test('Phase 3.1 build regenerates catalogue before tests and Vite compilation',()=>{
 const pkg=JSON.parse(read('package.json')).scripts;
 const workflow=read('.github/workflows/site-foundation.yml');
 assert.match(pkg['site:check'],/site-compendium-public-index\.mjs/);
 assert.match(pkg['site:build'],/site-compendium-public-index\.mjs/);
 assert.match(pkg['site:check'],/site-compendium-phase3-1\.test\.mjs/);
 assert.match(pkg['site:compendium-browser'],/site-compendium-browser\.cjs/);
 assert.match(workflow,/npm run site:compendium-browser/);
 assert.match(workflow,/asteria-phase-3-1-compendium-evidence/);
 const old=read('index.html');
 assert.match(old,/js\/app\.js/);
 assert.doesNotMatch(old,/frontend\/src\/compendium/);
});
