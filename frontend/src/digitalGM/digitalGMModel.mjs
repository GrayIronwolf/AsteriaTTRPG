/**
 * React/Vite Phase 7.4. Private GM-only narrative projections and validation.
 * The merchant standing backend remains separate and authoritative.
 * GM world ledgers do not implicitly alter checks, prices, recognition or rolls.
 */
import {updateGMWorldState,upsertGMWorldEntry,removeGMWorldEntry}
  from './gmWorldSystemsModel.mjs';
import {gmNPCCreatureLibrary,updateGMLibrary,removeGMLibraryRecord}
  from '../../../src/state/gmNpcCreatureLibraryModel.mjs';
import {updateGMLibraryCard} from '../../../src/state/gmCharacterCardModel.mjs';
import {merchantStandingTier} from '../../../src/state/merchantRelationshipModel.mjs';
import {defaultGMWorkspace,normalizeGMWorkspace} from '../../../src/state/gmWorkspaceModel.mjs';
import {buildGMSearchIndex,searchGMIndex} from '../../../src/state/gmUnifiedSearchModel.mjs';

export const GM_ID=/^[a-zA-Z0-9_-]{1,160}$/;
export const RELATIONSHIP_LEVELS=Object.freeze(Array.from({length:17},(_,index)=>index-8));
export const REPUTATION_RANKS=Object.freeze(Array.from({length:15},(_,index)=>index));
export const RELATIONSHIP_SCOPES=Object.freeze(['npc','player','faction','guild','settlement','kingdom']);
export const REPUTATION_SCOPES=Object.freeze(['npc','player','faction','guild','settlement','kingdom']);
export const GM_AREAS=Object.freeze(['library','relationships','stories','tables','calendar','weather','archives','audio','recordings','world']);
const array=v=>Array.isArray(v)?v:[];
const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const bounded=(value,max=160)=>typeof value==='string'?value.trim().slice(0,max):'';
const uint=(value,max)=>Number.isSafeInteger(Number(value))&&Number(value)>=0&&Number(value)<=max?Number(value):0;
const safeId=id=>typeof id==='string'&&GM_ID.test(id)&&!['constructor','__proto__','prototype'].includes(id);
export function assertGMId(id){if(!safeId(id))throw Error('Invalid campaign record identifier.');return id;}
function safeArray(rows,max=150){return array(rows).filter(record).slice(0,max);}
export function gmWorld(workspace={},campaign={}){
  const normalized=normalizeGMWorkspace(workspace,campaign);
  return {
    ...normalized.world,
    relationships:safeArray(normalized.world.relationships),
    reputations:safeArray(normalized.world.reputations)
  };
}
export function relationshipLabel(level){
  if(!Number.isSafeInteger(level)||level < -8||level > 8)throw Error('Relationship level must be -8 to +8.');
  return level===0?'Neutral':level<0?'Negative '+Math.abs(level):'Positive '+level;
}
export function reputationLabel(rank){
  if(!Number.isSafeInteger(rank)||rank<0||rank>14)throw Error('Reputation rank must be 0–14.');
  return rank===0?'Who are you again?':'Rank '+(rank+1);
}
function allowedScope(type){if(!RELATIONSHIP_SCOPES.includes(type))throw Error('Choose a supported campaign entity type.');return type;}
function textField(value,length,label,mandatory=true){
  if(typeof value!=='string'||value.trim().length>length||mandatory&&!value.trim())
    throw Error('Enter a valid '+label+' (up to '+length+' characters).');
  return value.trim();
}
export function canonicalRelationship(input={},old=null,id=''){
  assertGMId(id);if(!record(input))throw Error('Invalid relationship record.');
  const level=Number(input.level);
  if(!Number.isSafeInteger(level)||level< -8||level>8)throw Error('Relationship level must be -8 through +8.');
  const sourceType=allowedScope(input.sourceType),targetType=allowedScope(input.targetType);
  const sourceId=textField(input.sourceId,160,'source ID');
  const targetId=textField(input.targetId,160,'target ID');
  assertGMId(sourceId);assertGMId(targetId);
  if(sourceType===targetType&&sourceId===targetId)throw Error('A relationship needs two distinct entities.');
  const note=textField(input.note??'',500,'reason',false);
  const milestone=textField(input.milestone??'',500,'milestone',false);
  const previous=record(old)?old:null;
  const revision=uint(previous?.revision,999999)+1;
  const history=[{level,note,milestone,at:new Date().toISOString()},
    ...safeArray(previous?.history,19).map(h=>({
      level:Number(h.level)||0,note:bounded(h.note,500),milestone:bounded(h.milestone,500),
      at:bounded(h.at,60)
    }))].slice(0,20);
  return {id,sourceType,sourceId,targetType,targetId,level,note,milestone,
    visibility:'gm',revision,history,
    createdAt:previous?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()};
}
export function canonicalReputation(input={},old=null,id=''){
  assertGMId(id);if(!record(input))throw Error('Invalid reputation record.');
  const rank=Number(input.rank);
  if(!Number.isSafeInteger(rank)||rank<0||rank>14)throw Error('Reputation rank must be 0–14.');
  const scope=allowedScope(input.scope),subjectId=textField(input.subjectId,160,'reputation subject ID');
  assertGMId(subjectId);
  const note=textField(input.note??'',500,'reputation reason',false);
  const milestone=textField(input.milestone??'',500,'recognition milestone',false);
  const title=textField(input.title??'',100,'rank title',false);
  const previous=record(old)?old:null;
  const history=[{rank,note,milestone,at:new Date().toISOString()},
    ...safeArray(previous?.history,19).map(h=>({
      rank:uint(h.rank,14),note:bounded(h.note,500),milestone:bounded(h.milestone,500),
      at:bounded(h.at,60)
    }))].slice(0,20);
  return {id,scope,subjectId,rank,title,note,milestone,
    visibility:'gm',revision:uint(previous?.revision,999999)+1,
    history,createdAt:previous?.createdAt||new Date().toISOString(),
    updatedAt:new Date().toISOString()};
}
/**
 * Evaluate changes against the latest transaction snapshot, not a stale
 * client copy. Concurrent updates to the same row fail closed.
 */
export function worldMutation(current={},operation={}){
  if(!record(operation)||!['library-save','library-delete','card-save',
    'relationship-save','relationship-delete','reputation-save','reputation-delete',
    'world-state-save','world-entry-save','world-entry-delete'].includes(operation.type))
    throw Error('Unsupported GM world operation.');
  const world=gmWorld({world:current});
  if(operation.type==='world-state-save')
    return updateGMWorldState(world,operation.entry,operation.expectedState);
  if(operation.type==='world-entry-save')
    return upsertGMWorldEntry(world,operation.category,assertGMId(operation.id),
      operation.entry,operation.expectedUpdatedAt);
  if(operation.type==='world-entry-delete')
    return removeGMWorldEntry(world,operation.category,assertGMId(operation.id),
      operation.expectedUpdatedAt);
  let key,rows,old=null,patch=null;
  const id=assertGMId(operation.id);
  if(operation.type.startsWith('library')||operation.type==='card-save'){
    if(!['npc','creature'].includes(operation.kind))throw Error('Choose NPC or creature.');
    if(id.startsWith('official:')||id.startsWith('legacy-'))throw Error('Official and legacy identities are read-only.');
    key=operation.kind==='npc'?'npcs':'creatures';
    rows=safeArray(world[key],150);
    old=rows.find(x=>x.id===id)||null;
    if(operation.expectedUpdatedAt!==undefined&&
       String(old?.updatedAt||'')!==String(operation.expectedUpdatedAt||''))
      throw Error('This NPC or creature changed. Reopen its latest record.');
    let result;
    if(operation.type==='library-save')result=updateGMLibrary(world,operation.kind,operation.entry,id);
    if(operation.type==='library-delete')result=removeGMLibraryRecord(world,operation.kind,id);
    if(operation.type==='card-save')result=updateGMLibraryCard(world,operation.kind,id,operation.card);
    if(!result.ok)throw Error(result.error||'Library operation failed.');
    patch=result.patch;
  }else{
    key=operation.type.startsWith('relationship')?'relationships':'reputations';
    rows=safeArray(world[key],200);
    old=rows.find(x=>x.id===id)||null;
    if((old?.revision||0)!==operation.expectedRevision)
      throw Error('The GM ledger changed. Reopen the record before saving.');
    if(operation.type.endsWith('delete')){
      if(!old)throw Error('The record no longer exists.');
      patch={[key]:rows.filter(x=>x.id!==id)};
    }else{
      if(!old&&rows.length>=200)throw Error('The GM ledger has reached its record limit.');
      const next=key==='relationships'?canonicalRelationship(operation.entry,old,id):
        canonicalReputation(operation.entry,old,id);
      patch={[key]:old?rows.map(x=>x.id===id?next:x):[...rows,next]};
    }
  }
  return patch;
}
export function gmToolkitProjection(workspace={},sources={},campaign={}){
  const world=gmWorld(workspace,campaign);
  const index=gmNPCCreatureLibrary(world,[],{});
  const relationships=safeArray(world.relationships,200).filter(x=>safeId(x.id)).map(x=>Object.freeze({
    id:x.id,sourceType:x.sourceType,sourceId:x.sourceId,targetType:x.targetType,
    targetId:x.targetId,level:uint(Number(x.level)+8,16)-8,
    note:bounded(x.note,500),milestone:bounded(x.milestone,500),revision:uint(x.revision,999999),
    label:relationshipLabel(uint(Number(x.level)+8,16)-8),history:safeArray(x.history,20)
  }));
  const reputations=safeArray(world.reputations,200).filter(x=>safeId(x.id)).map(x=>Object.freeze({
    id:x.id,scope:x.scope,subjectId:x.subjectId,rank:uint(x.rank,14),
    title:bounded(x.title,100)||reputationLabel(uint(x.rank,14)),
    note:bounded(x.note,500),milestone:bounded(x.milestone,500),revision:uint(x.revision,999999),
    history:safeArray(x.history,20)
  }));
  const merchantRelationships=safeArray(sources.merchantRelationships).map(x=>Object.freeze({
    id:bounded(x.id),shopId:bounded(x.shopId),characterId:bounded(x.characterId),
    score:Number.isSafeInteger(x.score)?x.score:0,
    tier:Number.isSafeInteger(x.score)&&x.score>=-100&&x.score<=100?merchantStandingTier(x.score):'Unknown',
    message:bounded(x.message,500)
  }));
  return Object.freeze({
    world,library:Object.freeze(index.rows),counts:index.counts,
    relationships:Object.freeze(relationships),reputations:Object.freeze(reputations),
    merchantRelationships:Object.freeze(merchantRelationships),
    factions:Object.freeze(safeArray(world.factions,150).map((x,index)=>Object.freeze({
      id:bounded(x.id)||'faction-'+index,name:bounded(x.name)||bounded(x.title)||'Faction',
      reputation:bounded(x.reputation||x.status||x.standing||'',120),
      notes:bounded(x.notes||x.description||'',500)
    }))),
    notes:workspace?.notes||defaultGMWorkspace().notes,
    quests:Object.freeze(safeArray(workspace?.quests,150)),
    sections:Object.freeze(Object.fromEntries(Object.entries(sources)
      .filter(([k])=>k!=='merchantRelationships')
      .map(([k,v])=>[k,Array.isArray(v)?safeArray(v,200):record(v)?{...v}:null])))
  });
}
export function localGMSearch(workspace={},sources={},query=''){
  const available={workspace,...sources},index=buildGMSearchIndex(available);
  return searchGMIndex(index,query,'all',50);
}