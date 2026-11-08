import {campaignPlayerCapacity,countActivePlayers} from './campaignJoinApproval.mjs';

const ID=/^[A-Za-z0-9_-]{1,160}$/;
export const DELEGATED_GM_CAPABILITIES=Object.freeze(['review-join-requests','moderate-members']);
const validId=value=>typeof value==='string'&&ID.test(value);
const validRevision=value=>Number.isSafeInteger(value)&&value>=1;
const record=value=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value);

function validCampaign(campaign,campaignId){
  return record(campaign)&&campaign.membershipSchemaVersion===2&&
    validId(campaign.ownerUid)&&(!campaign.id||campaign.id===campaignId);
}
function validateMember(member,uid,campaignId){
  return record(member)&&member.uid===uid&&member.campaignId===campaignId&&
    ['player','co-gm'].includes(member.role)&&
    ['active','suspended','removed','banned'].includes(member.status)&&validRevision(member.revision);
}
function projectionMatches(projection,member,campaignId){
  return record(projection)&&projection.campaignId===campaignId&&
    projection.role===member.role&&projection.status===member.status;
}
function nextCampaignRevision(campaign){
  return Number.isSafeInteger(campaign.membershipRevision)&&campaign.membershipRevision>=0
    ?campaign.membershipRevision+1:1;
}
function ensureOwner(campaign,ownerUid,memberUid){
  if(campaign.ownerUid!==ownerUid)throw new Error('Only the campaign owner may manage roles and permissions.');
  if(ownerUid===memberUid)throw new Error('The campaign owner cannot change their own role.');
}
async function roleTransaction(db,ownerUid,request,options,action){
  const {campaignId,memberUid,expectedRevision,expectedRole,expectedStatus}=request;
  if(!validId(ownerUid)||!validId(campaignId)||!validId(memberUid)||
    !validRevision(expectedRevision)||!['player','co-gm'].includes(expectedRole)||
    expectedStatus!=='active')throw new Error('Invalid campaign role or permission change.');
  const now=options.now instanceof Date&&Number.isFinite(options.now.getTime())?options.now:new Date();
  return db.runTransaction(async tx=>{
    const campaignRef=db.doc('campaigns/'+campaignId);
    const campaignSnap=await tx.get(campaignRef);
    if(!campaignSnap.exists)throw new Error('Campaign not found.');
    const campaign=campaignSnap.data();
    if(!validCampaign(campaign,campaignId))throw new Error('Role management requires an upgraded campaign.');
    ensureOwner(campaign,ownerUid,memberUid);

    const memberRef=db.doc('campaigns/'+campaignId+'/members/'+memberUid);
    const projectionRef=db.doc('campaignMemberProjections/'+memberUid+'/campaigns/'+campaignId);
    const [memberSnap,projectionSnap]=await Promise.all([tx.get(memberRef),tx.get(projectionRef)]);
    if(!memberSnap.exists||!projectionSnap.exists)throw new Error('Membership or account projection needs reconciliation.');
    const member=memberSnap.data(),projection=projectionSnap.data();
    if(!validateMember(member,memberUid,campaignId)||!projectionMatches(projection,member,campaignId))
      throw new Error('Member identity or projection needs reconciliation.');
    return action({tx,db,now,campaign,member,projection,memberRef,projectionRef,campaignRef,
      campaignId,memberUid,ownerUid,expectedRevision,expectedRole,expectedStatus});
  });
}

/** Owner-only role changes: never transfer ownership or reactivate inactive members. */
export async function changeCampaignMemberRole(db,ownerUid,
  {campaignId,memberUid,newRole,expectedRevision,expectedRole,expectedStatus}={},options={}){
  if(!['player','co-gm'].includes(newRole)||newRole===expectedRole)
    throw new Error('Choose a different Player or Co-GM role.');
  return roleTransaction(db,ownerUid,
    {campaignId,memberUid,expectedRevision,expectedRole,expectedStatus},options,
    async state=>{
      const {tx,db,now,campaign,member,projectionRef,memberRef,campaignRef}=state;
      if(member.status!=='active')throw new Error('Inactive members must be restored before role changes.');
      if(member.revision===expectedRevision+1&&member.role===newRole&&
        member.lastRoleChangedByUid===ownerUid&&member.lastRoleFrom===expectedRole)
        return {campaignId,uid:memberUid,role:newRole,revision:member.revision,alreadyApplied:true};
      if(member.revision!==expectedRevision||member.role!==expectedRole)
        throw new Error('Member role changed. Refresh the roster before continuing.');
      // Demoting an active co-GM adds one Player: never exceed campaign capacity.
      if(newRole==='player'){
        const count=await countActivePlayers(tx,db,campaignId);
        if(count>=campaignPlayerCapacity(campaign))
          throw new Error('Campaign player capacity has been reached. Demotion is blocked.');
      }
      const nextRevision=member.revision+1;
      const historyRef=db.doc('campaigns/'+campaignId+'/membershipRoleEvents/'+memberUid+'-'+nextRevision);
      tx.update(memberRef,{
        role:newRole,capabilityOverrides:{},revision:nextRevision,updatedAt:now,
        lastRoleFrom:member.role,lastRoleChangedByUid:ownerUid
      });
      tx.update(projectionRef,{role:newRole,updatedAt:now});
      tx.update(campaignRef,{membershipRevision:nextCampaignRevision(campaign)});
      tx.create(historyRef,{
        campaignId,uid:memberUid,actorUid:ownerUid,kind:'role',
        fromRole:member.role,toRole:newRole,revision:nextRevision,at:now
      });
      return {campaignId,uid:memberUid,role:newRole,revision:nextRevision,alreadyApplied:false};
    });
}

/** Per-capability owner delegation. Only active canonical Co-GMs are eligible. */
export async function setCampaignCoGmPermission(db,ownerUid,
  {campaignId,memberUid,capability,enabled,expectedRevision,expectedRole,expectedStatus}={},options={}){
  if(!DELEGATED_GM_CAPABILITIES.includes(capability)||typeof enabled!=='boolean'||
    expectedRole!=='co-gm')throw new Error('Invalid delegated Co-GM permission.');
  return roleTransaction(db,ownerUid,
    {campaignId,memberUid,expectedRevision,expectedRole,expectedStatus},options,
    async state=>{
      const {tx,db,now,campaign,member,memberRef,campaignRef}=state;
      if(member.status!=='active'||member.role!=='co-gm')
        throw new Error('Only active Co-GMs may receive delegated permissions.');
      const current=record(member.capabilityOverrides)?member.capabilityOverrides:{};
      if(member.revision===expectedRevision+1&&
        current[capability]===enabled&&member.lastCapability===capability&&
        member.lastCapabilityChangedByUid===ownerUid)
        return {campaignId,uid:memberUid,capability,enabled,revision:member.revision,alreadyApplied:true};
      if(member.revision!==expectedRevision)
        throw new Error('Co-GM permissions changed. Refresh the roster before continuing.');
      if(Boolean(current[capability])===enabled)
        return {campaignId,uid:memberUid,capability,enabled,revision:member.revision,unchanged:true};
      const nextRevision=member.revision+1;
      const historyRef=db.doc('campaigns/'+campaignId+'/membershipRoleEvents/'+memberUid+'-'+nextRevision);
      tx.update(memberRef,{
        capabilityOverrides:{...current,[capability]:enabled},
        revision:nextRevision,updatedAt:now,
        lastCapability:capability,lastCapabilityChangedByUid:ownerUid
      });
      tx.update(campaignRef,{membershipRevision:nextCampaignRevision(campaign)});
      tx.create(historyRef,{
        campaignId,uid:memberUid,actorUid:ownerUid,kind:'permission',
        role:'co-gm',capability,previousEnabled:Boolean(current[capability]),
        enabled,revision:nextRevision,at:now
      });
      return {campaignId,uid:memberUid,capability,enabled,revision:nextRevision,alreadyApplied:false};
    });
}

const stamp=value=>{
  if(!value)return null;
  const v=typeof value.toDate==='function'?value.toDate():value instanceof Date?value:new Date(value);
  return v instanceof Date&&Number.isFinite(v.getTime())?v.toISOString():null;
};
/** Read-only, authenticated owner/active Co-GM timeline, capped per source. */
export async function listCampaignMembershipActivity(db,actorUid,campaignId){
  if(!validId(actorUid)||!validId(campaignId))throw new Error('Sign in as a campaign GM.');
  const campaignSnap=await db.doc('campaigns/'+campaignId).get();
  if(!campaignSnap.exists)throw new Error('Campaign not found.');
  const campaign=campaignSnap.data();
  if(!validCampaign(campaign,campaignId))throw new Error('Activity history requires a v2 campaign.');
  if(actorUid!==campaign.ownerUid){
    const gmSnap=await db.doc('campaigns/'+campaignId+'/members/'+actorUid).get();
    const member=gmSnap.exists?gmSnap.data():null;
    if(!member||member.uid!==actorUid||member.campaignId!==campaignId||
      member.role!=='co-gm'||member.status!=='active')
      throw new Error('Only an active campaign GM may view activity history.');
  }
  const LIMIT=40;
  const sources=[
    ['role',db.collection('campaigns/'+campaignId+'/membershipRoleEvents').orderBy('at','desc').limit(LIMIT)],
    ['moderation',db.collection('campaigns/'+campaignId+'/memberModerationEvents').orderBy('createdAt','desc').limit(LIMIT)],
    ['join',db.collection('campaigns/'+campaignId+'/joinReviewHistory').orderBy('at','desc').limit(LIMIT)]
  ];
  const results=await Promise.all(sources.map(async([type,query])=>({type,result:await query.get()})));
  const events=[];
  for(const {type,result} of results)for(const doc of result.docs){
    const v=doc.data();
    if(!record(v)||v.campaignId!==campaignId||!validId(v.uid)||!validId(v.actorUid))continue;
    if(type==='role'){
      if(v.kind==='role'&&['player','co-gm'].includes(v.fromRole)&&['player','co-gm'].includes(v.toRole))
        events.push({type:'role',uid:v.uid,actorUid:v.actorUid,at:stamp(v.at),detail:v.fromRole+' → '+v.toRole});
      else if(v.kind==='permission'&&DELEGATED_GM_CAPABILITIES.includes(v.capability)&&typeof v.enabled==='boolean')
        events.push({type:'permission',uid:v.uid,actorUid:v.actorUid,at:stamp(v.at),
          detail:v.capability+': '+(v.enabled?'enabled':'disabled')});
    }else if(type==='moderation'){
      if(!['suspend','restore','remove','ban'].includes(v.action))continue;
      events.push({type:'moderation',uid:v.uid,actorUid:v.actorUid,at:stamp(v.createdAt),
        detail:v.action+': '+String(v.fromStatus||'')+' → '+String(v.toStatus||''),
        reason:typeof v.reason==='string'?v.reason.slice(0,240):null});
    }else if(['approve','decline'].includes(v.decision)){
      events.push({type:'join',uid:v.uid,actorUid:v.actorUid,at:stamp(v.at),detail:v.decision});
    }
  }
  events.sort((a,b)=>(b.at||'').localeCompare(a.at||'')||a.uid.localeCompare(b.uid));
  return {campaignId,events:events.slice(0,40),
    limited:results.some(x=>x.result.size===LIMIT)||events.length>40};
}
