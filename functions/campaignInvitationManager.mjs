// Phase 6.2: owner-only invitation manager. Never return token digests or
// raw tokens. Actual acceptance and membership writes belong to Phase 6.3.
const ID=/^[A-Za-z0-9_-]{1,160}$/;
const INVITE_ID=/^[a-f0-9]{64}$/;
const STATUSES=new Set(['draft','active','revoked','expired','exhausted']);
const PAGE_SIZE=25;
const validId=value=>typeof value==='string'&&ID.test(value);
const object=value=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
const validRevision=value=>Number.isSafeInteger(value)&&value>=1;
const validDate=value=>{
  const date=value instanceof Date?value:
    typeof value?.toDate==='function'?value.toDate():new Date(value);
  return date instanceof Date&&Number.isFinite(date.getTime())?date:null;
};
function assertOwner(campaign,actorUid,campaignId){
  if(!object(campaign)||campaign.membershipSchemaVersion!==2||
    campaign.ownerUid!==actorUid||!validId(campaign.ownerUid)||
    (campaign.id&&campaign.id!==campaignId))
    throw Error('Only the owner of an upgraded campaign may manage invitations.');
}
function assertInvite(invite,campaignId,inviteId,ownerUid){
  if(!object(invite)||invite.inviteId!==inviteId||
    invite.campaignId!==campaignId||invite.createdByUid!==ownerUid||
    !INVITE_ID.test(inviteId)||!INVITE_ID.test(invite.tokenDigest)||
    !STATUSES.has(invite.status)||!validRevision(invite.revision)||
    !['email','share-link'].includes(invite.type)||
    !['player','co-gm'].includes(invite.roleOffered)||
    invite.requiresGMApproval!==true||
    !Number.isSafeInteger(invite.maxUses)||invite.maxUses<1||invite.maxUses>25||
    !Number.isSafeInteger(invite.usedCount)||invite.usedCount<0||
    invite.usedCount>invite.maxUses||
    !validDate(invite.createdAt)||!validDate(invite.expiresAt))
    throw Error('Invitation record requires reconciliation.');
  if(invite.recipientEmailNormalized!=null&&
    (invite.type!=='email'||typeof invite.recipientEmailNormalized!=='string'))
    throw Error('Invitation recipient restrictions require reconciliation.');
}
function effectiveStatus(invite,at){
  if(invite.status!=='active')return invite.status;
  if(validDate(invite.expiresAt).getTime()<=at.getTime())return 'expired';
  if(invite.usedCount>=invite.maxUses)return 'exhausted';
  return 'active';
}
function safeMetadata(invite,now){
  return {
    inviteId:invite.inviteId,campaignId:invite.campaignId,
    type:invite.type,roleOffered:invite.roleOffered,
    status:effectiveStatus(invite,now),
    revision:invite.revision,
    recipientEmail:invite.recipientEmailNormalized??null,
    recipientUid:invite.recipientUid??null,
    createdAt:validDate(invite.createdAt).toISOString(),
    expiresAt:validDate(invite.expiresAt).toISOString(),
    maxUses:invite.maxUses,usedCount:invite.usedCount,
    deliveryStatus:invite.deliveryStatus||'not-sent',
    deliveryAttemptCount:invite.deliveryAttemptCount||0,
    deliveryUpdatedAt:invite.deliveryUpdatedAt?
      validDate(invite.deliveryUpdatedAt)?.toISOString()||null:null,
    resendOfInviteId:invite.resendOfInviteId||null,
    requiresGMApproval:true
  };
}
function validNow(value){
  const now=value instanceof Date?value:new Date();
  if(!Number.isFinite(now.getTime()))throw Error('Invalid invitation management time.');
  return now;
}

/**
 * Paginated, safe owner view. The cursor is an invitation ID, never a token.
 * Invitation documents remain fully private under Firestore security rules.
 */
export async function listSecureCampaignInvitations(db,actorUid,
  {campaignId,cursor=null}={},options={}){
  if(!validId(actorUid)||!validId(campaignId)||
    (cursor!==null&&!INVITE_ID.test(cursor)))
    throw Error('Invalid invitation manager request.');
  const campaignSnap=await db.doc('campaigns/'+campaignId).get();
  if(!campaignSnap.exists)throw Error('Campaign not found.');
  const campaign=campaignSnap.data();
  assertOwner(campaign,actorUid,campaignId);
  const path='campaigns/'+campaignId+'/invitations';
  let query=db.collection(path).orderBy('createdAt','desc').limit(PAGE_SIZE+1);
  if(cursor){
    const cursorSnap=await db.doc(path+'/'+cursor).get();
    if(!cursorSnap.exists)throw Error('Invitation list cursor is no longer valid.');
    assertInvite(cursorSnap.data(),campaignId,cursor,campaign.ownerUid);
    query=query.startAfter(cursorSnap);
  }
  const results=await query.get();
  const page=results.docs.slice(0,PAGE_SIZE);
  const now=validNow(options.now);
  const invitations=page.map(row=>{
    const invite=row.data();
    assertInvite(invite,campaignId,row.id,campaign.ownerUid);
    return safeMetadata(invite,now);
  });
  return {
    campaignId,invitations,
    nextCursor:results.docs.length>PAGE_SIZE?page[page.length-1].id:null
  };
}

/**
 * Revoke or expire an existing credential atomically. Changes the record
 * even if another user still has a copy of the raw token; future redemption
 * must re-read its status in the Phase 6.3 transaction.
 */
export async function changeSecureCampaignInvitation(db,actorUid,{
  campaignId,inviteId,action,expectedRevision
}={},options={}){
  if(!validId(actorUid)||!validId(campaignId)||
    !INVITE_ID.test(inviteId)||!['revoke','expire'].includes(action)||
    !validRevision(expectedRevision))
    throw Error('Invalid invitation management action.');
  const now=validNow(options.now);
  const path='campaigns/'+campaignId;
  return db.runTransaction(async tx=>{
    const rootRef=db.doc(path);
    const inviteRef=db.doc(path+'/invitations/'+inviteId);
    const eventId='invite-management-'+inviteId+'-r'+expectedRevision;
    const eventRef=db.doc(path+'/auditEvents/'+eventId);
    const [campaignSnap,inviteSnap,eventSnap]=await Promise.all([
      tx.get(rootRef),tx.get(inviteRef),tx.get(eventRef)
    ]);
    if(!campaignSnap.exists)throw Error('Campaign not found.');
    const campaign=campaignSnap.data();
    assertOwner(campaign,actorUid,campaignId);
    if(!inviteSnap.exists)throw Error('Invitation not found.');
    const invite=inviteSnap.data();
    assertInvite(invite,campaignId,inviteId,campaign.ownerUid);
    const target=action==='revoke'?'revoked':'expired';
    if(invite.status===target&&invite.revision===expectedRevision+1&&
      invite.lastManagedByUid===actorUid&&
      invite.lastManagementAction===action&&
      eventSnap.exists&&eventSnap.data()?.actorUid===actorUid&&
      eventSnap.data()?.action===action)
      return {...safeMetadata(invite,now),alreadyApplied:true};
    if(invite.status!=='active')
      throw Error('This invitation is no longer active. Refresh the list.');
    if(invite.revision!==expectedRevision)
      throw Error('This invitation has changed. Refresh the list.');
    if(eventSnap.exists)throw Error('Invitation management history requires reconciliation.');
    const nextRevision=invite.revision+1;
    if(!validRevision(nextRevision))throw Error('Invitation revision overflow.');
    const updated={...invite,status:target,revision:nextRevision,
      lastManagedByUid:actorUid,lastManagementAction:action,
      managedAt:now,updatedAt:now};
    tx.update(inviteRef,{status:target,revision:nextRevision,
      lastManagedByUid:actorUid,lastManagementAction:action,
      managedAt:now,updatedAt:now});
    tx.create(eventRef,{
      eventId,campaignId,actorUid,category:'secure-invitation',
      action,inviteId,previousStatus:invite.status,
      status:target,revision:nextRevision,createdAt:now
    });
    return {...safeMetadata(updated,now),alreadyApplied:false};
  });
}
