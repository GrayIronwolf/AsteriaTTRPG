import {
  PUBLIC_DOMAIN_IDS,isSafePublicReference,normalizePublicSourceReference,
  publicEntryTarget,resolvePublicEntry
} from './publicEntryModel.mjs';
import {validatePublishedEntry} from './publicationPolicy.mjs';
import {loadPublicDomain} from './publicCatalogue.mjs';
import {publicArtworkUrl} from './publicArtworkLoader.mjs';

const entryModules=import.meta.glob('./public-entry-index/*.json',{import:'default'});
const requests=new Map();
const missing=()=>({state:'missing',entry:null});

function resolveArtwork(row){
  const gallery=row.gallery.flatMap(({asset,alt,caption})=>{
    const url=publicArtworkUrl(asset);
    return url?[{url,alt,caption}]:[];
  });
  const imageReferences=Object.fromEntries(Object.entries(row.imageReferences).flatMap(([token,asset])=>{
    const url=publicArtworkUrl(asset);
    return url?[[token,url]]:[];
  }));
  return Object.freeze({...row,artwork:publicArtworkUrl(row.artwork),gallery,imageReferences});
}

async function resolveEntryKey(rows,key){
  const result=resolvePublicEntry(rows,key);
  const source=normalizePublicSourceReference(key);
  if(result.state!=='missing'||!source||!globalThis.crypto?.subtle)return result;
  const digest=await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(source));
  const hash=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
  const matches=rows.filter(row=>row.sourceKeys.includes(hash));
  if(matches.length>1)return {state:'ambiguous',entry:null,choices:matches.map(publicEntryTarget)};
  return matches.length?{state:'ready',entry:matches[0]}:result;
}

export async function loadPublicEntry(domain,slug){
  if(!PUBLIC_DOMAIN_IDS.includes(domain)||!isSafePublicReference(slug))return missing();
  const path='./public-entry-index/'+domain+'.json';
  if(!Object.hasOwn(entryModules,path))return missing();
  if(!requests.has(domain)){
    const load=entryModules[path]().then(data=>{
      if(data?.version!==1||data.domain!==domain||!Array.isArray(data.entries))
        throw new Error('Invalid published Compendium entry shard');
      return Object.freeze(data.entries.map(entry=>resolveArtwork(validatePublishedEntry(entry,domain))));
    }).catch(error=>{requests.delete(domain);throw error;});
    requests.set(domain,load);
  }
  return resolveEntryKey(await requests.get(domain),slug);
}

/** Resolve an authored reference through the public catalogue, including ambiguous choices. */
export async function resolvePublicReference(raw,entry){
  if(typeof raw!=='string'||raw.length>500)return missing();
  let key=raw.trim(),section='';
  if(key.startsWith('#/'))key=key.slice(1);
  else if(key.startsWith('#')){
    try{section=decodeURIComponent(key.slice(1));}catch{return missing();}
    return entry?.sections?.some(tab=>tab.title===section)?
      {state:'ready',entry:{...publicEntryTarget(entry),section}}:missing();
  }
  const queryIndex=key.indexOf('?');
  if(queryIndex>=0){
    section=new URLSearchParams(key.slice(queryIndex+1)).get('tab')||'';
    key=key.slice(0,queryIndex);
  }
  const anchorIndex=key.indexOf('#');
  if(anchorIndex>=0){
    if(!section){
      try{section=decodeURIComponent(key.slice(anchorIndex+1));}catch{return missing();}
    }
    key=key.slice(0,anchorIndex);
  }
  try{key=decodeURIComponent(key);}catch{return missing();}
  if(!isSafePublicReference(key))return missing();
  const explicit=key.match(/^\/?compendium\/([a-z]+)\/(.+)$/);
  const domain=explicit?.[1];
  if(domain&&!PUBLIC_DOMAIN_IDS.includes(domain))return missing();
  const rows=(await Promise.all((domain?[domain]:PUBLIC_DOMAIN_IDS).map(loadPublicDomain))).flat();
  const result=await resolveEntryKey(rows,explicit?.[2]??key);
  if(result.state!=='ready')return result;
  return {state:'ready',entry:{...publicEntryTarget(result.entry),...(section?{section}:{})}};
}

export function publicBookmarkReference(route){
  if(route.id!=='not-found'&&route.id!=='compendium-entry')return '';
  const reference=route.hash.slice(1).split('?',1)[0];
  let decoded;
  try{decoded=decodeURIComponent(reference);}catch{return '';}
  if(route.id==='compendium-entry'&&!normalizePublicSourceReference(decoded))return '';
  if(!isSafePublicReference(decoded)||
    /^\/?(?:react|account|join|campaign-invitation|character-forge|campaign-forge|dashboard|appearance|version-log|compendium)(?:\/|$)/i.test(decoded))return '';
  return reference;
}

export async function resolveCompendiumBookmark(route){
  const reference=publicBookmarkReference(route);
  if(!reference)return null;
  const result=await resolvePublicReference(reference);
  if(result.state==='missing')return null;
  const params=result.state==='ready'?{domain:result.entry.domain,slug:result.entry.slug}:
    {domain:'',slug:reference,choices:result.choices};
  return {...route,id:'compendium-entry',title:'Compendium Entry',navId:'compendium',params};
}
