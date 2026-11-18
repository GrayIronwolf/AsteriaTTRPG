/**
 * Phase 4.5: inspect the ACTUAL public Compendium projection before release.
 * Only explicit public content may enter the static Vite bundle.
 */
import assert from 'node:assert/strict';
import {readdirSync,readFileSync,existsSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  isPublishedDefinition,validatePublishedCatalogue,
  validatePublishedEntry,validatePublishedSearch
} from '../frontend/src/compendium/publicationPolicy.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const parts=resolve(root,'data/compendium-parts');
const shard=kind=>resolve(root,'frontend/src/compendium/'+kind);
const filenames=readdirSync(parts).filter(name=>/^[a-z]+-[a-f0-9]+\.json$/.test(name));
const official=new Map(),restricted=new Set();
for(const name of filenames){
  const part=JSON.parse(readFileSync(join(parts,name),'utf8'));
  const current=official.get(part.domain)||new Map();
  for(const entry of part.entries){
    assert.ok(!current.has(entry.id),'Duplicate Compendium identity '+entry.id);
    current.set(entry.id,entry);
    if(!isPublishedDefinition(entry))restricted.add(entry.id);
  }
  official.set(part.domain,current);
}
let reviewed=0,omitted=0;
for(const [domain,source] of official){
  const catalogue=JSON.parse(readFileSync(join(shard('public-index'),domain+'.json'),'utf8'));
  const entries=JSON.parse(readFileSync(join(shard('public-entry-index'),domain+'.json'),'utf8'));
  const search=JSON.parse(readFileSync(join(shard('public-search-index'),domain+'.json'),'utf8'));
  for(const data of [catalogue,entries,search]){
    assert.equal(data.version,1);assert.equal(data.domain,domain);
    assert.ok(Array.isArray(data.entries));
  }
  const expected=new Set([...source.values()].filter(isPublishedDefinition).map(row=>row.id));
  omitted+=source.size-expected.size;
  const outputs=[
    catalogue.entries.map(item=>validatePublishedCatalogue(item,domain)),
    entries.entries.map(item=>validatePublishedEntry(item,domain)),
    search.entries.map(item=>validatePublishedSearch(item,domain))
  ];
  for(const output of outputs){
    const present=new Set();
    for(const row of output){
      assert.ok(expected.has(row.id),'Restricted/unpublished identity in public asset: '+row.id);
      assert.ok(!present.has(row.id),'Duplicate published entry: '+row.id);
      present.add(row.id);
    }
    assert.deepEqual([...present].sort(),[...expected].sort(),
      'Catalogue, entry and search publication sets diverged for '+domain);
  }
  const catalogueById=new Map(outputs[0].map(x=>[x.id,x]));
  for(const entry of outputs[1]){
    const original=source.get(entry.id), listing=catalogueById.get(entry.id);
    assert.equal(entry.title,original.title,'Title differs from approved source');
    assert.equal(listing.title,entry.title);
    assert.equal(entry.slug,listing.slug);
    assert.equal(entry.domain,domain);
    assert.ok(!restricted.has(entry.id));
  }
  reviewed+=expected.size;
}
assert.ok(reviewed>200 && omitted>=0,'Compendium publication audit requires source records.');
const dist=resolve(root,'frontend-dist');
if(existsSync(dist)){
  const manifest=resolve(dist,'.vite/manifest.json');
  assert.ok(existsSync(manifest),'React bundle manifest missing during publication audit');
  const output=JSON.parse(readFileSync(manifest,'utf8'));
  assert.ok(output['index.html']?.isEntry,'React bundle missing entry');
}
console.log('PASS: Phase 4.5 verified '+reviewed+
  ' public definitions and excluded '+omitted+
  ' restricted definitions across catalogue, entries and search (no private CDN assets).');
