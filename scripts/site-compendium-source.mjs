import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readdirSync,readFileSync} from 'node:fs';
import {join,resolve,posix} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createPublicSectionHref,getSafePublicHref,isValidPublicEntryRoute,normalizePublicSourceReference} from '../frontend/src/compendium/publicEntryModel.mjs';
import {isPublicEntryAlias} from '../frontend/src/compendium/publicationPolicy.mjs';
import {legacyLibraryCategory} from '../frontend/src/compendium/legacyLibrary.mjs';
import {publicIndexCode} from './site-compendium-presentation.mjs';

export const root=fileURLToPath(new URL('../',import.meta.url));
export const compendiumRoot=resolve(root,'frontend/src/compendium');
export const domains=Object.freeze([
  'race','class','creature','item','spell','talent','profession','skill',
  'origin','location','religion','faction','lore','handbook'
]);

export function readCanonicalCompendium(isPublishedDefinition){
  const directory=resolve(root,'data/compendium-parts');
  const filenames=readdirSync(directory).filter(name=>/^[a-z]+-[a-f0-9]+\.json$/.test(name)).sort();
  assert.ok(filenames.length>=domains.length,'Canonical Compendium partitions are missing.');
  const entries=[],ids=new Set(),routes=new Set();
  let hidden=0;
  for(const filename of filenames){
    const part=JSON.parse(readFileSync(join(directory,filename),'utf8'));
    assert.ok(domains.includes(part.domain)&&Array.isArray(part.entries),'Invalid canonical shard: '+filename);
    for(const entry of part.entries){
      assert.equal(entry.domain,part.domain,'Entry/partition domain mismatch: '+filename);
      if(!isPublishedDefinition(entry)){hidden++;continue;}
      const identity=publicIdentity(entry);
      assert.ok(!ids.has(identity.id),'Duplicate public definition: '+identity.id);
      assert.ok(!routes.has(identity.href),'Duplicate canonical public route: '+identity.href);
      ids.add(identity.id);
      routes.add(identity.href);
      entries.push({entry,identity});
    }
  }
  return {entries,hidden,shards:filenames.length};
}

export function sourcePaths(entry){
  return [...new Set([entry.sourcePath,...(Array.isArray(entry.aliases)?entry.aliases:[])]
    .map(normalizePublicSourceReference).filter(Boolean))].slice(0,24);
}

export function createPublicSourceLinkProjector(entries){
  const paths=new Map();
  for(const {entry,identity} of entries){
    for(const path of sourcePaths(entry)){
      const choices=paths.get(path)||[];
      choices.push(identity);
      paths.set(path,choices);
    }
  }
  return (sections,entry)=>sections.map(section=>{
    const sources=sourcePaths(entry);
    let fence='';
    const body=section.body.split('\n').map(line=>{
      const delimiter=line.match(/^\s{0,3}(\x60{3,}|~{3,})/)?.[1];
      if(delimiter){
        if(!fence)fence=delimiter;
        else if(delimiter[0]===fence[0]&&delimiter.length>=fence.length)fence='';
        return line;
      }
      if(fence)return line;
      return line.replace(
        /(?<!!)\[\[([^\]|]+?\.md)(?:#([^\]|]+))?(?:\|([^\]]*))?\]\]|(?<!!)\[([^\]]+)\]\(([^)]+?\.md)(?:#([^)]+))?\)/gi,
        (match,wiki,heading,caption,markdown,link,anchor)=>{
          const raw=(wiki||link).trim();
          if(/^https:\/\//i.test(raw)&&getSafePublicHref(raw))return match;
          const label=caption||markdown||posix.basename(raw,'.md');
          let decoded,tab;
          try{
            decoded=decodeURIComponent(raw);
            tab=decodeURIComponent(heading||anchor||'');
          }catch{return label;}
          const direct=normalizePublicSourceReference(decoded);
          const relative=(!decoded.startsWith('/')&&!decoded.includes(':'))?
            sources.map(source=>normalizePublicSourceReference(
              posix.normalize(posix.join(posix.dirname(source),decoded)))):[];
          const matches=new Map([direct,...relative].flatMap(path=>paths.get(path)||[])
            .map(target=>[target.id,target]));
          if(matches.size!==1)return label;
          const target=matches.values().next().value;
          return '['+label+']('+createPublicSectionHref(target.domain,target.slug,tab)+')';
        }
      );
    }).join('\n');
    return {...section,body};
  });
}

export function publicIdentity(entry){
  const prefix='/compendium/'+entry.domain+'/';
  const slug=typeof entry.route==='string'&&entry.route.startsWith(prefix)?
    entry.route.slice(prefix.length):'';
  assert.ok(isValidPublicEntryRoute(entry.domain,slug),'Invalid canonical public route: '+entry.id);
  assert.ok(typeof entry.id==='string'&&typeof entry.title==='string'&&entry.title.trim(),
    'Missing public identity: '+entry.id);
  const aliases=[...new Set([entry.slug,...(Array.isArray(entry.aliases)?entry.aliases:[])])]
    .filter(value=>value!==slug&&value!==entry.id&&value!==entry.title&&isPublicEntryAlias(value,entry.domain)).slice(0,24);
  return {
    id:entry.id,title:entry.title,slug,domain:entry.domain,href:'#'+entry.route,aliases,
    indexCode:publicIndexCode(entry),libraryCategory:legacyLibraryCategory(entry),
    sourceKeys:sourcePaths(entry).map(path=>createHash('sha256').update(path).digest('hex')),
    categoryPath:Array.isArray(entry.categoryPath)?
      entry.categoryPath.filter(value=>typeof value==='string').slice(0,6):[],
    summary:typeof entry.summary==='string'?entry.summary.slice(0,500):''
  };
}
