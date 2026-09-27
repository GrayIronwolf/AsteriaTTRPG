import {isCampaignGM} from './characterPermissions.mjs';
export function createInformationCommands({db,currentUser,requestId,doc,runTransaction,serverTimestamp}) {
  return {
    sendCharacterNotification:async(campaignId,characterId,input={})=>{
      try {await runTransaction(db,async tx=>{
        const [campaign,target]=await Promise.all([tx.get(doc(db,'campaigns',campaignId)),tx.get(doc(db,'campaigns',campaignId,'characters',characterId))]);
        if(!campaign.exists() || !isCampaignGM(campaign.data(),currentUser.uid))throw new Error('Only the campaign GM can send this notification.');
        if(!target.exists())throw new Error('Character not found.');
        const title=String(input.title || '').trim().slice(0,160),message=String(input.message || '').trim().slice(0,4000);
        if(!title || !message)throw new Error('Enter a title and message.');
        const id=`notice-${requestId}`;
        tx.set(doc(db,'campaigns',campaignId,'events',id),{id,type:'gm-message',targetOwnerUid:target.data().ownerUid,targetCharacterId:characterId,campaignId,payload:{title,message},acknowledged:false,createdAt:serverTimestamp(),createdBy:currentUser.uid});
      });return {ok:true};}catch(error){return {ok:false,error:error.message};}
    },
    markNotificationRead:async(campaignId,characterId,source,id,read=true)=>{
      try {await runTransaction(db,async tx=>{
        const ref=doc(db,'campaigns',campaignId,'characters',characterId),snapshot=await tx.get(ref);
        if(!snapshot.exists() || snapshot.data().ownerUid!==currentUser.uid)throw new Error('Only the character owner can change read state.');
        const character=snapshot.data();
        if(source==='event') {
          const event=await tx.get(doc(db,'campaigns',campaignId,'events',id));
          if(!event.exists() || event.data().targetOwnerUid!==currentUser.uid || event.data().targetCharacterId!==characterId)throw new Error('Notification not found.');
        }else if(source!=='activity' || !(character.actionLog || []).some(row=>row.id===id))throw new Error('Notification not found.');
        if(typeof read!=='boolean')throw new Error('Invalid read state.');
        const ownerRef=doc(db,'users',currentUser.uid,'characters',character.sourceCharacterId || characterId),owner=await tx.get(ownerRef);
        if(owner.exists() && owner.data().ownerUid!==currentUser.uid)throw new Error('Character ownership does not match.');
        const notificationRead={...character.notificationRead,[`${source}:${id}`]:read};
        const patch={notificationRead,updatedAt:serverTimestamp()};
        tx.update(ref,patch);if(owner.exists())tx.update(ownerRef,patch);
      });return {ok:true};}catch(error){return {ok:false,error:error.message};}
    }
  };
}
