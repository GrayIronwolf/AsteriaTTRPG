import {onDocumentWritten} from 'firebase-functions/v2/firestore';
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {
  publicCombatSnapshot,publicCombatPresentation,publicPresentationBattleMap
} from '../src/state/livePresentationProjectionModel.mjs';
import {presentationId} from '../src/state/playerPresentationModel.mjs';

/** Reconciles legacy GM/client updates and canonical combat transactions into
 * safe, separate documents. Never copies private raw state into shared feeds.
 * Same Firebase project, existing deployment runtime, no external transport.
 */
export async function synchronizeCombatPresentation(db,campaignId,after){
  const target=db.doc('campaigns/'+campaignId+'/combatPublic/current');
  const current=db.doc('campaigns/'+campaignId+'/presentationCombat/current');
  const [presentation,hybrid]=await Promise.all([
    db.doc('campaigns/'+campaignId+'/presentationShared/current').get(),
    db.doc('campaigns/'+campaignId+'/hybridSessionControl/current').get()
  ]);
  const raw=after||{};
  const safe=publicCombatSnapshot(raw);
  const summary=publicCombatPresentation(raw);
  const presentationMode=presentation.exists?presentation.data()?.scene:'blank';
  const hybridOpen=hybrid.exists&&hybrid.data()?.status==='open'&&
    (typeof hybrid.data()?.expiresAt?.toMillis==='function'&&
      hybrid.data().expiresAt.toMillis()>Date.now());
  await db.runTransaction(async tx=>{
    tx.set(target,{...safe,updatedAt:FieldValue.serverTimestamp()});
    // Restricted display stores only the safe summary. Authorization is
    // independently checked in Firestore rules on every viewer read.
    tx.set(current,{...summary,epoch:hybridOpen?hybrid.data().epoch:'',
      visible:hybridOpen&&presentationMode==='combat',
      updatedAt:FieldValue.serverTimestamp()});
  });
  return safe;
}
export async function synchronizeBattleMapPresentation(db,campaignId,mapId,after){
  const target=db.doc('campaigns/'+campaignId+'/battleMapsPublic/'+mapId);
  if(!after||after.visibility!=='players'){
    await target.delete();
    return null;
  }
  const publicMap=publicPresentationBattleMap(after,campaignId,mapId);
  await target.set({...publicMap,updatedAt:FieldValue.serverTimestamp()});
  return publicMap;
}

export const asteriaCombatProjection=onDocumentWritten({
  document:'campaigns/{campaignId}/systems/encounter',
  region:'us-central1',maxInstances:3
},async event=>{
  if(!presentationId(event.params.campaignId))return;
  await synchronizeCombatPresentation(getFirestore(),event.params.campaignId,
    event.data?.after?.exists?event.data.after.data():null);
});

export const asteriaBattleMapProjection=onDocumentWritten({
  document:'campaigns/{campaignId}/battleMaps/{mapId}',
  region:'us-central1',maxInstances:3
},async event=>{
  const {campaignId,mapId}=event.params;
  if(!presentationId(campaignId)||!presentationId(mapId))return;
  await synchronizeBattleMapPresentation(getFirestore(),campaignId,mapId,
    event.data?.after?.exists?event.data.after.data():null);
});
