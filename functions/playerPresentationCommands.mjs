import {
  PRESENTATION_DEFAULT,publicPresentation,presentationDraft,
  validatePresentationAction
} from '../src/state/playerPresentationModel.mjs';
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
          if(Number(previous.revision||0)!==action.expectedRevision)
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
          const revision=action.expectedRevision+1;
          const safe=publicPresentation(draft,revision);
          transaction.set(controlRef,{...safe,updatedBy:currentUser.uid,updatedAt:serverTimestamp()});
          transaction.set(sharedRef,{...safe,updatedAt:serverTimestamp()});
          return {revision,scene:safe.scene};
        });
        return {ok:true,...result};
      }catch(error){return {ok:false,error:error?.message||String(error)};}
    }
  };
}
