import {validateHybridInvitationResponse}
  from '../src/state/hybridInvitationModel.mjs';
import {sessionTimestampMs}
  from '../src/state/hybridPresentationSessionModel.mjs';

/** Standalone recipient-authorized callable. Never assumes campaign membership. */
export async function respondHybridPresentationInvitation(db,uid,data,serverTimestamp){
  if(typeof uid!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(uid))
    throw Error('Sign in with your invited account.');
  const id=data?.args?.[0],scope=data?.args?.[1];
  if(typeof id!=='string'||!/^[A-Za-z0-9_-]{1,160}$/.test(id)||
    scope!=='viewer-scope')throw Error('Invalid viewer invitation request.');
  const response=validateHybridInvitationResponse(data.args[2]);
  const grantRef=db.doc('campaigns/'+id+'/hybridViewerGrants/'+uid);
  const sessionRef=db.doc('campaigns/'+id+'/hybridSessionControl/current');
  const accessRef=db.doc('campaigns/'+id+'/presentationAssetAccess/current');
  const result=await db.runTransaction(async tx=>{
    const [grantSnap,sessionSnap,accessSnap]=await Promise.all([
      tx.get(grantRef),tx.get(sessionRef),tx.get(accessRef)
    ]);
    if(!grantSnap.exists||!sessionSnap.exists)
      throw Error('This invitation is unavailable.');
    const grant=grantSnap.data(),session=sessionSnap.data();
    if(grant.uid!==uid||grant.status!=='pending'||
      grant.revision!==response.expectedGrantRevision||
      grant.epoch!==session.epoch||session.status!=='open'||
      sessionTimestampMs(grant.expiresAt)<=Date.now()||
      sessionTimestampMs(session.expiresAt)<=Date.now())
      throw Error('Invitation is no longer pending. Refresh its status.');
    const access=accessSnap.exists?accessSnap.data():{};
    const viewers={...(access.viewerExpiries||{})};
    const revision=Number(session.revision||0)+1;
    if(response.type==='accept'){
      if(Object.keys(viewers).length>=24&&!viewers[uid])
        throw Error('The current viewer session is full.');
      viewers[uid]=grant.expiresAt;
    }else delete viewers[uid];
    // Refuse a mismatched manifest rather than resurrect access in a new epoch.
    if(access.epoch!==session.epoch)
      throw Error('The viewer session changed. Request another invitation.');
    const status=response.type==='accept'?'active':'declined';
    tx.update(grantRef,{status,
      ...(status==='active'?{acceptedAt:serverTimestamp()}:{declinedAt:serverTimestamp()}),
      revision:response.expectedGrantRevision+1});
    tx.set(accessRef,{...access,viewerExpiries:viewers,
      updatedAt:serverTimestamp()});
    tx.update(sessionRef,{revision,
      ...(response.type==='decline'&&session.screenShare?.viewerUid===uid?{screenShare:null}:{}),
      grantCount:Object.keys(viewers).length,
      invitationCount:Math.max(0,(Number.isSafeInteger(session.invitationCount)
        ?session.invitationCount:Object.keys(viewers).length)-
        (response.type==='decline'?1:0)),
      updatedAt:serverTimestamp()});
    return {status:response.type==='accept'?'accepted':'declined'};
  });
  return {ok:true,...result};
}
