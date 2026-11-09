import {memberDocument} from './campaignMembership.mjs';
import {enqueueCampaignNotification} from './campaignNotifications.mjs';

const ID=/^[A-Za-z0-9_-]{1,160}$/;
const MAX_REVIEW_ROWS=100;
const validId=value=>typeof value==='string' && ID.test(value);
const plainObject=value=>Boolean(value) && typeof value==='object' && !Array.isArray(value);

export function campaignPlayerCapacity(campaign) {
  // Campaign Forge uses partySize; GM Campaign Manager saves playerLimit.
  // Never silently accept a non-positive or unbounded cap.
  for(const candidate of [campaign?.playerLimit,campaign?.partySize,campaign?.settings?.partySize]){
    if(candidate===undefined || candidate===null || candidate==='') continue;
    const n=Number(candidate);
    if(Number.isSafeInteger(n) && n>=1 && n<=50) return n;
    throw new Error('Campaign player limit is invalid. Ask the owner to review the settings.');
  }
  return 12;
}
function safeReview(row){
  const value=row.data();
  return {
    uid:row.id,
    campaignId:value.campaignId,
    status:value.status,
    requestedCharacterId:value.requestedCharacterId || null,
    requestedAt:value.requestedAt?.toDate?.()?.toISOString?.() ||
      (value.requestedAt instanceof Date ? value.requestedAt.toISOString() : String(value.requestedAt || '')),
    revision:value.revision
  };
}
function authorizedReviewer(campaign,campaignId,uid,membership){
  if(campaign?.ownerUid===uid) return true;
  return membership?.uid===uid &&
    membership?.campaignId===campaignId &&
    membership?.status==='active' && membership?.role==='co-gm' &&
    membership?.capabilityOverrides?.['review-join-requests']===true;
}
function validateCampaign(campaign,campaignId){
  if(!plainObject(campaign) || campaign.membershipSchemaVersion!==2 ||
     !validId(campaign.ownerUid)) throw new Error('Campaign approval is unavailable.');
  if(campaign.id && campaign.id!==campaignId) throw new Error('Campaign identity mismatch.');
}
/** Query all ACTIVE members. Counting only player roles keeps owner/co-GM out of the player cap. */
export async function countActivePlayers(tx,db,campaignId){
  const rows=await tx.get(db.collection('campaigns/'+campaignId+'/members').where('status','==','active'));
  let count=0;
  for(const row of rows.docs || []){
    const m=row.data();
    if(m.status==='active' && m.role==='player') count++;
  }
  return count;
}
/** All Firestore reads occur before apply() mutates the transaction. */
export async function preparePlayerApproval(tx,db,campaignId,uid,campaign,now,actorUid=null){
  const capacity=campaignPlayerCapacity(campaign);
  const projectionRef=db.doc('campaignMemberProjections/'+uid+'/campaigns/'+campaignId);
  const [projection,activePlayers]=await Promise.all([
    tx.get(projectionRef),countActivePlayers(tx,db,campaignId)
  ]);
  if(projection.exists) throw new Error('Existing account access requires membership review.');
  return {
    capacity,activePlayers,available:activePlayers<capacity,
    apply(){
      const memberRef=db.doc('campaigns/'+campaignId+'/members/'+uid);
      const member=memberDocument({campaignId,uid,role:'player',origin:'join-request'},now);
      member.approvedByUid=actorUid;
      tx.create(memberRef,member);
      tx.create(projectionRef,{
        campaignId,role:'player',status:'active',
        displayNameSnapshot:String(campaign.name||'Campaign').slice(0,120),
        updatedAt:now
      });
      const previous=Number.isSafeInteger(campaign.membershipRevision) && campaign.membershipRevision>=0
        ? campaign.membershipRevision : 0;
      // Shared campaign write makes parallel approvals conflict and retry capacity checks.
      tx.update(db.doc('campaigns/'+campaignId),{membershipRevision:previous+1});
    }
  };
}

export async function listPendingCampaignJoinRequests(db,actorUid,campaignId,{autoAvailable=false}={}){
  if(!validId(actorUid)||!validId(campaignId)) throw new Error('Sign in as a campaign GM.');
  const campaignSnap=await db.doc('campaigns/'+campaignId).get();
  if(!campaignSnap.exists) throw new Error('Campaign not found.');
  const campaign=campaignSnap.data();
  validateCampaign(campaign,campaignId);
  const membership=actorUid===campaign.ownerUid ? null :
    (await db.doc('campaigns/'+campaignId+'/members/'+actorUid).get()).data();
  if(!authorizedReviewer(campaign,campaignId,actorUid,membership)) throw new Error('Only an authorised GM may review join requests.');
  const [pending,active]=await Promise.all([
    db.collection('campaigns/'+campaignId+'/joinRequests').where('status','==','pending').limit(MAX_REVIEW_ROWS).get(),
    db.collection('campaigns/'+campaignId+'/members').where('status','==','active').get()
  ]);
  const requests=pending.docs.map(safeReview).filter(x=>x.campaignId===campaignId && validId(x.uid))
    .sort((a,b)=>String(a.requestedAt).localeCompare(String(b.requestedAt)));
  const activePlayers=active.docs.filter(row=>row.data().role==='player').length;
  return {
    campaignId,requests,activePlayers,capacity:campaignPlayerCapacity(campaign),
    approvalMode:campaign.joinPolicy?.autoApprove===true?'automatic':'manual',
    autoAvailable:actorUid===campaign.ownerUid && autoAvailable,
    canSetMode:actorUid===campaign.ownerUid,
    truncated:pending.size===MAX_REVIEW_ROWS
  };
}

/**
 * Only a validated owner or explicitly delegated active co-GM can approve.
 * Approval and denial are idempotent; declined requests never create access.
 * A separate immutable decision event is stored for future GM audit history.
 */
export async function reviewCampaignJoinRequest(db,actorUid,
  {campaignId,requestUid,decision,expectedRevision}={},options={}){
  if(!validId(actorUid)||!validId(campaignId)||!validId(requestUid) ||
    !['approve','decline'].includes(decision) ||
    !Number.isSafeInteger(expectedRevision) || expectedRevision<1) throw new Error('Invalid review request.');
  const now=options.now instanceof Date && Number.isFinite(options.now.getTime())?options.now:new Date();
  return db.runTransaction(async tx=>{
    const campaignRef=db.doc('campaigns/'+campaignId);
    const campaignSnap=await tx.get(campaignRef);
    if(!campaignSnap.exists) throw new Error('Campaign not found.');
    const campaign=campaignSnap.data();
    validateCampaign(campaign,campaignId);
    const reviewerRef=db.doc('campaigns/'+campaignId+'/members/'+actorUid);
    const requestRef=db.doc('campaigns/'+campaignId+'/joinRequests/'+requestUid);
    const memberRef=db.doc('campaigns/'+campaignId+'/members/'+requestUid);
    const auditRef=db.doc('campaigns/'+campaignId+'/joinReviewHistory/'+requestUid);
    const [gmSnap,requestSnap,memberSnap,auditSnap]=await Promise.all([
      actorUid===campaign.ownerUid?Promise.resolve(null):tx.get(reviewerRef),
      tx.get(requestRef),tx.get(memberRef),tx.get(auditRef)
    ]);
    const reviewer=gmSnap?.exists?gmSnap.data():null;
    if(!authorizedReviewer(campaign,campaignId,actorUid,reviewer)) throw new Error('Only an authorised GM may review join requests.');
    if(requestUid===campaign.ownerUid) throw new Error('The owner cannot request player access.');
    if(!requestSnap.exists) throw new Error('Join request not found.');
    const request=requestSnap.data();
    if(request.uid!==requestUid || request.campaignId!==campaignId ||
      !Number.isSafeInteger(request.revision) || request.revision<1) throw new Error('Join request identity requires review.');
    if(request.status!=='pending') {
      if(request.status === (decision==='approve'?'approved':'declined')) {
        return {campaignId,uid:requestUid,status:request.status,alreadyReviewed:true};
      }
      throw new Error('Join request was already resolved.');
    }
    if(request.revision!==expectedRevision) throw new Error('Join request changed. Refresh before reviewing.');
    if(memberSnap.exists) throw new Error('Existing membership must be reviewed before approval.');
    if(auditSnap.exists) throw new Error('Join decision history requires review.');
    let prepared=null;
    if(decision==='approve'){
      prepared=await preparePlayerApproval(tx,db,campaignId,requestUid,campaign,now,actorUid);
      if(!prepared.available) throw new Error('Campaign player capacity has been reached.');
    }
    // From this point forward writes only (no more Firestore reads).
    if(prepared) prepared.apply();
    const status=decision==='approve'?'approved':'declined';
    tx.update(requestRef,{
      status,reviewedByUid:actorUid,reviewedAt:now,
      updatedAt:now,revision:request.revision+1,reviewMode:'manual'
    });
    if(options.notificationsEnabled===true){
      enqueueCampaignNotification(tx,db,requestUid,{
        campaignId,campaignName:campaign.name,
        kind:status==='approved'?'join-approved':'join-declined',
        eventKey:'join-decision:'+campaignId+':'+requestUid
      },now);
    }
    tx.create(auditRef,{
      campaignId,uid:requestUid,decision,status,actorUid,mode:'manual',
      requestedCharacterId:request.requestedCharacterId||null,at:now
    });
    return {campaignId,uid:requestUid,status,alreadyReviewed:false};
  });
}

/** Only campaign owner may opt into automatic approval. Default is manual. */
export async function setCampaignJoinApprovalMode(db,ownerUid,campaignId,mode,
  {autoAvailable=false,now=new Date()}={}){
  if(!validId(ownerUid)||!validId(campaignId)||!['manual','automatic'].includes(mode))
    throw new Error('Invalid campaign approval setting.');
  if(mode==='automatic'&&!autoAvailable) throw new Error('Automatic approval is not enabled on the backend.');
  return db.runTransaction(async tx=>{
    const ref=db.doc('campaigns/'+campaignId);
    const snapshot=await tx.get(ref);
    if(!snapshot.exists) throw new Error('Campaign not found.');
    const campaign=snapshot.data();
    validateCampaign(campaign,campaignId);
    if(campaign.ownerUid!==ownerUid) throw new Error('Only the campaign owner may change approval mode.');
    const policy=plainObject(campaign.joinPolicy)?campaign.joinPolicy:{};
    tx.update(ref,{joinPolicy:{...policy,autoApprove:mode==='automatic'},joinPolicyUpdatedAt:now});
    return {campaignId,approvalMode:mode};
  });
}
