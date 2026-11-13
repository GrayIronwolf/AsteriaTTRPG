/**
 * Digital GM Toolkit Phase 3.3 — presentation-only cards for campaign NPCs
 * and creatures. Settings live on their existing private world records.
 * Character stats and the official Creature Compendium remain authoritative.
 */
import {libraryCollectionKey} from './gmNpcCreatureLibraryModel.mjs';

export const GM_CARD_VERSION=1;
export const GM_CARD_TEMPLATES=Object.freeze([
  Object.freeze({id:'portrait',label:'Portrait',description:'Character art and story details'}),
  Object.freeze({id:'dossier',label:'Dossier',description:'Compact roleplaying reference'}),
  Object.freeze({id:'tactical',label:'Tactical',description:'Creature or encounter statistics'})
]);
export const GM_CARD_THEMES=Object.freeze([
  Object.freeze({id:'obsidian',label:'Obsidian Stone'}),
  Object.freeze({id:'slate',label:'Stone Slate'}),
  Object.freeze({id:'parchment',label:'Ashen Parchment'})
]);
export const GM_CARD_FIELDS=Object.freeze([
  Object.freeze({id:'role',label:'Occupation / Role'}),
  Object.freeze({id:'race',label:'Race'}),
  Object.freeze({id:'species',label:'Species'}),
  Object.freeze({id:'faction',label:'Faction'}),
  Object.freeze({id:'location',label:'Location / Habitat'}),
  Object.freeze({id:'threatTier',label:'Threat Tier'}),
  Object.freeze({id:'description',label:'Description / Story Hook'}),
  Object.freeze({id:'personality',label:'Personality'}),
  Object.freeze({id:'goals',label:'Motivations / Goals'}),
  Object.freeze({id:'fears',label:'Fears'}),
  Object.freeze({id:'dialogueStyle',label:'Dialogue Style'}),
  Object.freeze({id:'hp',label:'HP'}),
  Object.freeze({id:'sp',label:'SP'}),
  Object.freeze({id:'mp',label:'MP'}),
  Object.freeze({id:'ac',label:'Creature AC'}),
  Object.freeze({id:'initiative',label:'Initiative'}),
  Object.freeze({id:'xpReward',label:'XP Reward'}),
  Object.freeze({id:'notes',label:'Private GM Notes',private:true})
]);
const allowedFields=new Set(GM_CARD_FIELDS.map(field=>field.id));
const defaultFields=Object.freeze({
  npc:Object.freeze(['role','race','faction','location','description','personality','goals']),
  creature:Object.freeze(['species','threatTier','location','description','hp','ac','xpReward'])
});
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const validOption=(options,value,fallback)=>options.some(x=>x.id===value)?value:fallback;

/** Allow only HTTPS images or same-app image asset paths. Never a data URL. */
export function safeGMCardPortrait(value){
  if(typeof value!=='string'||value.length>600)return '';
  const candidate=value.trim();
  if(!candidate||candidate.includes('\\')||candidate.includes('\n')||
      candidate.includes('\r')||candidate.includes('\t'))return '';
  if(/^(?:\.\/)?(?:assets|images|media)\/[a-zA-Z0-9/_%.+-]+$/i.test(candidate)&&
     !candidate.includes('..')&&!/%2e/i.test(candidate))return candidate;
  try{
    const parsed=new URL(candidate);
    if(parsed.protocol!=='https:'||!parsed.hostname||parsed.username||parsed.password||
       parsed.hash||candidate.length>600)return '';
    return parsed.href;
  }catch{return '';}
}
export function defaultGMCharacterCard(kind='npc'){
  const type=kind==='creature'||kind==='official'?'creature':'npc';
  return {
    version:GM_CARD_VERSION,
    template:type==='creature'?'tactical':'portrait',
    theme:'obsidian',
    tagline:'',
    portraitUrl:'',
    fields:[...defaultFields[type]]
  };
}
/** Normalize legacy and malformed settings into strictly allowed properties. */
export function normalizeGMCharacterCard(input,kind='npc'){
  const defaults=defaultGMCharacterCard(kind);
  const raw=record(input)?input:{};
  const fields=Array.isArray(raw.fields)?raw.fields:defaults.fields;
  const seen=new Set();
  return {
    version:GM_CARD_VERSION,
    template:validOption(GM_CARD_TEMPLATES,raw.template,defaults.template),
    theme:validOption(GM_CARD_THEMES,raw.theme,defaults.theme),
    tagline:typeof raw.tagline==='string'?raw.tagline.trim().slice(0,100):'',
    portraitUrl:safeGMCardPortrait(raw.portraitUrl),
    fields:fields.filter(key=>{
      if(typeof key!=='string'||!allowedFields.has(key)||seen.has(key))return false;
      seen.add(key);return true;
    }).slice(0,GM_CARD_FIELDS.length)
  };
}
export function validateGMCharacterCard(input,kind='npc'){
  if(!record(input))return {ok:false,error:'Invalid character card settings.'};
  if(input.template!==undefined&&!GM_CARD_TEMPLATES.some(x=>x.id===input.template))
    return {ok:false,error:'Unknown card layout.'};
  if(input.theme!==undefined&&!GM_CARD_THEMES.some(x=>x.id===input.theme))
    return {ok:false,error:'Unknown card colour theme.'};
  if(input.tagline!==undefined&&
     (typeof input.tagline!=='string'||input.tagline.trim().length>100))
    return {ok:false,error:'Card subtitle must be at most 100 characters.'};
  if(input.portraitUrl!==undefined&&input.portraitUrl!==''&&
     !safeGMCardPortrait(input.portraitUrl))
    return {ok:false,error:'Use a valid HTTPS portrait URL or an existing local image asset path.'};
  if(input.fields!==undefined&&(!Array.isArray(input.fields)||
     input.fields.length>GM_CARD_FIELDS.length||
     new Set(input.fields).size!==input.fields.length||
     input.fields.some(key=>typeof key!=='string'||!allowedFields.has(key))))
    return {ok:false,error:'Card fields must be unique, known Asteria record fields.'};
  return {ok:true,card:normalizeGMCharacterCard(input,kind)};
}

/**
 * Patch only one existing record in the existing GM world.npcs/creatures array.
 * Never permit writes to official Compendium entries or unknown IDs.
 */
export function updateGMLibraryCard(world,kind,id,settings){
  const collection=libraryCollectionKey(kind);
  if(!collection||typeof id!=='string'||!id||
     id.startsWith('official:')||id.startsWith('legacy-'))
    return {ok:false,error:'Only saved campaign NPCs and creatures can have editable cards.'};
  const records=Array.isArray(world?.[collection])?world[collection]:[];
  const index=records.findIndex(row=>record(row)&&row.id===id);
  if(index===-1)return {ok:false,error:'This library record is no longer available.'};
  const valid=validateGMCharacterCard(settings,kind);
  if(!valid.ok)return valid;
  const updated=records.map((row,i)=>i===index?{...row,card:valid.card}:row);
  return {ok:true,card:valid.card,patch:{[collection]:updated}};
}
export function moveGMCardField(settings,kind,field,direction){
  const next=normalizeGMCharacterCard(settings,kind);
  const index=next.fields.indexOf(field),target=index+direction;
  if(index<0||target<0||target>=next.fields.length)return next;
  [next.fields[index],next.fields[target]]=[next.fields[target],next.fields[index]];
  return next;
}
export function toggleGMCardField(settings,kind,field,visible){
  const next=normalizeGMCharacterCard(settings,kind);
  if(!allowedFields.has(field))return next;
  next.fields=visible?[...next.fields.filter(value=>value!==field),field]:
    next.fields.filter(value=>value!==field);
  return next;
}
export function gmCharacterCardSections(source,settings){
  const row=record(source)?source:{};
  const card=normalizeGMCharacterCard(settings,row.kind||row.libraryKind);
  return card.fields.map(id=>{
    const definition=GM_CARD_FIELDS.find(field=>field.id===id);
    const raw=row[id],value=Array.isArray(raw)?raw[1]??raw[0]:raw;
    const display=value===undefined||value===null?'':String(value).trim();
    return {id,label:definition.label,value:display,private:Boolean(definition.private)};
  }).filter(entry=>entry.value!=='');
}
