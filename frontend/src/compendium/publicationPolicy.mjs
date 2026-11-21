import {isRestrictedSectionTitle} from './publicSections.mjs';
import {isSafePublicReference,isValidPublicEntryRoute} from './publicEntryModel.mjs';
import {getLibraryCategory,libraryFilterFields} from './legacyLibrary.mjs';

/** A public role flag is an authoring decision, never a browser permission. */
export function isPublishedDefinition(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry) ||
      entry.visibility !== 'public' || entry.gmOnly === true ||
      entry.private === true || entry.secret === true) return false;
  const meta = entry.metadata;
  return !meta || (typeof meta === 'object' && !Array.isArray(meta) &&
    (meta.visibility === undefined || meta.visibility === 'public') &&
    meta.gmOnly !== true && meta.private !== true && meta.secret !== true);
}

const CATALOGUE_KEYS = [
  'id','title','slug','domain','href','categoryPath','category','summary','tags',
  'aliases','sourceKeys','indexCode','libraryCategory','filters','artwork'
];
const ENTRY_KEYS = [
  'id','title','slug','domain','summary','categoryPath','sections','aliases','sourceKeys','indexCode',
  'libraryCategory','artwork','gallery','imageReferences','details','related','talents'
];
const SEARCH_KEYS = ['id','text'];
const detailFields = {
  race:['naturalAC','naturalACSource','size','movement','languages','magicAffinity','racialTraits'],
  class:['role','primaryStat','secondaryStat','combatStyle','magicType','difficulty','startingEquipment','recommendedProfessions'],
  creature:['hp','sp','mp','armour','threatTier','levelRange','size','attacks','soulValue','lootTags'],
  item:['itemType','itemClass','weight','durability','damage','marketValue','marketPrice',
    'rarity','craftingCategory','materialType','materialForm','capacity','length','refinesInto','refinementRatio'],
  spell:['element','rank','cost','castingType','spellSchool','damageType','range','target','duration','castingTime'],
  talent:['className','talentTier','prerequisite','cost','cooldown','range','duration'],
  skill:['primaryStat','secondaryStat','skillRank','trainingType'],
  religion:['pantheon','deity','deityTitle','divineDomain','alignment','region'],
  faction:['region','factionType','alignment','influence','status'],
  profession:['professionType','toolType','craftingCategory','region','rank'],
  location:['locationType','region','biome','climate','faction','settlementType'],
  origin:['region','faction','status'],
  lore:['region','faction','era','loreStatus'],
  handbook:[]
};

export const publicDetailFields=domain=>Object.hasOwn(detailFields,domain)?detailFields[domain]:[];
export const isPublicIndexCode=value=>typeof value==='string'&&/^\d{2}-\d{2}-\d{3}-\d{3}$/.test(value);

const isRecord=value=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
const matchesKeys=(record,expected)=>isRecord(record)&&
  Object.keys(record).length===expected.length&&expected.every(key=>Object.hasOwn(record,key));
const text=(value,max=500)=>typeof value==='string'&&value.trim()!==''&&value.length<=max;
const words=(value,max=24,limit=500)=>Array.isArray(value)&&value.length<=max&&
  value.every(item=>text(item,limit));
const hasControlCode=value=>[...value].some(character=>{
  const code=character.charCodeAt(0);
  return code<32||code===127;
});
export const isPublicDetailScalar=value=>
  typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value)||
  text(value)&&!hasControlCode(value)&&!(/^(?:[a-z]+:\/\/|\/|\.\.?\/)/i).test(value);
export const isPublicDetailValue=value=>isPublicDetailScalar(value)||Array.isArray(value)&&
  value.length<=24&&value.every(isPublicDetailScalar);

// Only literal browser routes and authored display aliases are serialized.
// A source filename, vault path or arbitrary URI is never a published alias.
export function isPublicEntryAlias(value,domain){
  if(!isSafePublicReference(value)||/\.[a-z0-9]{2,8}$/i.test(value))return false;
  if(value.includes('/'))return value.startsWith('/compendium/'+domain+'/')||
    domain==='item'&&/^\/(?:flora|minerals|materials)\//.test(value);
  if(value.includes(':'))return /^(?:[a-z]+:[a-z0-9_-]+|wiki:(?:flora|materials|minerals):[a-z0-9-]+)$/i.test(value);
  return true;
}

// The creature manifest retains an established legacy ID namespace.
const publishedId=(id,domain)=>typeof id==='string'&&id.length<=300&&
  /^[a-z0-9:_-]+$/i.test(id)&&
  (id.startsWith(domain+':')||(domain==='creature'&&id.startsWith('creature-manifest:creature:')));
const identity=(row,domain)=>publishedId(row.id,domain)&&text(row.title)&&
  isValidPublicEntryRoute(domain,row.slug)&&row.domain===domain&&words(row.categoryPath,6)&&
  typeof row.summary==='string'&&row.summary.length<=500&&Boolean(getLibraryCategory(row.libraryCategory))&&
  (row.indexCode===''||isPublicIndexCode(row.indexCode))&&
  Array.isArray(row.aliases)&&row.aliases.length<=24&&row.aliases.every(alias=>isPublicEntryAlias(alias,domain))&&
  Array.isArray(row.sourceKeys)&&row.sourceKeys.length<=24&&row.sourceKeys.every(key=>
    typeof key==='string'&&/^[a-f0-9]{64}$/.test(key));
const isAsset=value=>typeof value==='string'&&/^[0-9a-f]{64}\.png$/.test(value);
const artwork=value=>value===null||isAsset(value);
const gallery=rows=>Array.isArray(rows)&&rows.length<=16&&rows.every(row=>
  matchesKeys(row,['asset','alt','caption'])&&isAsset(row.asset)&&text(row.alt,300)&&
  typeof row.caption==='string'&&row.caption.length<=100);
const imageReferences=value=>isRecord(value)&&Object.keys(value).length<=24&&
  Object.entries(value).every(([key,asset])=>key!=='__proto__'&&text(key,240)&&
    /^[\p{L}\p{N} /._'’()&+-]+$/u.test(key)&&
    !key.startsWith('/')&&!key.split('/').some(segment=>segment==='..')&&isAsset(asset));
const traits=value=>Array.isArray(value)&&value.length<=16&&value.every(row=>
  matchesKeys(row,['name','description','effects'])&&text(row.name,160)&&
  typeof row.description==='string'&&row.description.length<=500&&words(row.effects));
const details=(value,domain)=>isRecord(value)&&Object.entries(value).every(([key,item])=>
  publicDetailFields(domain).includes(key)&&(key==='racialTraits'?traits(item):isPublicDetailValue(item)));
const target=(row,withTier)=>matchesKeys(row,withTier?
  ['domain','slug','title','categoryPath','tier']:['domain','slug','title','categoryPath'])&&
  isValidPublicEntryRoute(row.domain,row.slug)&&text(row.title)&&words(row.categoryPath,6)&&
  (!withTier||row.domain==='talent'&&Number.isInteger(row.tier)&&row.tier>=1&&row.tier<=5);
const targets=(rows,limit,withTier=false)=>Array.isArray(rows)&&rows.length<=limit&&
  rows.every(row=>target(row,withTier));

export function validatePublishedCatalogue(row,domain) {
  if(!matchesKeys(row,CATALOGUE_KEYS)||!identity(row,domain)||
     row.href!=='#/compendium/'+domain+'/'+row.slug||!words(row.tags,16)||
     typeof row.category!=='string'||!artwork(row.artwork)||!isRecord(row.filters)||
     Object.entries(row.filters).some(([key,value])=>!libraryFilterFields(domain).includes(key)||
       !isPublicDetailValue(value)))
    throw new Error('Untrusted published Compendium catalogue.');
  return Object.freeze({...row});
}

export function validatePublishedEntry(row,domain) {
  if(!matchesKeys(row,ENTRY_KEYS)||!identity(row,domain)||!artwork(row.artwork)||
     !gallery(row.gallery)||!imageReferences(row.imageReferences)||!details(row.details,domain)||
     !targets(row.related,8)||!targets(row.talents,domain==='class'?100:0,true)||
     !Array.isArray(row.sections)||row.sections.some(section=>
       !matchesKeys(section,['title','body'])||!text(section.title)||
       typeof section.body!=='string'||isRestrictedSectionTitle(section.title)))
    throw new Error('Untrusted published Compendium entry.');
  return Object.freeze({...row,sections:Object.freeze(row.sections.map(section=>Object.freeze({...section})))});
}

export function validatePublishedSearch(row,domain) {
  if(!matchesKeys(row,SEARCH_KEYS)||!publishedId(row.id,domain)||typeof row.text!=='string')
    throw new Error('Untrusted public Compendium search index.');
  return Object.freeze({...row});
}

export function resolveCompendiumPublicationAccess(visibility) {
  return visibility === 'public'
    ? Object.freeze({visible:true,source:'published-static'})
    : Object.freeze({visible:false,source:'server-only-required'});
}
