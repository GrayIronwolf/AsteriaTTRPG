import {
 recordingId,recordingMode,recordingMetadata,recordingSummary,recordingPath,
 publicRecordingArchive,validateRecordingAction,validateRecordingConsent,
 RECORDING_MAX_SECONDS,RECORDING_ARCHIVE_LIMIT,RECORDING_CAMPAIGN_BUDGET_BYTES,
 RECORDING_PARTICIPANT_LIMIT
} from '../src/state/sessionRecordingModel.mjs';
import {isCampaignMember,readCampaignMember} from './characterPermissions.mjs';

const exists=s=>typeof s?.exists==='function'?s.exists():Boolean(s?.exists);
const data=s=>exists(s)?s.data()||{}:{};
const array=v=>Array.isArray(v)?v:[];
const unique=values=>[...new Set(values.filter(recordingId))].sort();
const same=(a,b)=>a.length===b.length&&a.every((uid,index)=>uid===b[index]);
const noticeValue=(control,extra={})=>({
 status:control.status,requestId:control.requestId||'',sessionId:control.sessionId||'',
 mode:control.mode||'',revision:control.revision,participantCount:array(control.participants).length,
 startedAt:control.startedAt||0,expiresAt:control.expiresAt||0,...extra
});
function rosterFromLegacy(campaign,actorUid){
 const roles=Object.entries(campaign.roles||{}).filter(([,role])=>['gm','player'].includes(role)).map(([uid])=>uid);
 return unique([...array(campaign.playerUids),...array(campaign.gmUids),...roles])
  .filter(uid=>uid!==actorUid);
}
async function activeParticipants(tx,context,campaignId,campaign,actorUid){
 if(campaign.membershipSchemaVersion===2){
  // Query snapshot stays within the same trusted Firestore transaction.
  const snap=await tx.get(context.collection(context.db,'campaigns',campaignId,'members').where('status','==','active'));
  if(!Array.isArray(snap.docs))throw Error('Member roster could not be verified.');
  const members=snap.docs.map(doc=>doc.data()).filter(m=>
   m&&m.campaignId===campaignId&&m.uid===m.uid?.trim()&&['player','co-gm'].includes(m.role));
  if(members.length>RECORDING_PARTICIPANT_LIMIT+1)throw Error('Recording participant limit reached.');
  return unique(members.map(m=>m.uid)).filter(uid=>uid!==actorUid);
 }
 if(campaign.membershipSchemaVersion!==undefined&&!([1,null].includes(campaign.membershipSchemaVersion)))
  throw Error('Unsupported campaign membership version.');
 return rosterFromLegacy(campaign,actorUid);
}
function requireSession(session,sessionId){
 if(!exists(session)||session.data().status!=='active'||session.data().id!==sessionId)
  throw Error('Start an active campaign session before requesting recording consent.');
}
export function createSessionRecordingCommands(context,{requireCampaignGM}){
 const {db,doc,collection,runTransaction,currentUser,serverTimestamp}=context;
 const now=context.now||(()=>Date.now());
 const base=['campaigns'];
 const p=(campaignId,...parts)=>doc(db,...base,campaignId,...parts);
 const roster=(tx,campaignId,campaign,uid)=>
  activeParticipants(tx,{db,collection},campaignId,campaign,uid);
 return {
  respondRecordingConsent:async(campaignId,_scope,action={})=>{
   try{
    validateRecordingConsent(action);
    const result=await runTransaction(db,async tx=>{
     const campaignSnap=await tx.get(p(campaignId));
     if(!exists(campaignSnap))throw Error('Campaign not found.');
     const campaign=campaignSnap.data();
     const member=await readCampaignMember({get:async ref=>{
      const row=await tx.get(ref);return {exists:exists(row),data:()=>data(row)};
     }},db,campaignId,campaign,currentUser.uid);
     if(!isCampaignMember(campaign,currentUser.uid,member))throw Error('Active campaign membership is required.');
     const [controlSnap,consentSnap]=await Promise.all([
      tx.get(p(campaignId,'recordingControl','current')),
      tx.get(p(campaignId,'recordingConsents',currentUser.uid))
     ]);
     const control=data(controlSnap);
     if(control.status!=='consent'||control.requestId!==action.requestId)
      throw Error('There is no active recording consent request.');
     if(!array(control.participants).includes(currentUser.uid))
      throw Error('You are not listed as a participant in this request.');
     const consent=data(consentSnap);
     if(consent.requestId===action.requestId&&consent.decision==='decline'&&action.decision==='agree'){
      // A participant can reconsider consent while recording has not started.
     }
     tx.set(p(campaignId,'recordingConsents',currentUser.uid),{
      uid:currentUser.uid,sessionId:control.sessionId,requestId:action.requestId,
      decision:action.decision,updatedAt:serverTimestamp()
     });
     return {decision:action.decision};
    });
    return {ok:true,...result};
   }catch(error){return {ok:false,error:error?.message||String(error)};}
  },
  manageSessionRecording:async(campaignId,_scope,action={})=>{
   try{
    const type=validateRecordingAction(action);
    const result=await runTransaction(db,async tx=>{
     const campaign=await requireCampaignGM(tx,campaignId);
     const controlRef=p(campaignId,'recordingControl','current');
     const noticeRef=p(campaignId,'recordingNotice','current');
     const archiveRef=action.id?p(campaignId,'recordingArchives',action.id):null;
     const quotaRef=p(campaignId,'recordingQuota','current');
     if(type==='request-consent'){
      const [controlSnap,sessionSnap,requestSnap]=await Promise.all([
       tx.get(controlRef),tx.get(p(campaignId,'liveSession','current')),
       tx.get(p(campaignId,'recordingSessions',action.requestId))
      ]);
      requireSession(sessionSnap,action.sessionId);
      const previous=data(controlSnap);
      if((previous.revision||0)!==action.expectedRevision)throw Error('Recording state changed. Refresh.');
      if(previous.status==='recording'&&Number(previous.expiresAt||0)>now())
       throw Error('Stop the active recording first.');
      if(previous.status==='consent')throw Error('Cancel the previous consent request first.');
      if(exists(requestSnap))throw Error('Recording request has already been used.');
      const participants=await roster(tx,campaignId,campaign,currentUser.uid);
      if(participants.length>RECORDING_PARTICIPANT_LIMIT)throw Error('Too many participants.');
      const next={status:'consent',requestId:action.requestId,sessionId:action.sessionId,
       mode:recordingMode(action.mode),participants,actorUid:currentUser.uid,
       revision:action.expectedRevision+1,startedAt:0,expiresAt:0,
       updatedAt:serverTimestamp()};
      tx.set(controlRef,next);
      tx.set(noticeRef,noticeValue(next));
      return {revision:next.revision,requestId:next.requestId,participantCount:participants.length};
     }
     if(type==='start-recording'){
      const [controlSnap,sessionSnap]=await Promise.all([
       tx.get(controlRef),tx.get(p(campaignId,'liveSession','current'))
      ]);
      const control=data(controlSnap);
      if(control.revision!==action.expectedRevision||control.status!=='consent'||
        control.requestId!==action.requestId)throw Error('Recording consent request changed.');
      requireSession(sessionSnap,control.sessionId);
      const currentParticipants=await roster(tx,campaignId,campaign,control.actorUid);
      if(!same(currentParticipants,array(control.participants)))
       throw Error('Campaign participants changed. Request consent again.');
      const checks=await Promise.all(currentParticipants.map(uid=>
       tx.get(p(campaignId,'recordingConsents',uid))));
      if(checks.some(snapshot=>data(snapshot).requestId!==control.requestId||
       data(snapshot).decision!=='agree'))
       throw Error('All listed participants must explicitly agree before recording.');
      const startedAt=now();
      const next={...control,status:'recording',startedAt,
       expiresAt:startedAt+(RECORDING_MAX_SECONDS+60)*1000,
       revision:control.revision+1,updatedAt:serverTimestamp()};
      tx.set(controlRef,next);tx.set(noticeRef,noticeValue(next));
      return {revision:next.revision,startedAt,expiresAt:next.expiresAt};
     }
     if(type==='stop-recording'||type==='cancel-consent'){
      const ctrlSnap=await tx.get(controlRef),control=data(ctrlSnap);
      if(control.revision!==action.expectedRevision||control.requestId!==action.requestId)
       throw Error('Recording state changed. Refresh.');
      if(type==='cancel-consent'&&control.status!=='consent')
       throw Error('No pending consent request.');
      if(type==='stop-recording'&&control.status!=='recording')
       throw Error('No active recording to stop.');
      const sessionRef=p(campaignId,'recordingSessions',control.requestId);
      const already=await tx.get(sessionRef);
      if(exists(already))throw Error('Recording consent request already completed.');
      const next={...control,status:'idle',startedAt:0,expiresAt:0,
       revision:control.revision+1,updatedAt:serverTimestamp()};
      tx.set(controlRef,next);tx.set(noticeRef,noticeValue(next));
      tx.set(sessionRef,{
       id:control.requestId,status:type==='stop-recording'?'completed':'cancelled',
       sessionId:control.sessionId,mode:control.mode,
       participants:control.participants,startedAt:control.startedAt||0,
       stoppedAt:now(),actorUid:control.actorUid,updatedAt:serverTimestamp()
      });
      return {revision:next.revision,requestId:control.requestId};
     }
     if(type==='reserve-archive'){
      const archive=await tx.get(archiveRef);
      if(exists(archive))throw Error('Archive ID is already in use.');
      const details=recordingMetadata(action.details);
      const [quotaSnap,completedSnap]=await Promise.all([
       tx.get(quotaRef),tx.get(p(campaignId,'recordingSessions',details.requestId))
      ]);
      const completed=data(completedSnap),quota=data(quotaSnap);
      if(completed.status!=='completed'||completed.sessionId!==details.sessionId)
       throw Error('Only a consented, completed session recording can be saved.');
      if(Number(quota.activeArchives||0)>=RECORDING_ARCHIVE_LIMIT)
       throw Error('Campaign archive count limit reached.');
      if(Number(quota.reservedBytes||0)+details.size>RECORDING_CAMPAIGN_BUDGET_BYTES)
       throw Error('Campaign recording storage budget exceeded. Archive and delete old recordings first.');
      const record={id:action.id,...details,mode:completed.mode,visibility:'gm',
       status:'uploading',storagePath:recordingPath(campaignId,action.id,details.contentType),
       revision:1,createdBy:currentUser.uid,updatedBy:currentUser.uid,
       createdAt:serverTimestamp(),updatedAt:serverTimestamp()};
      tx.set(archiveRef,record);
      tx.set(quotaRef,{
       activeArchives:Number(quota.activeArchives||0)+1,
       reservedBytes:Number(quota.reservedBytes||0)+details.size,
       updatedAt:serverTimestamp()
      },{merge:true});
      return {id:action.id,revision:1,storagePath:record.storagePath};
     }
     if(type.endsWith('-archive')){
      const sharedRef=p(campaignId,'recordingArchivesShared',action.id);
      const snapshot=await tx.get(archiveRef);
      if(!exists(snapshot))throw Error('Recording archive not found.');
      const archive=snapshot.data();
      if(archive.revision!==action.expectedRevision)throw Error('Recording archive changed. Refresh.');
      if(archive.status==='archived')throw Error('Recording already archived.');
      if(type==='finish-archive'){
       if(archive.status!=='uploading')throw Error('Recording has already finished uploading.');
       const next={...archive,status:'ready',revision:archive.revision+1,
        updatedAt:serverTimestamp(),updatedBy:currentUser.uid};
       tx.set(archiveRef,next);
       return {id:action.id,revision:next.revision};
      }
      if(type==='archive-archive'){
       const quotaSnap=await tx.get(quotaRef),quota=data(quotaSnap);
       const next={...archive,status:'archived',visibility:'gm',
        revision:archive.revision+1,updatedAt:serverTimestamp(),updatedBy:currentUser.uid};
       tx.set(archiveRef,next);tx.delete(sharedRef);
       tx.set(quotaRef,{
        activeArchives:Math.max(0,Number(quota.activeArchives||0)-1),
        reservedBytes:Math.max(0,Number(quota.reservedBytes||0)-Number(archive.size||0)),
        updatedAt:serverTimestamp()
       },{merge:true});
       return {id:action.id,revision:next.revision,storagePath:archive.storagePath};
      }
      if(archive.status!=='ready')throw Error('Upload must finish before editing or sharing.');
      if(type==='update-archive'){
       const next={...archive,...recordingSummary(action.details),revision:archive.revision+1,
        updatedBy:currentUser.uid,updatedAt:serverTimestamp()};
       tx.set(archiveRef,next);
       if(next.visibility==='players')tx.set(sharedRef,publicRecordingArchive(next));
       return {id:action.id,revision:next.revision};
      }
      if(type==='publish-archive'){
       if(archive.visibility!=='gm')throw Error('Recording already shared.');
       const next={...archive,visibility:'players',revision:archive.revision+1,
        updatedAt:serverTimestamp(),updatedBy:currentUser.uid};
       tx.set(archiveRef,next);
       tx.set(sharedRef,publicRecordingArchive(next));
       return {id:action.id,revision:next.revision};
      }
      if(type==='unpublish-archive'){
       if(archive.visibility!=='players')throw Error('Recording is already private.');
       tx.update(archiveRef,{visibility:'gm',revision:archive.revision+1,
        updatedAt:serverTimestamp(),updatedBy:currentUser.uid});
       tx.delete(sharedRef);
       return {id:action.id,revision:archive.revision+1};
      }
     }
     throw Error('Unsupported session recording command.');
    });
    return {ok:true,...result};
   }catch(error){return {ok:false,error:error?.message||String(error)};}
  }
 };
}
