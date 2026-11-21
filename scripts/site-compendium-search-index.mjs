/**
 * Derived public keyword index, built only from the Phase 3.2 filtered
 * entry shards. Raw canonical Markdown/GM sections are never indexed.
 */
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeDiscoveryText } from '../frontend/src/compendium/discoveryModel.mjs';
import {validatePublishedCatalogue,validatePublishedEntry,validatePublishedSearch} from '../frontend/src/compendium/publicationPolicy.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const catalogueDir = resolve(root, 'frontend/src/compendium/public-index');
const entriesDir = resolve(root, 'frontend/src/compendium/public-entry-index');
const target = resolve(root, 'frontend/src/compendium/public-search-index');
const domains = [
  'race','class','creature','item','spell','talent','profession',
  'skill','origin','location','religion','faction','lore','handbook'
];
const MAX_TERMS = 1400;
mkdirSync(target, {recursive:true});
let count=0, tokens=0;
for(const domain of domains) {
  const catalogue=JSON.parse(readFileSync(join(catalogueDir,domain+'.json'),'utf8'));
  const source=JSON.parse(readFileSync(join(entriesDir,domain+'.json'),'utf8'));
  assert.equal(catalogue.domain,domain);
  assert.equal(source.domain,domain);
  const byId=new Map(catalogue.entries.map(raw=>{
    const row=validatePublishedCatalogue(raw,domain);
    return [row.id,row];
  }));
  const entries=source.entries.map(raw=>{
    const entry=validatePublishedEntry(raw,domain);
    const catalogueEntry=byId.get(entry.id);
    assert.ok(catalogueEntry,'Public entry absent from catalogue: '+entry.id);
    assert.equal(entry.slug,catalogueEntry.slug,'Public search route identity diverged: '+entry.id);
    const seen=new Set();
    const words = [];
    const sections = Array.isArray(entry.sections) ? entry.sections : [];
    for(const section of sections) {
      const input=normalizeDiscoveryText(section.title+' '+section.body);
      for(const term of input.split(' ')) {
        if(term.length<2 || seen.has(term)) continue;
        seen.add(term);
        words.push(term);
        if(words.length>=MAX_TERMS)break;
      }
      if(words.length>=MAX_TERMS)break;
    }
    tokens+=words.length;
    // No raw headings/bodies, source paths, raw metadata, or visibility flags.
    return validatePublishedSearch({id:entry.id,text:words.join(' ')},domain);
  });
  assert.equal(entries.length,byId.size,'Mismatch in public search/catalogue parity');
  count+=entries.length;
  writeFileSync(join(target,domain+'.json'),JSON.stringify({
    version:1,domain,entries
  })+'\n','utf8');
}
assert.ok(count>0);
console.log('PASS: '+count+' public-search records, '+tokens+
  ' normalized distinct tokens from published sections; no raw Markdown indexed');
