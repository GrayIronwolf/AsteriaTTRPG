/**
 * Phase 3.5 — authorised, selective living-world edits on the existing private
 * campaigns/{campaignId}/systems/gmWorkspace.world map.
 *
 * This is not a second world or a new Firestore collection. NPCs and creatures
 * belong to the Phase 3.4 library; announcements belong to Campaign Information.
 */
import {defaultGMWorkspace} from '../../../src/state/gmWorkspaceModel.mjs';

export const GM_WORLD_STATE_FIELDS=Object.freeze([
  {id:'kingdomStatus',label:'Kingdom Status',max:160},
  {id:'settlementStatus',label:'Settlement Status',max:160},
  {id:'economyStatus',label:'Economy Status',max:160},
  {id:'factionStatus',label:'Faction Status',max:160},
  {id:'creatureActivity',label:'Creature Activity',max:160},
  {id:'magicalActivity',label:'Magical Activity',max:160},
  {id:'politicalTension',label:'Political Tension',numeric:true},
  {id:'corruptionLevel',label:'Corruption Level',numeric:true,min:0},
  {id:'resourceAvailability',label:'Resource Availability',max:160},
  {id:'weather',label:'World Weather',max:160},
  {id:'gmNotes',label:'Private GM World Notes',max:12000,multiline:true}
]);
const field=(id,label,max=500,numeric=false)=>Object.freeze({id,label,max,numeric});
export const GM_WORLD_COLLECTIONS=Object.freeze([
  Object.freeze({id:'regions',label:'Regions',fields:Object.freeze([
    field('name','Region Name',120),field('status','Status'),
    field('resources','Resources',1200),field('travelSafety','Travel Safety')
  ])}),
  Object.freeze({id:'factions',label:'Factions',fields:Object.freeze([
    field('name','Faction Name',120),field('status','Standing'),
    field('score','Reputation Score',0,true),field('notes','Private Notes',2000)
  ])}),
  Object.freeze({id:'settlements',label:'Settlements',fields:Object.freeze([
    field('name','Settlement Name',120),field('region','Region'),
    field('population','Population',0,true),field('state','State')
  ])}),
  Object.freeze({id:'merchants',label:'World Merchants',fields:Object.freeze([
    field('name','Merchant Name',120),field('type','Merchant Type'),
    field('region','Region'),field('wealth','Wealth',0,true)
  ])}),
  Object.freeze({id:'timeline',label:'Timeline',fields:Object.freeze([
    field('title','Event Title',120),field('era','Era'),
    field('type','Type'),field('region','Region')
  ])}),
  Object.freeze({id:'changes',label:'World Changes',fields:Object.freeze([
    field('title','World Change',120),field('region','Region'),
    field('effect','Consequence',2000),field('status','Status')
  ])}),
  Object.freeze({id:'knowledge',label:'Lore & Knowledge',fields:Object.freeze([
    field('title','Lore / Discovery',120),field('level','Knowledge Level'),
    field('region','Region'),field('notes','Private Notes',2000)
  ])}),
  Object.freeze({id:'discoveries',label:'Discoveries',fields:Object.freeze([
    field('name','Discovery',120),field('region','Region'),
    field('type','Type'),field('status','Visibility')
  ])})
]);
export const GM_WORLD_MAX_ROWS=150;
const defaults=defaultGMWorkspace().world;
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const safeId=id=>typeof id==='string'&&/^[A-Za-z0-9_-]{4,100}$/.test(id)&&
  !id.startsWith('official-')&&!id.startsWith('legacy-');
const list=value=>Array.isArray(value)?value:[];
const selection=category=>GM_WORLD_COLLECTIONS.find(group=>group.id===category)||null;

export function gmWorldStateDraft(world={}){
  const source=record(world)?world:{};
  return Object.fromEntries(GM_WORLD_STATE_FIELDS.map(field=>{
    const current=source[field.id]??defaults[field.id]??'';
    return [field.id,String(current)];
  }));
}
export function gmWorldStateFingerprint(world={}){
  const source=record(world)?world:{};
  return JSON.stringify(GM_WORLD_STATE_FIELDS.map(field=>
    [field.id,source[field.id]??defaults[field.id]??null]));
}
function integerValue(raw,label,{minimum=-1000000000}={}){
  if(raw===''||raw===null||raw===undefined)return '';
  const numeric=typeof raw==='number'?raw:Number(String(raw).trim());
  if(!Number.isSafeInteger(numeric)||numeric<minimum||numeric>1000000000)
    throw Error('Enter a valid whole-number '+label+'.');
  return numeric;
}
export function updateGMWorldState(world={},draft={},expectedState){
  if(!record(draft)||typeof expectedState!=='string'||
    expectedState!==gmWorldStateFingerprint(world))
    throw Error('World state changed in another GM tab. Reload before saving.');
  const patch={};
  for(const field of GM_WORLD_STATE_FIELDS){
    const raw=draft[field.id];
    if(field.numeric){
      patch[field.id]=integerValue(raw,field.label,{minimum:field.min??-1000000000});
    }else{
      if(typeof raw!=='string'||raw.trim().length>field.max)
        throw Error(field.label+' must be '+field.max+' characters or less.');
      patch[field.id]=raw.trim();
    }
  }
  return patch;
}
export function gmWorldCollectionDraft(category,entry={}){
  const schema=selection(category);
  if(!schema)throw Error('Unknown world collection.');
  const source=record(entry)?entry:{};
  return Object.fromEntries(schema.fields.map(f=>[f.id,String(source[f.id]??'')]));
}
/** CAS on the individual row keeps different categories/records independent. */
export function upsertGMWorldEntry(world={},category,id,draft={},expectedUpdatedAt=''){
  const schema=selection(category);
  if(!schema||!safeId(id))throw Error('Invalid world record category or identifier.');
  if(!record(draft))throw Error('Invalid world record details.');
  const source=list(world?.[category]);
  if(source.length>GM_WORLD_MAX_ROWS)throw Error('World collection exceeds its supported record limit.');
  const existing=source.find(row=>record(row)&&row.id===id)||null;
  if(String(existing?.updatedAt||'')!==String(expectedUpdatedAt||''))
    throw Error('This world record changed. Reopen its latest version.');
  if(!existing&&source.length>=GM_WORLD_MAX_ROWS)
    throw Error('The world collection has reached '+GM_WORLD_MAX_ROWS+' records.');
  const content={};
  for(const f of schema.fields){
    const value=draft[f.id];
    if(f.numeric){
      content[f.id]=integerValue(value,f.label,{minimum:f.id==='score'?-1000000000:0});
    }else{
      if(typeof value!=='string'||value.trim().length>f.max)
        throw Error(f.label+' must be '+f.max+' characters or less.');
      content[f.id]=value.trim();
    }
  }
  const title=content.name||content.title;
  if(!title)throw Error('Enter a world record name or title.');
  const now=new Date().toISOString();
  const updated={...existing,...content,id,createdAt:existing?.createdAt||now,updatedAt:now};
  // World ledgers do not carry or issue role grants or public publication.
  delete updated.ownerUid;delete updated.gmOnly;delete updated.visibility;
  const next=existing?source.map(row=>row?.id===id?updated:row):[...source,updated];
  return {[category]:next};
}
export function removeGMWorldEntry(world={},category,id,expectedUpdatedAt=''){
  if(!selection(category)||!safeId(id))throw Error('Invalid world record category or identifier.');
  const source=list(world?.[category]);
  const row=source.find(item=>record(item)&&item.id===id);
  if(!row)throw Error('World record no longer exists.');
  if(String(row.updatedAt||'')!==String(expectedUpdatedAt||''))
    throw Error('This world record changed. Reopen before deleting.');
  return {[category]:source.filter(item=>item?.id!==id)};
}
export function gmWorldCollectionRows(world={},category,query=''){
  if(!selection(category))return [];
  const term=String(query||'').trim().toLocaleLowerCase().slice(0,100);
  const schema=selection(category);
  return list(world?.[category]).filter(record).filter(row=>
    !term||schema.fields.some(f=>String(row[f.id]??'').toLocaleLowerCase().includes(term)));
}
