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
function mapProjection(raw,campaignId,mapId,encounter){
  if(!raw||raw.visibility!=='players')return null;
  try{return publicPresentationBattleMap(raw,campaignId,mapId,encounter);}
  catch{return null;}
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
      const value=mapProjection(source.data(),campaignId,changedMapId,encounter);
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
      return {output,current,mapId,raw,value:mapProjection(raw,campaignId,mapId,encounter)};
    }));
    const active=maps.find(row=>row.mapId===activeMapId);
    const scope=active&&combatMapVisibility(active.raw,active.value);
    const safe=publicCombatSnapshot(encounter,scope);
    const shared=hybrid.data();
    const hybridOpen=shared?.status==='open'&&shared.expiresAt?.toMillis?.()>Date.now();
    const summary={...publicCombatPresentation(encounter,scope),epoch:hybridOpen?shared.epoch:'',
      visible:Boolean(hybridOpen&&presentation.data()?.scene==='combat')};
    for(const row of maps)writeProjection(tx,row.output,row.current,row.value);
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
