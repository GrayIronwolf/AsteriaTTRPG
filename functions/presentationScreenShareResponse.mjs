import {
  validateViewerScreenShareAction,screenShareSignalCanRead,
  screenShareVideoSdp
} from '../src/state/presentationScreenShareModel.mjs';
const exists=s=>Boolean(s?.exists);

/** Recipient-only: UID from Firebase authentication, never request body. */
export async function respondPresentationScreenShare(db,uid,data,serverTimestamp){
  if(typeof uid!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(uid))
    throw Error('Sign in as the invited viewer.');
  const id=data?.args?.[0],scope=data?.args?.[1];
  if(typeof id!=='string'||!/^[A-Za-z0-9_-]{1,160}$/.test(id)||
    scope!=='viewer-scope')throw Error('Invalid screen sharing response.');
  const action=validateViewerScreenShareAction(data.args[2]);
  const sessionRef=db.doc('campaigns/'+id+'/hybridSessionControl/current');
  const grantRef=db.doc('campaigns/'+id+'/hybridViewerGrants/'+uid);
  const signalRef=db.doc('campaigns/'+id+'/presentationScreenShares/'+uid);
  const result=await db.runTransaction(async tx=>{
    const [sessionSnap,grantSnap,signalSnap]=await Promise.all([
      tx.get(sessionRef),tx.get(grantRef),tx.get(signalRef)
    ]);
    const session=exists(sessionSnap)?sessionSnap.data():{};
    const grant=exists(grantSnap)?grantSnap.data():{};
    const signal=exists(signalSnap)?signalSnap.data():{};
    const pointer=session.screenShare||null;
    if(pointer?.viewerUid!==uid||pointer?.connectionId!==action.connectionId||
      signal.connectionId!==action.connectionId)
      throw Error('This screen share is no longer active.');
    if(action.type==='leave'){
      tx.update(sessionRef,{screenShare:null,updatedAt:serverTimestamp()});
      tx.update(signalRef,{status:'stopped',answerSdp:'',offerSdp:'',
        stoppedAt:serverTimestamp()});
      return {status:'stopped'};
    }
    if(!screenShareSignalCanRead(session,grant,signal,uid))
      throw Error('The invitation or screen sharing session expired.');
    if(signal.status!=='offered'||signal.answerSdp)
      throw Error('This screen sharing request was already answered.');
    const sdp=screenShareVideoSdp(action.sdp);
    tx.update(signalRef,{status:'answered',answerSdp:sdp,
      answeredAt:serverTimestamp()});
    return {status:'answered'};
  });
  return {ok:true,...result};
}
