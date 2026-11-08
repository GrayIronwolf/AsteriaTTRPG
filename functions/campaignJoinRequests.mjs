import {validUCN} from './campaignUCN.mjs';
import {JOIN_REQUEST_STATUSES, MEMBER_STATUSES} from './campaignMembership.mjs';

// A UCN locates a campaign. It is NOT a secret invitation or membership grant.
// Server-controlled request documents are deterministic per account and campaign.
const ID=/^[A-Za-z0-9_-]{1,160}$/;
const MAX_NEW_REQUESTS_PER_DAY=10;
const DAY_MS=24*60*60*1000;

function validId(value){return typeof value==='string' && ID.test(value);}
function ownRequestSummary(campaignId,request,alreadyExists=false){
  return {
    campaignId,
    status:request.status,
    requestedCharacterId:request.requestedCharacterId || null,
    alreadyExists
  };
}

/**
 * Phase 3.2: create/read a pending request without changing access rights.
 * Caller UID comes exclusively from Firebase Auth, never the browser payload.
 *
 * 'status' makes no writes. 'submit' creates at most one request per user and
 * campaign. All reads precede writes to satisfy Firestore transaction rules.
 * An existing pending/terminal record is never overwritten or resurrected.
 */
export async function campaignJoinRequest(db,uid,{action,campaignId,ucn,characterId=null}={},options={}){
  if(!validId(uid)) throw new Error('Sign in to request campaign access.');
  if(!validId(campaignId) || !validUCN(ucn)) throw new Error('Verify the campaign number again.');
  if(!['status','submit'].includes(action)) throw new Error('Invalid join request action.');
  if(action==='submit' && characterId!==null && characterId!==undefined &&
     (typeof characterId!=='string' || !validId(characterId))) throw new Error('Choose a valid owned character.');
  const now=options.now instanceof Date && Number.isFinite(options.now.getTime())?options.now:new Date();
  const campaignRef=db.doc('campaigns/'+campaignId);
  const requestRef=db.doc('campaigns/'+campaignId+'/joinRequests/'+uid);
  const memberRef=db.doc('campaigns/'+campaignId+'/members/'+uid);
  const charRef=action==='submit' && characterId ? db.doc('users/'+uid+'/characters/'+characterId) : null;
  const throttleRef=action==='submit' ? db.doc('campaignJoinRequestThrottle/'+uid) : null;

  return db.runTransaction(async tx=>{
    const [campaignSnap,memberSnap,requestSnap]=await Promise.all([
      tx.get(campaignRef),tx.get(memberRef),tx.get(requestRef)
    ]);
    if(!campaignSnap.exists) throw new Error('Campaign is unavailable for join requests.');
    const campaign=campaignSnap.data();
    if(campaign.membershipSchemaVersion!==2 || campaign.ucn!==ucn ||
      !validId(campaign.ownerUid)) throw new Error('Campaign is unavailable for join requests.');
    if(uid===campaign.ownerUid) return {campaignId,status:'member',requestedCharacterId:null,alreadyExists:true};

    if(memberSnap.exists){
      const member=memberSnap.data();
      if(member.uid!==uid || member.campaignId!==campaignId ||
        !MEMBER_STATUSES.includes(member.status) ||
        !['player','co-gm','owner'].includes(member.role)) throw new Error('Campaign membership needs review.');
      if(member.status==='active') return {campaignId,status:'member',requestedCharacterId:null,alreadyExists:true};
      // No request may reinstate a banned, removed or suspended member.
      return {campaignId,status:'blocked',requestedCharacterId:null,alreadyExists:true};
    }
    if(requestSnap.exists){
      const request=requestSnap.data();
      if(request.uid!==uid || request.campaignId!==campaignId ||
        !JOIN_REQUEST_STATUSES.includes(request.status)) throw new Error('Existing join request needs review.');
      return ownRequestSummary(campaignId,request,true);
    }
    if(action==='status') return {campaignId,status:'none',requestedCharacterId:null,alreadyExists:false};

    let charSnap=null,throttleSnap=null;
    if(charRef) charSnap=await tx.get(charRef);
    if(throttleRef) throttleSnap=await tx.get(throttleRef);
    if(charRef && (!charSnap.exists || charSnap.data()?.ownerUid!==uid ||
      (charSnap.data()?.id!==undefined && charSnap.data().id!==characterId))) {
      throw new Error('The selected character is not owned by this account.');
    }
    const previous=throttleSnap?.exists ? throttleSnap.data() : {};
    const windowStart=Number.isFinite(previous.windowStartedAtMs)?previous.windowStartedAtMs:0;
    const nowMs=now.getTime();
    const insideWindow=nowMs>=windowStart && nowMs-windowStart<DAY_MS;
    const created=insideWindow ? Number(previous.created || 0) : 0;
    if(created>=MAX_NEW_REQUESTS_PER_DAY) throw new Error('Daily join request limit reached. Please try again later.');

    const record={
      uid,campaignId,status:'pending',
      requestedCharacterId:charRef ? characterId : null,
      requestedAt:now,updatedAt:now,
      source:'ucn',revision:1,
      reviewedByUid:null,reviewedAt:null
    };
    tx.create(requestRef,record);
    tx.set(throttleRef,{
      windowStartedAtMs:insideWindow?windowStart:nowMs,
      created:created+1,updatedAtMs:nowMs
    });
    return ownRequestSummary(campaignId,record,false);
  });
}
