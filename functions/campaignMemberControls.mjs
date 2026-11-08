import {MEMBER_STATUSES} from './campaignMembership.mjs';
import {campaignPlayerCapacity,countActivePlayers} from './campaignJoinApproval.mjs';

// All status mutations are v2/Admin SDK only. Legacy UID lists are retained
// as historical data, never changed to grant/revoke v2 access.
const ID=/^[A-Za-z0-9_-]{1,160}$/;
const ACTIONS=Object.freeze(['suspend','restore','remove','ban']);
const validId=value=>typeof value==='string'&&ID.test(value);
const hasStatus=value=>MEMBER_STATUSES.includes(value);
const nextStatus=(action,status)=>({
  suspend:{active:'suspended'},
  restore:{suspended:'active',removed:'active',banned:'active'},
  remove:{active:'removed',suspended:'removed'},
  ban:{active:'banned',suspended:'banned',removed:'banned'}
})[action]?.[status]||null;

export function allowedMemberControls(campaign,actorUid,actorMember,targetMember){
  if(!campaign||campaign.membershipSchemaVersion!==2||
    !validId(actorUid)||!targetMember||!validId(targetMember.uid)||
    targetMember.uid===campaign.ownerUid||targetMember.uid===actorUid||
    !['player','co-gm'].includes(targetMember.role)||!hasStatus(targetMember.status)||
    !Number.isSafeInteger(targetMember.revision)||targetMember.revision<1)return [];
  const owner=campaign.ownerUid===actorUid;
  const delegated=!owner&&actorMember?.uid===actorUid&&
    actorMember?.campaignId===targetMember.campaignId&&
    actorMember?.role==='co-gm'&&actorMember?.status==='active'&&
    actorMember?.capabilityOverrides?.['moderate-members']===true;
  if(!owner&&!delegated)return [];
  if(!owner&&targetMember.role!=='player')return [];
  return ACTIONS.filter(action=>{
    if(!owner&&(action==='ban'||(action==='restore'&&targetMember.status==='banned')))return false;
    return nextStatus(action,targetMember.status)!==null;
  });
}

/**
 * Server-authorized atomic membership control. Changing member status and
 * account discovery projection together is the revocation boundary: Firestore
 * rules, Storage rules and trusted Functions all require 'active'.
 *
 * Character source, campaign character, XP and inventory are never modified.
 */
export async function moderateCampaignMember(db,actorUid,
  {campaignId,memberUid,action,expectedRevision,expectedStatus,reason=''}={},options={}){
  if(!validId(actorUid)||!validId(campaignId)||!validId(memberUid)||
    !ACTIONS.includes(action)||!Number.isSafeInteger(expectedRevision)||
    expectedRevision<1||!hasStatus(expectedStatus)||typeof reason!=='string')
    throw new Error('Invalid campaign membership change.');
  const why=reason.trim();
  if(why.length>240 || ((action==='ban'||action==='remove')&&why.length<4))
    throw new Error('Provide a reason of 4–240 characters for Remove or Ban.');
  const now=options.now instanceof Date&&Number.isFinite(options.now.getTime())?options.now:new Date();
  return db.runTransaction(async tx=>{
    const campaignRef=db.doc('campaigns/'+campaignId);
    const campaignSnap=await tx.get(campaignRef);
    if(!campaignSnap.exists)throw new Error('Campaign not found.');
    const campaign=campaignSnap.data();
    if(campaign?.membershipSchemaVersion!==2||
      !validId(campaign.ownerUid)||(campaign.id&&campaign.id!==campaignId))
      throw new Error('Member controls require an upgraded campaign.');
    if(memberUid===campaign.ownerUid||memberUid===actorUid)
      throw new Error('Campaign owners and self-moderation are protected.');

    const targetRef=db.doc('campaigns/'+campaignId+'/members/'+memberUid);
    const projectionRef=db.doc('campaignMemberProjections/'+memberUid+'/campaigns/'+campaignId);
    const actorRef=db.doc('campaigns/'+campaignId+'/members/'+actorUid);
    const [targetSnap,projectionSnap,actorSnap]=await Promise.all([
      tx.get(targetRef),tx.get(projectionRef),
      actorUid===campaign.ownerUid?Promise.resolve(null):tx.get(actorRef)
    ]);
    if(!targetSnap.exists||!projectionSnap.exists)throw new Error('Membership or account projection needs reconciliation.');
    const target=targetSnap.data(),projection=projectionSnap.data();
    const actorMember=actorSnap?.exists?actorSnap.data():null;
    if(target.uid!==memberUid||target.campaignId!==campaignId||
      !['player','co-gm'].includes(target.role)||!hasStatus(target.status)||
      !Number.isSafeInteger(target.revision)||target.revision<1)
      throw new Error('Member identity or revision requires review.');
    if(projection.campaignId!==campaignId||projection.role!==target.role||
      projection.status!==target.status)
      throw new Error('Account discovery status is out of sync with membership.');

    const desired=nextStatus(action,expectedStatus);
    if(!desired)throw new Error('This member status cannot be changed using that action.');
    const permitted=allowedMemberControls(campaign,actorUid,actorMember,target);
    if(!permitted.includes(action))throw new Error('Only an authorised GM may perform this member action.');
    if(target.revision===expectedRevision+1&&target.status===desired&&
       target.lastStatusAction===action&&target.lastStatusChangedByUid===actorUid)
      return {campaignId,uid:memberUid,status:target.status,revision:target.revision,alreadyApplied:true};
    if(target.revision!==expectedRevision||target.status!==expectedStatus)
      throw new Error('Member status changed. Refresh the roster before continuing.');

    if(action==='restore'&&target.role==='player'){
      const count=await countActivePlayers(tx,db,campaignId);
      if(count>=campaignPlayerCapacity(campaign))
        throw new Error('Campaign player capacity has been reached. Restore is blocked.');
    }
    const nextRevision=target.revision+1;
    const auditRef=db.doc('campaigns/'+campaignId+'/memberModerationEvents/'+memberUid+'-'+nextRevision);
    // All reads have completed. Do not delete members, projections or character data.
    tx.update(targetRef,{
      status:desired,revision:nextRevision,updatedAt:now,
      lastStatusAction:action,lastStatusChangedByUid:actorUid,
      lastStatusReason:why||null
    });
    tx.update(projectionRef,{status:desired,updatedAt:now});
    tx.update(campaignRef,{membershipRevision:
      (Number.isSafeInteger(campaign.membershipRevision)&&campaign.membershipRevision>=0
        ?campaign.membershipRevision:0)+1});
    tx.create(auditRef,{
      campaignId,uid:memberUid,actorUid,action,
      fromStatus:target.status,toStatus:desired,memberRole:target.role,
      revision:nextRevision,reason:why||null,createdAt:now
    });
    return {campaignId,uid:memberUid,status:desired,revision:nextRevision,alreadyApplied:false};
  });
}
