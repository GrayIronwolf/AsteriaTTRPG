import {characterSight,explorationKey} from '../src/state/battleMapVision.mjs';
import {onDocumentWritten} from 'firebase-functions/v2/firestore';
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {isDeepStrictEqual} from 'node:util';
import {
  combatMapVisibility,publicCombatSnapshot,publicCombatPresentation,publicPresentationBattleMap
} from '../src/state/livePresentationProjectionModel.mjs';
import {presentationId} from '../src/state/playerPresentationModel.mjs';

const combatMapId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,120}$/.test(value)?value:'';
function withoutTimestamp(snapshot){
  const value={...snapshot.data()};
  delete value.updatedAt;
  return value;
}
function writeProjection(tx,ref,snapshot,value){
  if(!value){
    if(snapshot.exists)tx.delete(ref);
  }else if(!snapshot.exists||!isDeepStrictEqual(withoutTimestamp(snapshot),value))
    tx.set(ref,{...value,updatedAt:FieldValue.serverTimestamp()});
}
async function mapProjection(tx,db,raw,campaignId,mapId,encounter){
  if(!raw||raw.visibility!=='players')return null;
  try{
    const ids=raw.fogEnabled&&raw.vision?.automatic?[...new Set((raw.tokens||[]).filter(t=>t.kind==='character'&&t.visibility!=='gm')
      .map(t=>t.refId).filter(presentationId))]:[];
    const characters=Object.fromEntries(await Promise.all(ids.map(async id=>[id,
      (await tx.get(db.doc('campaigns/'+campaignId+'/characters/'+id))).data()])));
    return publicPresentationBattleMap(raw,campaignId,mapId,encounter,characters);
  }
  catch{return null;}
}
function saveExploration(tx,source,raw,value){
  if(!value?.exploredCells)return;
  const key=explorationKey(raw);
  if(raw.exploredCells!==value.exploredCells||raw.explorationKey!==key)
    tx.set(source,{exploredCells:value.exploredCells,explorationKey:key},{merge:true});
}
async function synchronize(db,campaignId,changedMapId=''){
  const path='campaigns/'+campaignId;
  const ref=(collection,id='current')=>db.doc(path+'/'+collection+'/'+id);
  return db.runTransaction(async tx=>{
    // Trigger events can arrive out of order. Read the current canonical docs
    // in the same transaction as the safe combat and map projections.
    const encounter=(await tx.get(ref('systems','encounter'))).data()||{};
    const activeMapId=encounter.status==='active'?combatMapId(encounter.battleMapId):'';
    if(changedMapId&&changedMapId!==activeMapId){
      const output=ref('battleMapsPublic',changedMapId);
      const [source,current]=await Promise.all([
        tx.get(ref('battleMaps',changedMapId)),tx.get(output)
      ]);
      const value=await mapProjection(tx,db,source.data(),campaignId,changedMapId,encounter);
      saveExploration(tx,ref('battleMaps',changedMapId),source.data(),value);
      writeProjection(tx,output,current,value);
      return value;
    }
    const combat=ref('combatPublic'),display=ref('presentationCombat');
    const [previous,previousDisplay,presentation,hybrid]=await Promise.all([
      tx.get(combat),tx.get(display),tx.get(ref('presentationShared')),tx.get(ref('hybridSessionControl'))
    ]);
    const previousMapId=combatMapId(previous.data()?.battleMapId);
    const maps=await Promise.all([...new Set([activeMapId,previousMapId].filter(Boolean))].map(async mapId=>{
      const output=ref('battleMapsPublic',mapId);
      const [source,current]=await Promise.all([tx.get(ref('battleMaps',mapId)),tx.get(output)]);
      const raw=source.data();
      return {output,current,mapId,raw,value:await mapProjection(tx,db,raw,campaignId,mapId,encounter)};
    }));
    const active=maps.find(row=>row.mapId===activeMapId);
    const scope=active&&combatMapVisibility(active.raw,active.value);
    const safe=publicCombatSnapshot(encounter,scope);
    const shared=hybrid.data();
    const hybridOpen=shared?.status==='open'&&shared.expiresAt?.toMillis?.()>Date.now();
    const summary={...publicCombatPresentation(encounter,scope),epoch:hybridOpen?shared.epoch:'',
      visible:Boolean(hybridOpen&&presentation.data()?.scene==='combat')};
    for(const row of maps){
      saveExploration(tx,ref('battleMaps',row.mapId),row.raw,row.value);
      writeProjection(tx,row.output,row.current,row.value);
    }
    writeProjection(tx,combat,previous,safe);
    writeProjection(tx,display,previousDisplay,summary);
    return changedMapId?active?.value||null:safe;
  });
}

export const synchronizeCombatPresentation=(db,campaignId)=>synchronize(db,campaignId);
export const synchronizeBattleMapPresentation=(db,campaignId,mapId)=>synchronize(db,campaignId,mapId);

export const asteriaCombatProjection=onDocumentWritten({
  document:'campaigns/{campaignId}/systems/encounter',
  region:'us-central1',maxInstances:3
},async event=>{
  if(!presentationId(event.params.campaignId))return;
  await synchronizeCombatPresentation(getFirestore(),event.params.campaignId);
});

export const asteriaBattleMapProjection=onDocumentWritten({
  document:'campaigns/{campaignId}/battleMaps/{mapId}',
  region:'us-central1',maxInstances:3
},async event=>{
  const {campaignId,mapId}=event.params;
  if(!presentationId(campaignId)||!presentationId(mapId))return;
  await synchronizeBattleMapPresentation(getFirestore(),campaignId,mapId);
});


export const asteriaCharacterVisionProjection=onDocumentWritten({
  document:'campaigns/{campaignId}/characters/{characterId}',region:'us-central1',maxInstances:3
},async event=>{
  const {campaignId,characterId}=event.params;
  if(!presentationId(campaignId)||!presentationId(characterId))return;
  const before=event.data.before.data(),after=event.data.after.data();
  if(before&&after&&isDeepStrictEqual(characterSight(before),characterSight(after))&&
    isDeepStrictEqual(before.activeEffects,after.activeEffects)&&isDeepStrictEqual(before.effects,after.effects))return;
  const db=getFirestore(),maps=await db.collection('campaigns/'+campaignId+'/battleMaps')
    .where('vision.automatic','==',true).limit(40).get();
  for(const map of maps.docs)if(map.data().tokens?.some(token=>token.refId===characterId))
    await synchronizeBattleMapPresentation(db,campaignId,map.id);
});
