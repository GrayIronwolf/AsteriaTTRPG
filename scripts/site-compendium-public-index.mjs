/**
 * Phase 3.1: derived, PUBLIC catalogue shards from the canonical Compendium
 * partitions. Never bundle the unfiltered source parts or GM-only notes into
 * the guest React/Vite preview. This script does not edit authoring sources.
 */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {root,compendiumRoot,domains,readCanonicalCompendium} from './site-compendium-source.mjs';
import {createPublicArtworkRegistry,publicFilters} from './site-compendium-presentation.mjs';
import {isPublishedDefinition, validatePublishedCatalogue} from '../frontend/src/compendium/publicationPolicy.mjs';

const target=join(compendiumRoot,'public-index');
const {entries,hidden,shards}=readCanonicalCompendium(isPublishedDefinition);
const artwork=createPublicArtworkRegistry(root);
const published=new Map(domains.map(domain=>[domain,[]]));
for(const {entry,identity} of entries){
  const row={
    ...identity,artwork:artwork.project(entry).artwork,filters:publicFilters(entry),
    category:typeof entry.category==='string'?entry.category:'',
    tags:Array.isArray(entry.tags)?entry.tags.filter(value=>typeof value==='string').slice(0,16):[]
  };
  published.get(row.domain).push(validatePublishedCatalogue(row,row.domain));
}
assert.ok(entries.length>0,'No public Compendium definitions');
mkdirSync(target,{recursive:true});
for(const [domain,rows] of published){
  rows.sort((a,b)=>a.title.localeCompare(b.title,'en')||a.id.localeCompare(b.id,'en'));
  writeFileSync(join(target,domain+'.json'),JSON.stringify({version:1,domain,entries:rows})+'\n','utf8');
}
console.log('PASS: prepared '+entries.length+' public catalogue records from '+shards+
  ' canonical shards ('+hidden+' non-public excluded).');
