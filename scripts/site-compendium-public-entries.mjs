/**
 * Publish only content expressly marked public, with GM/private sections
 * removed BEFORE Vite ever sees the resulting JSON. Source is unchanged.
 */
import assert from 'node:assert/strict';
import {mkdirSync,rmSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {root,compendiumRoot,domains,readCanonicalCompendium,createPublicSourceLinkProjector} from './site-compendium-source.mjs';
import {createPublicArtworkRegistry,publicClassTalents,publicDetails,publicRelated} from './site-compendium-presentation.mjs';
import { extractPublicSections, isRestrictedSectionTitle } from '../frontend/src/compendium/publicSections.mjs';
import {isPublishedDefinition, validatePublishedEntry} from '../frontend/src/compendium/publicationPolicy.mjs';

const output=join(compendiumRoot,'public-entry-index');
const {entries,hidden}=readCanonicalCompendium(isPublishedDefinition);
const artwork=createPublicArtworkRegistry(root);
const projectSourceLinks=createPublicSourceLinkProjector(entries);
const published=new Map(domains.map(domain=>[domain,[]]));
let sectionsWritten=0;
for(const {entry,identity} of entries){
  const sections=projectSourceLinks(extractPublicSections(entry.body),entry);
  assert.ok(sections.every(item=>!isRestrictedSectionTitle(item.title)));
  const {href,...fields}=identity;
  const row={...fields,sections,...artwork.project(entry,sections),details:publicDetails(entry),
    related:publicRelated({entry,identity},sections,entries),talents:publicClassTalents(identity,entries)};
  published.get(entry.domain).push(validatePublishedEntry(row,entry.domain));
  sectionsWritten+=sections.length;
}
assert.ok(entries.length>0);
const assetDir=join(output,'artwork');
rmSync(assetDir,{recursive:true,force:true});
mkdirSync(assetDir,{recursive:true});
for(const [filename,bytes] of artwork.assets)writeFileSync(join(assetDir,filename),bytes);
for(const [domain,rows] of published){
  rows.sort((a,b)=>a.title.localeCompare(b.title,'en')||a.id.localeCompare(b.id,'en'));
  writeFileSync(join(output,domain+'.json'),JSON.stringify({version:1,domain,entries:rows})+'\n','utf8');
}
console.log('PASS: generated '+entries.length+' public entries with '+sectionsWritten+
  ' public sections; '+hidden+' nonpublic entries excluded.');
