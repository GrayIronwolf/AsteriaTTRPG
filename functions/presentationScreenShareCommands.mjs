import {
  validateGMScreenShareAction,screenShareDeadline
} from '../src/state/presentationScreenShareModel.mjs';
import {hybridViewerCanRead} from '../src/state/hybridPresentationSessionModel.mjs';
const exists=row=>typeof row?.exists==='function'?row.exists():Boolean(row?.exists);

/** All signaling is private, video-only, one viewer at a time. */
export function createPresentationScreenShareCommands(context,{requireCampaignGM}){
  const {db,doc,runTransaction,currentUser,serverTimestamp}=context;
  return {managePresentationScreenShare:async(campaignId,_scope,input={})=>{
    try{
      const action=validateGMScreenShareAction(input);
      const result=await runTransaction(db,async tx=>{
        await requireCampaignGM(tx,campaignId);
        const sessionRef=doc(db,'campaigns',campaignId,'hybridSessionControl','current');
        const grantRef=doc(db,'campaigns',campaignId,'hybridViewerGrants',action.viewerUid);
        const signalRef=doc(db,'campaigns',campaignId,'presentationScreenShares',action.viewerUid);
        const [sessionSnap,grantSnap,signalSnap]=await Promise.all([
          tx.get(sessionRef),tx.get(grantRef),tx.get(signalRef)
        ]);
        const session=exists(sessionSnap)?sessionSnap.data():{};
        const grant=exists(grantSnap)?grantSnap.data():{};
        const previous=exists(signalSnap)?signalSnap.data():{};
        const pointer=session.screenShare||null;
        if(action.type==='stop'){
          // A delayed stop from an old connection must never close a newer one.
          if(pointer?.viewerUid!==action.viewerUid||
            pointer?.connectionId!==action.connectionId)
            return {status:'already-stopped'};
          tx.update(sessionRef,{screenShare:null,updatedAt:serverTimestamp()});
          tx.set(signalRef,{status:'stopped',viewerUid:action.viewerUid,
            connectionId:action.connectionId,epoch:session.epoch||'',
            stoppedAt:serverTimestamp()});
          return {status:'stopped'};
        }
        if(!hybridViewerCanRead(session,grant,action.viewerUid))
          throw Error('An active, accepted invitation is required to share the screen.');
        if(pointer)throw Error('Stop the current screen share before starting another.');
        // One session per GM/viewer; no chance of two independent active shares.
        if(previous.status==='offered'||previous.status==='answered'){
          if(previous.epoch===session.epoch&&
            Number(previous.expiresAt?.toMillis?.()||previous.expiresAt||0)>Date.now())
            throw Error('An earlier share is still active. Stop it first.');
        }
        const expiresAt=new Date(screenShareDeadline(session,grant));
        tx.update(sessionRef,{screenShare:{
          viewerUid:action.viewerUid,connectionId:action.connectionId
        },updatedAt:serverTimestamp()});
        tx.set(signalRef,{
          version:1,status:'offered',connectionId:action.connectionId,
          viewerUid:action.viewerUid,epoch:session.epoch,
          offerSdp:action.sdp,answerSdp:'',
          expiresAt,startedAt:serverTimestamp(),startedBy:currentUser.uid
        });
        return {status:'offered',expiresAt:expiresAt.getTime()};
      });
      return {ok:true,...result};
    }catch(error){return {ok:false,error:error?.message||String(error)};}
  }};
}
