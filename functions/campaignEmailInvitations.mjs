import {issueSecureCampaignInvitation,normalizedInviteEmail} from './campaignSecureInvitations.mjs';
import {changeSecureCampaignInvitation} from './campaignInvitationManager.mjs';
import {inspectAsteriaEmailConfig,deliverAsteriaInvitationEmail}
  from './campaignEmailTransport.mjs';

// Phase 7.2: owner-only server orchestration. Never persist or return bearer
// tokens. The disabled-by-default callable binds both Secret Manager secrets.
const ID=/^[A-Za-z0-9_-]{1,160}$/;
const DIGEST=/^[a-f0-9]{64}$/;
const REQUEST=/^[A-Za-z0-9_-]{12,72}$/;
const LIMIT=5, HOURS=720;
const record=x=>Boolean(x)&&typeof x==='object'&&!Array.isArray(x);
const safeNow=x=>x instanceof Date&&Number.isFinite(x.getTime())?x:new Date();
const publicResult=(invite,status,extra={})=>({
  inviteId:invite.inviteId,status,roleOffered:invite.roleOffered,
  recipientEmail:invite.recipientEmailNormalized,
  expiresAt:(invite.expiresAt?.toDate?.()||new Date(invite.expiresAt)).toISOString(),
  ...extra
});
const campaignRef=(db,id)=>db.doc('campaigns/'+id);
const inviteRef=(db,id,inviteId)=>db.doc('campaigns/'+id+'/invitations/'+inviteId);

function ownerOnly(campaign,uid,id){
  if(!record(campaign)||campaign.membershipSchemaVersion!==2||
    campaign.ownerUid!==uid||campaign.id&&campaign.id!==id)
    throw Error('Only the owner of an upgraded campaign can email invitations.');
  if(campaign.joinPolicy?.joinRequestsOpen===false)
    throw Error('Campaign join requests are closed.');
}
function validateConfig(env,apiKey){
  const config=inspectAsteriaEmailConfig(env);
  if(!config.enabled)throw Error('Email delivery is not enabled.');
  if(!config.domainConfigured||!config.domainVerified)
    throw Error('Email sending domain has not been verified.');
  if(typeof apiKey!=='string'||apiKey.length<24||!apiKey.startsWith('re_'))
    throw Error('Email provider is not configured.');
}
function validatedRecipients(recipients){
  if(!Array.isArray(recipients)||!recipients.length||recipients.length>LIMIT)
    throw Error('Choose between 1 and 5 recipients per request.');
  const normalized=recipients.map(normalizedInviteEmail);
  if(new Set(normalized).size!==normalized.length)
    throw Error('Duplicate recipients in the same batch.');
  return normalized;
}
async function readOwner(db,uid,campaignId){
  const snap=await campaignRef(db,campaignId).get();
  if(!snap.exists)throw Error('Campaign not found.');
  ownerOnly(snap.data(),uid,campaignId);
  return snap.data();
}
function preflight({campaignId,requestId,recipients,roleOffered,expiresInHours},options){
  if(typeof campaignId!=='string'||!ID.test(campaignId)||
    typeof options.actorUid!=='string'||!ID.test(options.actorUid)||
    typeof requestId!=='string'||!REQUEST.test(requestId))
    throw Error('Provide a valid owner, campaign and unique request ID.');
  if(!['player','co-gm'].includes(roleOffered)||
    !Number.isSafeInteger(expiresInHours)||expiresInHours<1||
    expiresInHours>HOURS)
    throw Error('Choose a valid offered role and expiration.');
  const emails=validatedRecipients(recipients);
  validateConfig(options.env,options.apiKey);
  if(typeof options.signingKey!=='string'||options.signingKey.length<32)
    throw Error('Invitation signing key has not been configured.');
  return emails;
}
function validSource(source,campaignId,actorUid,email){
  if(!record(source)||source.campaignId!==campaignId||
    !DIGEST.test(source.inviteId)||source.createdByUid!==actorUid||
    source.type!=='email'||source.maxUses!==1||
    source.usedCount!==0||
    source.recipientEmailNormalized!==email||
    source.status!=='active'||
    !Number.isSafeInteger(source.revision)||source.revision<1)
    throw Error('The selected invitation cannot be resent. Create a new invitation.');
}
async function reservation(db,uid,campaignId,inviteId,email,now,resendSource=null){
  return db.runTransaction(async tx=>{
    const root=campaignRef(db,campaignId);
    const ref=inviteRef(db,campaignId,inviteId);
    const [campaign,invite]=await Promise.all([tx.get(root),tx.get(ref)]);
    if(!campaign.exists||!invite.exists)throw Error('Invitation record not found.');
    ownerOnly(campaign.data(),uid,campaignId);
    const row=invite.data();
    if(row.campaignId!==campaignId||row.inviteId!==inviteId||
      row.createdByUid!==uid||row.type!=='email'||row.status!=='active'||
      row.usedCount!==0||row.maxUses!==1||
      row.recipientEmailNormalized!==email||row.deliveryStatus!=null||
      row.requiresGMApproval!==true)
      throw Error('This invitation is not eligible for email delivery.');
    const exp=row.expiresAt?.toDate?.()||new Date(row.expiresAt);
    if(!Number.isFinite(exp.getTime())||exp<=now)
      throw Error('The invitation has expired.');
    const patch={
      deliveryStatus:'sending',deliveryAttemptedAt:now,
      deliveryAttemptCount:1,deliveryProvider:'resend'
    };
    if(resendSource)patch.resendOfInviteId=resendSource;
    tx.update(ref,patch);
    return {...row,...patch};
  });
}
async function finishDelivery(db,campaignId,inviteId,result,now){
  return db.runTransaction(async tx=>{
    const ref=inviteRef(db,campaignId,inviteId);
    const snap=await tx.get(ref);
    if(!snap.exists)throw Error('Delivery record is missing.');
    const row=snap.data();
    if(row.deliveryStatus!=='sending')throw Error('Delivery status requires reconciliation.');
    const status=result?.status==='accepted'?'accepted':'unknown';
    const patch={
      deliveryStatus:status,deliveryUpdatedAt:now,
      ...(status==='accepted'?{deliveryProviderMessageId:result.providerMessageId}:{})
    };
    tx.update(ref,patch);
    return status;
  });
}
async function sendOne(db,uid,campaign,params,options,recipientEmail,index,source=null){
  const requestId=params.requestId+'-'+index;
  const issued=await issueSecureCampaignInvitation(db,uid,{
    campaignId:params.campaignId,requestId,type:'email',
    recipientEmail,roleOffered:params.roleOffered,
    expiresInHours:params.expiresInHours,maxUses:1,
    requiresGMApproval:true
  },{signingKey:options.signingKey,now:options.now});
  const ref=inviteRef(db,params.campaignId,issued.inviteId);
  if(issued.alreadyIssued||!issued.token){
    const snap=await ref.get();
    const row=snap.exists?snap.data():null;
    if(!record(row)||row.recipientEmailNormalized!==recipientEmail||
      row.createdByUid!==uid||row.roleOffered!==params.roleOffered||
      row.type!=='email')
      throw Error('Email invitation request needs reconciliation.');
    return publicResult(row,row.deliveryStatus||'not-sent',{alreadyExists:true});
  }
  // A resend gets a fresh bearer credential; the original must be revoked
  // before the fresh token is passed to a delivery provider.
  if(source){
    try{
      await changeSecureCampaignInvitation(db,uid,{
        campaignId:params.campaignId,inviteId:source.inviteId,
        action:'revoke',expectedRevision:source.revision
      },{now:options.now});
    }catch(error){
      await changeSecureCampaignInvitation(db,uid,{
        campaignId:params.campaignId,inviteId:issued.inviteId,
        action:'revoke',expectedRevision:1
      },{now:options.now}).catch(()=>{});
      throw Error('The original invitation changed; refresh before resending.');
    }
  }
  const row=await reservation(db,uid,params.campaignId,issued.inviteId,
    recipientEmail,options.now,source?.inviteId||null);
  const link='https://asteriattrpg.com/#secure-campaign-invite='+
    params.campaignId+'.'+issued.inviteId+'.'+issued.token;
  const invitation={
    campaignId:params.campaignId,inviteId:issued.inviteId,
    invitationUrl:link,recipientEmail,
    campaignName:campaign.name||'Asteria Campaign',
    inviterName:campaign.ownerName||'Campaign GM',
    roleOffered:row.roleOffered,expiresAt:row.expiresAt
  };
  // The transport never logs content; network uncertainty is marked unknown.
  // Never auto-replay the raw token. Use a new replacement invitation instead.
  let delivery;
  try{
    delivery=await (options.deliver||deliverAsteriaInvitationEmail)(invitation,{
      env:options.env,apiKey:options.apiKey,fetchImpl:options.fetchImpl
    });
  }catch{
    await finishDelivery(db,params.campaignId,issued.inviteId,
      {status:'unknown'},options.now);
    return publicResult(row,'unknown',{
      alreadyExists:false,warning:'Email submission could not be confirmed. Revoke or replace this invitation before retrying.'
    });
  }
  const status=await finishDelivery(db,params.campaignId,issued.inviteId,
    delivery,options.now);
  return publicResult(row,status,{alreadyExists:false});
}

/**
 * The GM may send 1-5 recipient-restricted invitations per batch.
 * Each recipient has a deterministic issuance request key. A repeated
 * request returns metadata only and never emails an already-issued token.
 */
export async function sendCampaignEmailInvitations(db,actorUid,{
  campaignId,requestId,recipients,roleOffered='player',expiresInHours=168
}={},options={}){
  const now=safeNow(options.now);
  const opts={...options,now,actorUid,env:options.env||process.env};
  const emails=preflight({campaignId,requestId,recipients,roleOffered,expiresInHours},opts);
  const campaign=await readOwner(db,actorUid,campaignId);
  const outcomes=[];
  for(let i=0;i<emails.length;i++){
    try{
      outcomes.push(await sendOne(db,actorUid,campaign,{
        campaignId,requestId,roleOffered,expiresInHours
      },opts,emails[i],i));
    }catch{
      outcomes.push({recipientEmail:emails[i],status:'failed',
        warning:'Invitation could not be issued. Check the list and daily quota before retrying.'});
    }
  }
  return {campaignId,results:outcomes};
}

/**
 * No old token is recovered or reused. Resend explicitly rotates to a new
 * invitation, revokes the previous credential, and sends only the new token.
 */
export async function resendCampaignEmailInvitation(db,actorUid,{
  campaignId,requestId,sourceInviteId,expectedRevision
}={},options={}){
  const now=safeNow(options.now),env=options.env||process.env;
  if(typeof campaignId!=='string'||!ID.test(campaignId)||
    typeof actorUid!=='string'||!ID.test(actorUid)||
    typeof requestId!=='string'||!REQUEST.test(requestId)||
    !DIGEST.test(sourceInviteId)||
    !Number.isSafeInteger(expectedRevision)||expectedRevision<1)
    throw Error('Select an invitation and provide a new request ID.');
  validateConfig(env,options.apiKey);
  if(typeof options.signingKey!=='string'||options.signingKey.length<32)
    throw Error('Invitation signing key has not been configured.');
  const campaign=await readOwner(db,actorUid,campaignId);
  const snap=await inviteRef(db,campaignId,sourceInviteId).get();
  if(!snap.exists)throw Error('Invitation not found.');
  const source=snap.data();
  const email=normalizedInviteEmail(source.recipientEmailNormalized);
  validSource(source,campaignId,actorUid,email);
  if(source.revision!==expectedRevision)
    throw Error('The invitation has changed. Refresh the list.');
  const result=await sendOne(db,actorUid,campaign,{
    campaignId,requestId,roleOffered:source.roleOffered,
    expiresInHours:Math.min(HOURS,Math.max(1,
      Math.ceil(((source.expiresAt?.toDate?.()||new Date(source.expiresAt)).getTime()-
      (source.createdAt?.toDate?.()||new Date(source.createdAt)).getTime())/3600000)))
  },{...options,now,env},email,0,source);
  return {campaignId,result};
}
