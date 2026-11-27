import {
  PRESENTATION_DEFAULT,publicPresentation,presentationDraft,
  validatePresentationAction
} from '../src/state/playerPresentationModel.mjs';
import {restrictedPresentationProjection,sessionTimestampMs} from '../src/state/hybridPresentationSessionModel.mjs';
import {PRESENTATION_MEDIA_SCENES,publishedPresentationAsset} from '../src/state/presentationAssetModel.mjs';
import {publicCombatPresentation} from '../src/state/livePresentationProjectionModel.mjs';
const exists=s=>typeof s?.exists==='function'?s.exists():Boolean(s?.exists);

/** All edits are GM-only, server-authorized, revision checked and published as
 * an explicit safe projection. Neither players nor GMs can write from browser. */
export function createPlayerPresentationCommands(context,{requireCampaignGM}){
  const {db,doc,runTransaction,currentUser,serverTimestamp}=context;
  return {
    managePlayerPresentation:async(campaignId,_scope,action={})=>{
      try{
        const type=validatePresentationAction(action);
        const result=await runTransaction(db,async transaction=>{
          await requireCampaignGM(transaction,campaignId);
          const controlRef=doc(db,'campaigns',campaignId,'presentationControl','current');
          const sharedRef=doc(db,'campaigns',campaignId,'presentationShared','current');
          const snapshot=await transaction.get(controlRef);
          const previous=exists(snapshot)?snapshot.data():PRESENTATION_DEFAULT;
          if(type!=='blackout'&&Number(previous.revision||0)!==action.expectedRevision)
            throw Error('Presentation changed. Refresh and try again.');
          const draft=type==='blackout'
            ?presentationDraft({
              scene:'blank',title:'',subtitle:'',mapId:'',characterIds:[],
              showRound:false,showPartyHP:false,theme:previous.theme||'obsidian'
            })
            :presentationDraft(action.draft);
          if(draft.scene==='battle-map'){
            const map=await transaction.get(doc(db,'campaigns',campaignId,'battleMaps',draft.mapId));
            if(!exists(map)||map.data().visibility!=='players')
              throw Error('Select a battle map published to players.');
          }
          if(draft.scene==='world-map'){
            const map=await transaction.get(doc(db,'campaigns',campaignId,'worldAtlasShared',draft.mapId));
            if(!exists(map)||map.data().status!=='published'||map.data().visibility!=='players')
              throw Error('Select a published world atlas map.');
          }
          if(draft.scene==='party'){
            const records=await Promise.all(draft.characterIds.map(id=>
              transaction.get(doc(db,'campaigns',campaignId,'characters',id))));
            if(records.some((record,i)=>!exists(record)||
              (record.data().id&&record.data().id!==draft.characterIds[i])))
              throw Error('A selected campaign character is no longer available.');
          }
          if(PRESENTATION_MEDIA_SCENES.includes(draft.scene)){
            const media=await transaction.get(doc(db,'campaigns',campaignId,
              'presentationAssets',draft.assetId));
            if(!exists(media)||!publishedPresentationAsset(media.data(),draft.scene))
              throw Error('The selected media is not ready and published.');
          }
          const combatSnap=draft.scene==='combat'?
            await transaction.get(doc(db,'campaigns',campaignId,'systems','encounter')):null;
          const hybridRef=doc(db,'campaigns',campaignId,'hybridSessionControl','current');
          const hybridSnap=await transaction.get(hybridRef);
          const hybrid=exists(hybridSnap)?hybridSnap.data():null;
          const accessRef=doc(db,'campaigns',campaignId,'presentationAssetAccess','current');
          const accessSnap=await transaction.get(accessRef);
          const existingAccess=exists(accessSnap)?accessSnap.data():{};
          // Emergency hide must remain available even when another GM tab has published.
          // The transaction serializes the blackout against the authoritative revision.
          const revision=Number(previous.revision||0)+1;
          const safe=publicPresentation(draft,revision);
          transaction.set(controlRef,{...safe,updatedBy:currentUser.uid,updatedAt:serverTimestamp()});
          transaction.set(sharedRef,{...safe,updatedAt:serverTimestamp()});
          // Restricted screens receive only allowlisted presentation text. Never
          // copy map IDs, combat/party snapshots, notes or Storage references.
          if(hybrid?.status==='open'&&sessionTimestampMs(hybrid.expiresAt)>Date.now()){
            transaction.set(doc(db,'campaigns',campaignId,'presentationRestricted','current'),{
              ...restrictedPresentationProjection(safe,revision),
              epoch:hybrid.epoch,updatedAt:serverTimestamp()
            });
            if(safe.scene==='blank'){
              transaction.set(doc(db,'campaigns',campaignId,'presentationCombat','current'),{
                active:false,round:0,current:'',endsAt:0,epoch:hybrid.epoch,
                visible:false,updatedAt:serverTimestamp()
              });
            }
            if(safe.scene==='combat'){
              transaction.set(doc(db,'campaigns',campaignId,'presentationCombat','current'),{
                ...publicCombatPresentation(exists(combatSnap)?combatSnap.data():{}),
                epoch:hybrid.epoch,visible:true,
                updatedAt:serverTimestamp()
              });
            }
            transaction.set(accessRef,{
              epoch:hybrid.epoch,
              assetId:PRESENTATION_MEDIA_SCENES.includes(safe.scene)?safe.assetId:'',
              mapId:safe.scene==='battle-map'?safe.mapId:'',
              scene:PRESENTATION_MEDIA_SCENES.includes(safe.scene)||safe.scene==='battle-map'?
                safe.scene:'blank',
              expiresAt:hybrid.expiresAt,
              viewerExpiries:existingAccess.epoch===hybrid.epoch?
                {...existingAccess.viewerExpiries}:{},
              updatedAt:serverTimestamp()
            });
          }
          return {revision,scene:safe.scene};
        });
        return {ok:true,...result};
      }catch(error){return {ok:false,error:error?.message||String(error)};}
    }
  };
}
