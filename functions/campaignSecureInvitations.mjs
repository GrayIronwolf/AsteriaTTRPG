import {createHash,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';

// Phase 6.1: issuance and pure validation only. No join, approval,
// member/character changes, delivery, or browser-manageable invitation data.
const ID=/^[A-Za-z0-9_-]{1,160}$/;
const REQUEST_ID=/^[A-Za-z0-9_-]{12,80}$/;
const DIGEST=/^[a-f0-9]{64}$/;
const TOKEN=/^[A-Za-z0-9_-]{43}$/; // 32 random bytes, base64url without padding
const DAY=24*60*60*1000;
const HOUR=60*60*1000;
const MAX_ISSUED_PER_DAY=10;
const MAX_USES=25;
const MAX_EXPIRY_HOURS=720; // 30 days
const record=x=>Boolean(x)&&typeof x==='object'&&!Array.isArray(x);
const validId=x=>typeof x==='string'&&ID.test(x);
const invalid=()=>new Error('This invitation is unavailable.');

export function normalizedInviteEmail(email){
  if(typeof email!=='string')throw Error('Enter a valid recipient email.');
  const value=email.trim().toLowerCase();
  if(value.length<3||value.length>254||!(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)))
    throw Error('Enter a valid recipient email.');
  return value;
}
function secretBytes(secret){
  if(typeof secret!=='string'&&!(secret instanceof Uint8Array))
    throw Error('Secure invitation signing key is not configured.');
  const key=Buffer.from(secret);
  if(key.length<32)throw Error('Secure invitation signing key is not configured.');
  return key;
}
function dateValue(value){
  if(value instanceof Date)return value;
  if(value?.toDate&&typeof value.toDate==='function')return value.toDate();
  if(typeof value==='string'||typeof value==='number')return new Date(value);
  return new Date(NaN);
}
function dayLimit(previous,nowMs){
  if(previous!==null&&!record(previous))
    throw Error('Invitation issuance limit needs reconciliation.');
  const start=previous?.windowStartedAtMs;
  const count=previous?.issued;
  if(start!==undefined&&(!Number.isSafeInteger(start)||start<0)||
     count!==undefined&&(!Number.isSafeInteger(count)||count<0))
    throw Error('Invitation issuance limit needs reconciliation.');
  const active=Number.isSafeInteger(start)&&nowMs>=start&&nowMs-start<DAY;
  const used=active?(count||0):0;
  if(used>=MAX_ISSUED_PER_DAY)throw Error('Daily secure invitation limit reached.');
  return {windowStartedAtMs:active?start:nowMs,issued:used+1,updatedAtMs:nowMs};
}
function tokenDigest(secret,campaignId,inviteId,token){
  return createHmac('sha256',secretBytes(secret))
    .update('asteria-campaign-invite-v1\0'+campaignId+'\0'+inviteId+'\0'+token)
    .digest('hex');
}
function newInviteId(actorUid,campaignId,requestId){
  return createHash('sha256')
    .update('invite-id-v1\0'+actorUid+'\0'+campaignId+'\0'+requestId)
    .digest('hex');
}
function safeSummary(invite,alreadyIssued){
  return {
    campaignId:invite.campaignId,inviteId:invite.inviteId,
    type:invite.type,roleOffered:invite.roleOffered,status:invite.status,
    expiresAt:dateValue(invite.expiresAt).toISOString(),
    maxUses:invite.maxUses,usedCount:invite.usedCount,
    requiresGMApproval:invite.requiresGMApproval,
    alreadyIssued
  };
}

/**
 * Owner-only v2 issuance, fully atomic and rate-limited. No persistent raw token.
 * requestId is a client-side UUID (or equivalent random request key); a retry
 * never issues a new token or reveals the first token again.
 *
 * options.signingKey is supplied by a Firebase Secret Manager secret, not
 * by the browser. options.now/tokenFactory exist for deterministic unit tests.
 */
export async function issueSecureCampaignInvitation(db,actorUid,{
  campaignId,requestId,type='share-link',roleOffered='player',
  recipientEmail=null,recipientUid=null,expiresInHours=168,
  maxUses=1,requiresGMApproval=true
}={},options={}){
  if(!validId(actorUid)||!validId(campaignId)||!REQUEST_ID.test(requestId))
    throw Error('Sign in as campaign owner and provide a unique invitation request ID.');
  if(!['email','share-link'].includes(type)||!['player','co-gm'].includes(roleOffered)||
    !Number.isSafeInteger(expiresInHours)||expiresInHours<1||
    expiresInHours>MAX_EXPIRY_HOURS||
    !Number.isSafeInteger(maxUses)||maxUses<1||maxUses>MAX_USES||
    requiresGMApproval!==true)
    throw Error('Choose valid invitation type, duration, usage limit and approval policy.');
  const email=recipientEmail==null?null:normalizedInviteEmail(recipientEmail);
  const uid=recipientUid==null?null:recipientUid;
  if(uid!==null&&!validId(uid))throw Error('Choose a valid recipient account.');
  if(type==='email'&&!email||type==='share-link'&&email)
    throw Error('Email invitations require a recipient email; share links cannot contain one.');
  if((email||uid)&&maxUses!==1)
    throw Error('Recipient-restricted invitations must allow only one use.');
  // Phase 5.2: server-only resolver runs INSIDE the same transaction as
  // private invitation creation. Browser code cannot supply a UID or hook.
  const resolveBoundRecipient=options.resolveBoundRecipient;
  if(resolveBoundRecipient!==undefined&&(
    typeof resolveBoundRecipient!=='function'||uid!==null||email!==null||
    type!=='share-link'||roleOffered!=='player'||maxUses!==1))
    throw Error('Invalid recipient restriction.');
  const now=options.now instanceof Date&&Number.isFinite(options.now.getTime())?
    options.now:new Date();
  const time=now.getTime();
  const token=(options.tokenFactory||(()=>randomBytes(32).toString('base64url')))();
  if(typeof token!=='string'||!TOKEN.test(token))
    throw Error('Could not create a secure invitation credential.');
  const inviteId=newInviteId(actorUid,campaignId,requestId);
  const digest=tokenDigest(options.signingKey,campaignId,inviteId,token);
  const path='campaigns/'+campaignId;
  const campaignRef=db.doc(path);
  const invitationRef=db.doc(path+'/invitations/'+inviteId);
  const indexRef=db.doc('campaignInvitationTokenIndex/'+digest);
  const throttleRef=db.doc('campaignInvitationIssueThrottle/'+actorUid);
  const auditRef=db.doc(path+'/auditEvents/secure-invite-'+inviteId);
  return db.runTransaction(async tx=>{
    const [campaignSnap,existingSnap,indexSnap,throttleSnap,auditSnap]=await Promise.all([
      tx.get(campaignRef),tx.get(invitationRef),tx.get(indexRef),
      tx.get(throttleRef),tx.get(auditRef)
    ]);
    if(!campaignSnap.exists)throw Error('Campaign not found.');
    const campaign=campaignSnap.data();
    if(!record(campaign)||campaign.membershipSchemaVersion!==2||
      !validId(campaign.ownerUid)||campaign.ownerUid!==actorUid||
      campaign.id&&campaign.id!==campaignId)
      throw Error('Only the owner of an upgraded campaign can issue secure invitations.');
    if(existingSnap.exists){
      const previous=existingSnap.data();
      if(!record(previous)||previous.campaignId!==campaignId||
        previous.inviteId!==inviteId||previous.createdByUid!==actorUid||
        !auditSnap.exists)
        throw Error('Invitation request needs reconciliation.');
      if(resolveBoundRecipient){
        // A reused request key must never silently acknowledge a different
        // recipient; revalidate within this same transaction.
        const currentUid=await resolveBoundRecipient(tx,{campaignId,actorUid,now});
        if(previous.recipientUid!==currentUid||previous.maxUses!==1||
           previous.type!=='share-link'||previous.roleOffered!=='player'||
           previous.recipientEmailNormalized!==null||
           previous.requiresGMApproval!==true)
          throw Error('Invitation recipient unavailable.');
      }
      // Never regenerate/recover a bearer token after its one-time disclosure.
      return {...safeSummary(previous,true),token:null};
    }
    if(auditSnap.exists||indexSnap.exists)
      throw Error('Invitation identifier or token already reserved. Use a new request ID.');
    if(campaign.joinPolicy?.joinRequestsOpen===false)
      throw Error('The campaign is not accepting new invitations.');
    const throttle=dayLimit(throttleSnap.exists?throttleSnap.data():null,time);
    const boundUid=resolveBoundRecipient?
      await resolveBoundRecipient(tx,{campaignId,actorUid,now}):uid;
    if(resolveBoundRecipient&&(!validId(boundUid)||boundUid===actorUid))
      throw Error('Invitation recipient unavailable.');
    const recordValue={
      inviteId,campaignId,type,roleOffered,status:'active',
      tokenDigest:digest,
      recipientEmailNormalized:email,recipientUid:boundUid,
      createdByUid:actorUid,createdAt:now,
      expiresAt:new Date(time+expiresInHours*HOUR),
      maxUses,usedCount:0,requiresGMApproval:true,
      lastSentAt:null,deliveryStatus:null,revision:1
    };
    tx.create(invitationRef,recordValue);
    tx.create(indexRef,{inviteId,campaignId,createdAt:now});
    tx.set(throttleRef,throttle);
    tx.create(auditRef,{
      eventId:'secure-invite-'+inviteId,campaignId,
      actorUid,category:'secure-invitation',action:'issued',createdAt:now,
      metadata:{inviteId,type,roleOffered,maxUses,expiresAt:recordValue.expiresAt}
    });
    return {...safeSummary(recordValue,false),token};
  });
}

/**
 * For Phase 6.3's future server-side, transactionally validated redemption.
 * This is NOT membership authorization or a claim operation; it neither
 * increments usedCount nor writes. A claim must recheck all state atomically,
 * including current membership, join policy, and per-account receipts.
 */
export function assertSecureInvitationEligible(invite,{
  campaignId,inviteId,token,claimantUid,claimantEmail=null,
  emailVerified=false,now=new Date(),signingKey
}={}){
  if(!record(invite)||!validId(campaignId)||!DIGEST.test(inviteId)||
    !TOKEN.test(token)||!validId(claimantUid)||
    invite.campaignId!==campaignId||invite.inviteId!==inviteId||
    invite.status!=='active'||!DIGEST.test(invite.tokenDigest)||
    !['email','share-link'].includes(invite.type)||
    !['player','co-gm'].includes(invite.roleOffered)||
    invite.requiresGMApproval!==true||
    !Number.isSafeInteger(invite.maxUses)||invite.maxUses<1||
    invite.maxUses>MAX_USES||
    !Number.isSafeInteger(invite.usedCount)||invite.usedCount<0||
    invite.usedCount>=invite.maxUses)
    throw invalid();
  const current=dateValue(now),expires=dateValue(invite.expiresAt);
  if(!Number.isFinite(current.getTime())||
    !Number.isFinite(expires.getTime())||current>=expires)
    throw invalid();
  const calculated=Buffer.from(tokenDigest(signingKey,campaignId,inviteId,token),'hex');
  const stored=Buffer.from(invite.tokenDigest,'hex');
  if(!timingSafeEqual(calculated,stored))throw invalid();
  if(invite.recipientUid!=null&&invite.recipientUid!==claimantUid)throw invalid();
  if(invite.type==='email'){
    if(typeof invite.recipientEmailNormalized!=='string'||!emailVerified||
      typeof claimantEmail!=='string')throw invalid();
    let candidate;
    try{candidate=normalizedInviteEmail(claimantEmail);}catch{throw invalid();}
    if(candidate!==invite.recipientEmailNormalized)throw invalid();
  }else if(invite.recipientEmailNormalized!==null&&
    invite.recipientEmailNormalized!==undefined)throw invalid();
  return {
    campaignId,inviteId,roleOffered:invite.roleOffered,
    requiresGMApproval:true,maxUses:invite.maxUses,usedCount:invite.usedCount
  };
}
