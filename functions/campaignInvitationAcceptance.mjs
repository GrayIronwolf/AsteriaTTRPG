import {assertSecureInvitationEligible} from './campaignSecureInvitations.mjs';
import {MEMBER_STATUSES,JOIN_REQUEST_STATUSES} from './campaignMembership.mjs';
import {enqueueCampaignNotification} from './campaignNotifications.mjs';

// Phase 6.3: authenticated preview and deterministic claim into the EXISTING
// canonical join-review queue. Never grants membership or elevated roles.
// A claimant is trusted only through Firebase Auth UID / verified token email.
const ID=/^[A-Za-z0-9_-]{1,160}$/;
const HASH=/^[a-f0-9]{64}$/;
const TOKEN=/^[A-Za-z0-9_-]{43}$/;
const DAY=86400000;
const MAX_CLAIMS_PER_DAY=10;
const validId=x=>typeof x==='string'&&ID.test(x);
const object=x=>Boolean(x)&&typeof x==='object'&&!Array.isArray(x);
const safeNow=value=>{
  const now=value instanceof Date?value:new Date();
  if(!Number.isFinite(now.getTime()))throw Error('Unable to check invitation time.');
  return now;
};
const unavailable=()=>new Error('This invitation is unavailable or no longer valid.');
function assertCampaign(campaign,campaignId){
  if(!object(campaign)||campaign.membershipSchemaVersion!==2||
    !validId(campaign.ownerUid)||(campaign.id&&campaign.id!==campaignId))
    throw unavailable();
}
function verify(invite,identity,args,options,repeat=false){
  // Replays of an earlier accepted token may re-read the user's OWN request
  // after expiration, revocation or exhaustion, but NEVER mutate or add uses.
  const candidate=repeat?{
    ...invite,status:'active',usedCount:0,
    expiresAt:new Date(options.now.getTime()+60000)
  }:invite;
  return assertSecureInvitationEligible(candidate,{
    campaignId:args.campaignId,inviteId:args.inviteId,
    token:args.token,claimantUid:identity.uid,
    claimantEmail:identity.email||null,
    emailVerified:identity.emailVerified===true,
    now:options.now,signingKey:options.signingKey
  });
}
async function assertBoundFriendEligible(db,options,invite,campaign,uid,tx=null){
  if(invite.bindingKind===undefined||invite.bindingKind===null)return;
  if(invite.bindingKind!=='friend-account'||
     options.friendInvitationsEnabled!==true||!options.authAdmin)
    throw unavailable();
  const {assertCurrentFriendInvitationRecipient}=
    await import('./campaignFriendInvitations.mjs');
  try{
    await assertCurrentFriendInvitationRecipient(db,options.authAdmin,
      invite,campaign.ownerUid,uid,tx);
  }catch{throw unavailable();}
}
function identityFromAuth(auth){
  if(!object(auth)||!validId(auth.uid))throw Error('Sign in with Firebase to use the invitation.');
  return {
    uid:auth.uid,
    email:typeof auth.email==='string'?auth.email:null,
    emailVerified:auth.emailVerified===true
  };
}
function safePreview(campaign,invite,eligibility){
  return {
    campaignId:invite.campaignId,
    campaignName:String(campaign.name||'Campaign').slice(0,120),
    roleOffered:eligibility.roleOffered,
    requiresGMApproval:true,
    expiresAt:typeof invite.expiresAt?.toDate==='function'?
      invite.expiresAt.toDate().toISOString():
      (invite.expiresAt instanceof Date?invite.expiresAt:new Date(invite.expiresAt)).toISOString(),
    status:'available'
  };
}
function requestSummary(campaignId,request,alreadyExists){
  return {
    campaignId,status:request.status,
    requiresGMApproval:true,
    offeredRole:request.invitedRole||'player',
    alreadyExists
  };
}

/** Read-only secret-authenticated preview; returns no UID, token or join roster. */
export async function previewSecureCampaignInvitation(db,auth,{
  campaignId,inviteId,token
}={},options={}){
  const identity=identityFromAuth(auth);
  if(!validId(campaignId)||!HASH.test(inviteId)||!TOKEN.test(token))
    throw unavailable();
  const now=safeNow(options.now);
  const [root,record,claimSnap,requestSnap]=await Promise.all([
    db.doc('campaigns/'+campaignId).get(),
    db.doc('campaigns/'+campaignId+'/invitations/'+inviteId).get(),
    db.doc('campaigns/'+campaignId+'/invitations/'+inviteId+'/claims/'+identity.uid).get(),
    db.doc('campaigns/'+campaignId+'/joinRequests/'+identity.uid).get()
  ]);
  if(!root.exists||!record.exists)throw unavailable();
  const campaign=root.data(),invite=record.data();
  assertCampaign(campaign,campaignId);
  if(campaign.joinPolicy?.joinRequestsOpen===false)throw unavailable();
  const existing=claimSnap.exists&&requestSnap.exists&&
    claimSnap.data()?.uid===identity.uid&&
    claimSnap.data()?.inviteId===inviteId&&
    claimSnap.data()?.campaignId===campaignId&&
    requestSnap.data()?.uid===identity.uid&&
    requestSnap.data()?.campaignId===campaignId&&
    requestSnap.data()?.inviteId===inviteId&&
    JOIN_REQUEST_STATUSES.includes(requestSnap.data()?.status);
  const eligible=verify(invite,identity,{campaignId,inviteId,token},
    {...options,now},existing);
  await assertBoundFriendEligible(db,options,invite,campaign,identity.uid);
  return {...safePreview(campaign,invite,eligible),
    status:existing?requestSnap.data().status:'available',
    alreadyExists:existing};
}

/**
 * Redeem an invitation exactly once for this UID, consuming one use and
 * creating only a pending campaign join request; GM approval remains separate.
 * All reads precede writes, sharing one transaction with invitation counters.
 */
export async function acceptSecureCampaignInvitation(db,auth,{
  campaignId,inviteId,token
}={},options={}){
  const identity=identityFromAuth(auth);
  if(!validId(campaignId)||!HASH.test(inviteId)||!TOKEN.test(token))
    throw unavailable();
  const now=safeNow(options.now),uid=identity.uid;
  const prefix='campaigns/'+campaignId;
  return db.runTransaction(async tx=>{
    const rootRef=db.doc(prefix);
    const inviteRef=db.doc(prefix+'/invitations/'+inviteId);
    const requestRef=db.doc(prefix+'/joinRequests/'+uid);
    const memberRef=db.doc(prefix+'/members/'+uid);
    const claimRef=db.doc(prefix+'/invitations/'+inviteId+'/claims/'+uid);
    const throttleRef=db.doc('campaignJoinRequestThrottle/'+uid);
    const auditRef=db.doc(prefix+'/auditEvents/secure-invite-claim-'+inviteId+'-'+uid);
    const [root,inviteSnap,requestSnap,memberSnap,claimSnap,throttleSnap,auditSnap]=
      await Promise.all([
        tx.get(rootRef),tx.get(inviteRef),tx.get(requestRef),
        tx.get(memberRef),tx.get(claimRef),tx.get(throttleRef),tx.get(auditRef)
      ]);
    if(!root.exists||!inviteSnap.exists)throw unavailable();
    const campaign=root.data(),invite=inviteSnap.data();
    assertCampaign(campaign,campaignId);
    if(uid===campaign.ownerUid)throw Error('The campaign owner is already a member.');
    if(memberSnap.exists){
      const member=memberSnap.data();
      if(member.uid!==uid||member.campaignId!==campaignId||
        !MEMBER_STATUSES.includes(member.status)||
        !['player','co-gm','owner'].includes(member.role))
        throw Error('Campaign membership requires review.');
      if(member.status==='active'){
        return {campaignId,status:'member',alreadyExists:true,
          requiresGMApproval:true,offeredRole:'player'};
      }
      throw Error('This account cannot request access to the campaign.');
    }
    if(claimSnap.exists){
      const claim=claimSnap.data(),request=requestSnap.exists?requestSnap.data():null;
      if(!object(claim)||claim.uid!==uid||claim.campaignId!==campaignId||
        claim.inviteId!==inviteId||!auditSnap.exists||
        !object(request)||request.uid!==uid||request.campaignId!==campaignId||
        request.inviteId!==inviteId||
        !JOIN_REQUEST_STATUSES.includes(request.status))
        throw Error('Invitation claim requires reconciliation.');
      verify(invite,identity,{campaignId,inviteId,token},{...options,now},true);
      await assertBoundFriendEligible(db,options,invite,campaign,uid,tx);
      return requestSummary(campaignId,request,true);
    }
    if(requestSnap.exists){
      const previous=requestSnap.data();
      if(previous.uid!==uid||previous.campaignId!==campaignId||
        !JOIN_REQUEST_STATUSES.includes(previous.status))
        throw Error('Existing join request requires review.');
      // Never overwrite or resurrect an earlier UCN/other-invitation request.
      throw Error('An existing campaign join request must be reviewed before using another invitation.');
    }
    if(campaign.joinPolicy?.joinRequestsOpen===false)throw unavailable();
    const eligible=verify(invite,identity,{campaignId,inviteId,token},{...options,now});
    await assertBoundFriendEligible(db,options,invite,campaign,uid,tx);
    if(auditSnap.exists)throw Error('Invitation claim audit requires reconciliation.');
    const previous=throttleSnap.exists?throttleSnap.data():{};
    const start=previous.windowStartedAtMs;
    const count=previous.created;
    if(start!==undefined&&(!Number.isSafeInteger(start)||start<0)||
      count!==undefined&&(!Number.isSafeInteger(count)||count<0))
      throw Error('Join request quota needs reconciliation.');
    const active=Number.isSafeInteger(start)&&now.getTime()>=start&&
      now.getTime()-start<DAY;
    const used=active?(count||0):0;
    if(used>=MAX_CLAIMS_PER_DAY)
      throw Error('Daily join request limit reached.');
    const nextUses=invite.usedCount+1;
    if(!Number.isSafeInteger(nextUses)||nextUses>invite.maxUses)throw unavailable();
    const revision=invite.revision;
    if(!Number.isSafeInteger(revision)||revision<1)throw unavailable();
    const request={
      uid,campaignId,status:'pending',revision:1,
      requestedCharacterId:null,requestedAt:now,updatedAt:now,
      source:'secure-invite',inviteId,
      invitedRole:eligible.roleOffered,
      reviewedAt:null,reviewedByUid:null
    };
    tx.create(requestRef,request);
    if(options.notificationsEnabled===true)
      enqueueCampaignNotification(tx,db,campaign.ownerUid,{
        campaignId,campaignName:campaign.name,kind:'join-request',
        eventKey:'join-request:'+campaignId+':'+uid
      },now);
    tx.create(claimRef,{
      uid,campaignId,inviteId,createdAt:now,status:'claimed',
      requestedRole:eligible.roleOffered
    });
    tx.update(inviteRef,{
      usedCount:nextUses,revision:revision+1,
      status:nextUses>=invite.maxUses?'exhausted':'active',
      lastClaimedAt:now,updatedAt:now
    });
    tx.set(throttleRef,{
      windowStartedAtMs:active?start:now.getTime(),
      created:used+1,updatedAtMs:now.getTime()
    });
    tx.create(auditRef,{
      eventId:'secure-invite-claim-'+inviteId+'-'+uid,
      campaignId,actorUid:uid,subjectUid:uid,
      category:'secure-invitation',action:'claim',inviteId,
      roleOffered:eligible.roleOffered,status:'pending',
      createdAt:now
    });
    return requestSummary(campaignId,request,false);
  });
}
