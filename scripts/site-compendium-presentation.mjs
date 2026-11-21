import {createHash} from 'node:crypto';
import {existsSync,readFileSync,realpathSync} from 'node:fs';
import {resolve,sep} from 'node:path';
import {
  isPublicDetailScalar,isPublicIndexCode,publicDetailFields
} from '../frontend/src/compendium/publicationPolicy.mjs';
import {libraryFilterFields} from '../frontend/src/compendium/legacyLibrary.mjs';
import {
  publicEntryTarget,resolvePublicEntry
} from '../frontend/src/compendium/publicEntryModel.mjs';

const list=value=>Array.isArray(value)?value:[];
const scalar=value=>{
  if(typeof value==='string')value=value.trim().slice(0,500);
  return isPublicDetailScalar(value)?value:undefined;
};
const valueOf=value=>{
  if(!Array.isArray(value))return scalar(value);
  const items=value.map(scalar).filter(item=>item!==undefined).slice(0,24);
  return items.length?items:undefined;
};
const safeSlug=value=>typeof value==='string'&&/^[a-z0-9][a-z0-9-]*$/.test(value);

export function publicIndexCode(entry){
  const code=entry.metadata?.['Asteria ID Index Code'];
  return isPublicIndexCode(code)?code:'';
}

export function publicFilters(entry){
  const metadata=entry.metadata||{},filters=entry.filters||{};
  const aliases={
    element:metadata.magicalElement,language:metadata.languages,
    rank:metadata.spellRank,rarity:entry.rarity,category:entry.category
  };
  return Object.fromEntries(libraryFilterFields(entry.domain).flatMap(key=>{
    const value=valueOf(filters[key]??metadata[key]??aliases[key]);
    return value===undefined?[]:[[key,value]];
  }));
}

export function publicDetails(entry){
  const metadata=entry.metadata||{},filters=entry.filters||{};
  const spellFields={
    element:metadata.element??metadata.magicalElement??filters.element,
    rank:metadata.rank??metadata.spellRank??filters.rank,
    cost:metadata.cost??metadata.manaCost
  };
  return Object.fromEntries(publicDetailFields(entry.domain).flatMap(key=>{
    if(key==='racialTraits'){
      const rows=list(metadata.racialTraits).flatMap(trait=>{
        if(!trait||typeof trait!=='object'||trait.gmOnly===true||trait.private===true||
          trait.secret===true||trait.visibility&&trait.visibility!=='public')return [];
        const name=scalar(trait.name);
        if(typeof name!=='string')return [];
        const description=scalar(trait.description);
        return [{name:name.slice(0,160),description:typeof description==='string'?description:'',
          effects:list(trait.effects).map(scalar).filter(x=>typeof x==='string').slice(0,24)}];
      }).slice(0,16);
      return rows.length?[[key,rows]]:[];
    }
    const value=valueOf(entry.domain==='spell'&&Object.hasOwn(spellFields,key)?spellFields[key]:
      metadata[key]??filters[key]??(key==='marketPrice'||key==='marketValue'||key==='rarity'?entry[key]:undefined));
    return value===undefined?[]:[[key,value]];
  }));
}

const pngSignature=Buffer.from([137,80,78,71,13,10,26,10]);
const labels={male:'Male',female:'Female',image:'Artwork',symbol:'Element symbol'};
function approvedArtworkPath(entry,source){
  if(typeof source!=='string'||!safeSlug(entry.slug))return false;
  const prefix=entry.domain==='race'?'assets/races/'+entry.slug+'/':
    entry.domain==='item'?'content/items/'+entry.slug+'/':'';
  if(prefix)return source.startsWith(prefix)&&/^[a-z0-9][a-z0-9 _-]*\.png$/i.test(source.slice(prefix.length));
  if(entry.domain!=='spell')return false;
  const element=entry.metadata?.magicalElement??entry.metadata?.element;
  return typeof element==='string'&&/^[a-z]+ Magic$/i.test(element)&&
    source==='assets/magic-elements/'+element.split(' ')[0].toLowerCase()+'-spells.png';
}

/** Includes only public, record-owned art. The generated filename has no source path. */
export function createPublicArtworkRegistry(root){
  root=resolve(root);
  const assets=new Map(),known=new Map();
  const recognize=(entry,source)=>{
    if(!approvedArtworkPath(entry,source))return null;
    if(!known.has(source)){
      const path=resolve(root,source);
      if(!path.startsWith(root+sep)||!existsSync(path)||realpathSync(path)!==path)return null;
      const bytes=readFileSync(path);
      if(!bytes.subarray(0,8).equals(pngSignature))return null;
      const asset=createHash('sha256').update(bytes).digest('hex')+'.png';
      known.set(source,asset);
      assets.set(asset,bytes);
    }
    return known.get(source);
  };
  function project(entry,sections=[]){
    const gallery=new Map();
    for(const [key,caption] of Object.entries(labels)){
      const asset=recognize(entry,entry.images?.[key]);
      if(asset&&!gallery.has(asset))gallery.set(asset,{asset,caption,alt:entry.title+' — '+caption});
    }
    const cover=recognize(entry,entry.imagePath);
    if(cover&&!gallery.has(cover))gallery.set(cover,{asset:cover,caption:'Artwork',alt:entry.title});
    const referenced=new Set(sections.flatMap(section=>[
      ...[...section.body.matchAll(/!\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g)].map(match=>match[1]),
      ...[...section.body.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map(match=>match[1])
    ]));
    const imageReferences=Object.fromEntries([...referenced].slice(0,24).flatMap(reference=>{
      if(!/^[\p{L}\p{N} /._'’()&+-]+$/u.test(reference)||reference.length>240||
        reference.startsWith('/')||reference.split('/').includes('..'))return [];
      const asset=recognize(entry,entry.imageReferences?.[reference]);
      return asset?[[reference,asset]]:[];
    }));
    return {artwork:cover??gallery.values().next().value?.asset??null,
      gallery:[...gallery.values()],imageReferences};
  }
  return {assets,project};
}

const referenceFields=[
  'sourceItems','relatedItems','craftingUses','alchemyUses','culinaryUses','recipes',
  'recipeLinks','ingredients','materials','outputs','requires','upgradesFrom','upgradesTo'
];
const targetKey=row=>row.domain+'/'+row.slug;

export function publicRelated({entry,identity},sections,publicEntries){
  const referenceValues=[
    ...list(entry.related),...referenceFields.flatMap(key=>list(entry.metadata?.[key])),
    ...sections.flatMap(section=>[...section.body.matchAll(/(?<!!)\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g)]
      .map(match=>match[1]))
  ];
  const related=new Map(),identities=publicEntries.map(record=>record.identity);
  function add(candidate){
    const key=targetKey(candidate);
    if(key!==targetKey(identity)&&related.size<8)related.set(key,publicEntryTarget(candidate));
  }
  for(const value of referenceValues){
    const key=typeof value==='string'?value:value?.id??value?.name??value?.title;
    const result=resolvePublicEntry(identities,key);
    if(result.state==='ready')add(result.entry);
  }
  const tags=new Set(list(entry.tags).filter(tag=>typeof tag==='string').map(tag=>tag.toLowerCase()));
  for(const candidate of publicEntries){
    if(related.size>=8)break;
    if(list(candidate.entry.tags).some(tag=>typeof tag==='string'&&tags.has(tag.toLowerCase())))
      add(candidate.identity);
  }
  return [...related.values()];
}

export function publicClassTalents(identity,entries){
  if(identity.domain!=='class')return [];
  return entries.flatMap(({entry,identity:talent})=>{
    if(talent.domain!=='talent'||entry.metadata?.classSlug!==identity.slug)return [];
    const match=String(entry.metadata.talentTier??entry.metadata.tier??'').match(/^(?:tier\s*)?([1-5])$/i);
    return match?[{...publicEntryTarget(talent),tier:Number(match[1])}]:[];
  }).sort((a,b)=>a.tier-b.tier||a.title.localeCompare(b.title,'en'));
}
