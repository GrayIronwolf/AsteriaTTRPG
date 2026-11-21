import {isCampaignMember,readCampaignMember}
  from './characterPermissions.mjs';
import {validateAudienceRevealAction}
  from '../src/state/presentationAudienceRevealModel.mjs';
import {hybridViewerCanRead}
  from '../src/state/hybridPresentationSessionModel.mjs';

const exists=s=>typeof s?.exists==='function'?s.exists():Boolean(s?.exists);

/** GM-authorised, scene-bound private text. Never writes to public scene feeds. */
export function createPresentationAudienceRevealCommands(context,{requireCampaignGM}){
  const {db,doc,runTransaction,currentUser,serverTimestamp}=context;
  return {
    manageAudienceReveal:async(campaignId,_scope,input={})=>{
      try{
        const action=validateAudienceRevealAction(input);
        const receipt=await runTransaction(db,async tx=>{
          const campaign=await requireCampaignGM(tx,campaignId);
          const recordId=action.audience+'_'+action.targetUid;
          const recordRef=doc(db,'campaigns',campaignId,'presentationAudienceReveals',recordId);
          if(action.type==='clear'){
            tx.delete(recordRef);
            return {status:'cleared',targetUid:action.targetUid,audience:action.audience};
          }
          const sceneRef=doc(db,'campaigns',campaignId,
            action.audience==='member'?'presentationShared':'presentationRestricted','current');
          const sceneSnap=await tx.get(sceneRef);
          if(!exists(sceneSnap)||sceneSnap.data()?.scene==='blank'||
            !Number.isSafeInteger(sceneSnap.data()?.revision)||
            sceneSnap.data().revision!==action.sceneRevision)
            throw Error('Published scene changed or is blacked out. Refresh first.');
          let sessionEpoch='';
          if(action.audience==='member'){
            const membership=await readCampaignMember(tx,db,campaignId,
              {...campaign,id:campaignId},action.targetUid);
            if(!isCampaignMember({...campaign,id:campaignId},action.targetUid,membership))
              throw Error('Recipient is not an active campaign member.');
          }else{
            const sessionSnap=await tx.get(doc(db,'campaigns',campaignId,
              'hybridSessionControl','current'));
            const grantSnap=await tx.get(doc(db,'campaigns',campaignId,
              'hybridViewerGrants',action.targetUid));
            if(!exists(sessionSnap)||!exists(grantSnap)||
              !hybridViewerCanRead(sessionSnap.data(),grantSnap.data(),action.targetUid))
              throw Error('Recipient has no active restricted viewer access.');
            sessionEpoch=sessionSnap.data().epoch;
            if(sceneSnap.data().epoch!==sessionEpoch)
              throw Error('Restricted presentation belongs to another session.');
          }
          const value={version:1,targetUid:action.targetUid,audience:action.audience,
            sceneRevision:action.sceneRevision,title:action.title,body:action.body,
            ...(sessionEpoch?{sessionEpoch}:{}),
            updatedBy:currentUser.uid,updatedAt:serverTimestamp()};
          tx.set(recordRef,value);
          return {status:'shown',targetUid:action.targetUid,audience:action.audience,
            sceneRevision:action.sceneRevision};
        });
        return {ok:true,...receipt};
      }catch(error){return {ok:false,error:error?.message||String(error)};}
    }
  };
}
