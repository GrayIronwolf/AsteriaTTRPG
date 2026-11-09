import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { asteriaResendApiKeySecret } from './campaignEmailSecrets.mjs';
import { executeAction } from './handler.mjs';

if(!getApps().length) initializeApp();
export const asteriaAction=onCall({region:'us-central1',maxInstances:3,timeoutSeconds:30},async request=>{
  if(!request.auth) throw new HttpsError('unauthenticated','Sign in to continue.');
  try {
    return await executeAction(getFirestore(),request.auth.uid,request.data,()=>FieldValue.serverTimestamp());
  } catch(error) {
    // Never return stacks, credentials, request payloads or database documents.
    throw new HttpsError('failed-precondition',error.message||'The action could not be completed.');
  }
});

export const asteriaInvite=onCall({region:'us-central1',maxInstances:3,timeoutSeconds:30},async request=>{
  if(!request.auth) throw new HttpsError('unauthenticated','Sign in to continue.');
  try {
    const { accessInvite }=await import('./invitations.mjs');
    if(request.data?.join!==true) {
      const { previewCampaignUCN }=await import('./campaignUCN.mjs');
      return await previewCampaignUCN(getFirestore(),request.auth.uid,request.data?.code);
    }
    return await accessInvite(getFirestore(),request.auth.uid,request.data?.code,true);
  } catch(error) {
    throw new HttpsError('failed-precondition',error.message||'The invitation could not be checked.');
  }
});

 
// Permanent UCN identity allocation and limited lookup (independent of invite redemption).
export const asteriaCampaignUCN=onCall({region:'us-central1',maxInstances:3,timeoutSeconds:30},async request=>{
  if(!request.auth) throw new HttpsError('unauthenticated','Sign in to continue.');
  try {
    const { createCampaignIdentity, previewCampaignUCN }=await import('./campaignUCN.mjs');
    const data=request.data || {};
    if(data.action==='create') return await createCampaignIdentity(getFirestore(),request.auth.uid,data.name);
    if(data.action==='preview') return await previewCampaignUCN(getFirestore(),request.auth.uid,data.code);
    throw new Error('Unknown campaign identity action.');
  } catch(error) {
    throw new HttpsError('failed-precondition',error.message||'The campaign number could not be checked.');
  }
});

 
// Phase 6.1: server-only issuance. No redemption, membership changes or
// invitation management. The HMAC secret is provided by Firebase Secret Manager
// and is never sent to the browser or stored in an invitation document.
const secureInvitationSigningKey=defineSecret('ASTERIA_SECURE_INVITE_SIGNING_KEY');
export const asteriaSecureInvitation=onCall({
  region:'us-central1',maxInstances:3,timeoutSeconds:30,
  secrets:[secureInvitationSigningKey]
},async request=>{
  if(!request.auth)throw new HttpsError('unauthenticated','Sign in to continue.');
  try{
    const data=request.data||{};
    if(data.action==='issue'&&process.env.ASTERIA_SECURE_INVITATIONS_ENABLED!=='1')
      throw new Error('Secure invitation issuance is not enabled yet.');
    if(data.action==='preview'||data.action==='accept'){
      if(process.env.ASTERIA_INVITATION_ACCEPTANCE_ENABLED!=='1')
        throw new Error('Secure invitation acceptance is not enabled yet.');
      const {previewSecureCampaignInvitation,acceptSecureCampaignInvitation}=
        await import('./campaignInvitationAcceptance.mjs');
      const claimant={
        uid:request.auth.uid,
        email:request.auth.token?.email||null,
        emailVerified:request.auth.token?.email_verified===true
      };
      const input={campaignId:data.campaignId,inviteId:data.inviteId,token:data.token};
      const options={
        signingKey:secureInvitationSigningKey.value(),
        notificationsEnabled:process.env.ASTERIA_CAMPAIGN_NOTIFICATIONS_ENABLED==='1'
      };
      return data.action==='preview'?
        await previewSecureCampaignInvitation(getFirestore(),claimant,input,options):
        await acceptSecureCampaignInvitation(getFirestore(),claimant,input,options);
    }
    if(data.action==='list'||data.action==='change'){
      if(process.env.ASTERIA_INVITATION_MANAGER_ENABLED!=='1')
        throw new Error('Invitation Manager is not enabled yet.');
      const {listSecureCampaignInvitations,changeSecureCampaignInvitation}=
        await import('./campaignInvitationManager.mjs');
      if(data.action==='list')
        return await listSecureCampaignInvitations(getFirestore(),request.auth.uid,{
          campaignId:data.campaignId,cursor:data.cursor??null
        });
      return await changeSecureCampaignInvitation(getFirestore(),request.auth.uid,{
        campaignId:data.campaignId,inviteId:data.inviteId,
        action:data.managementAction,expectedRevision:data.expectedRevision
      });
    }
    if(data.action!=='issue')
      throw new Error('Unknown secure invitation action.');
    const {issueSecureCampaignInvitation}=await import('./campaignSecureInvitations.mjs');
    const {campaignId,requestId,type,roleOffered,recipientEmail,
      recipientUid,expiresInHours,maxUses,requiresGMApproval}=request.data||{};
    return await issueSecureCampaignInvitation(getFirestore(),request.auth.uid,{
      campaignId,requestId,type,roleOffered,recipientEmail,recipientUid,
      expiresInHours,maxUses,requiresGMApproval
    },{signingKey:secureInvitationSigningKey.value()});
  }catch(error){
    throw new HttpsError('failed-precondition',
      error.message||'The invitation could not be issued.');
  }
});

// Phase 7.3: account-scoped in-app notification inbox. No direct Firestore
// browser access; notification reads and acknowledgments are callable-only.
export const asteriaCampaignNotifications=onCall({
  region:'us-central1',maxInstances:3,timeoutSeconds:30
},async request=>{
  if(!request.auth)throw new HttpsError('unauthenticated','Sign in to continue.');
  if(process.env.ASTERIA_CAMPAIGN_NOTIFICATIONS_ENABLED!=='1')
    throw new HttpsError('failed-precondition','Campaign notifications are not enabled.');
  try{
    const {listCampaignNotifications,markCampaignNotificationRead}=
      await import('./campaignNotifications.mjs');
    const data=request.data||{},db=getFirestore(),uid=request.auth.uid;
    if(data.action==='list')
      return await listCampaignNotifications(db,uid,{cursor:data.cursor??null});
    if(data.action==='mark-read')
      return await markCampaignNotificationRead(db,uid,data.notificationId);
    throw new Error('Unknown campaign notification action.');
  }catch(error){
    throw new HttpsError('failed-precondition',
      error.message||'Campaign notification operation failed.');
  }
});

// Phase 7.2: GM email sends and token-rotating replacements.
// Both provider and invitation signing secrets are bound only to this callable.
// No service can send without a separate server enablement flag.
export const asteriaCampaignEmailInvitations=onCall({
  region:'us-central1',maxInstances:3,timeoutSeconds:55,
  secrets:[secureInvitationSigningKey,asteriaResendApiKeySecret]
},async request=>{
  if(!request.auth)throw new HttpsError('unauthenticated','Sign in to continue.');
  if(process.env.ASTERIA_EMAIL_INVITATION_CONTROLS_ENABLED!=='1'||
     process.env.ASTERIA_EMAIL_DELIVERY_ENABLED!=='1'||
     process.env.ASTERIA_SECURE_INVITATIONS_ENABLED!=='1')
    throw new HttpsError('failed-precondition','Email invitations are not enabled.');
  try{
    const {sendCampaignEmailInvitations,resendCampaignEmailInvitation}=
      await import('./campaignEmailInvitations.mjs');
    const db=getFirestore(),uid=request.auth.uid,data=request.data||{};
    const options={
      signingKey:secureInvitationSigningKey.value(),
      apiKey:asteriaResendApiKeySecret.value()
    };
    if(process.env.ASTERIA_CAMPAIGN_NOTIFICATIONS_ENABLED==='1'){
      options.notifyAcceptedEmail=async({
        db:store,campaignId,campaignName,inviteId,recipientEmail,now
      })=>{
        let user;
        try{user=await getAuth().getUserByEmail(recipientEmail);}
        catch{return;}
        if(!user?.emailVerified||
          user.email?.trim().toLowerCase()!==recipientEmail)return;
        const {notifyVerifiedEmailRecipient}=
          await import('./campaignNotifications.mjs');
        await notifyVerifiedEmailRecipient(store,user.uid,{
          campaignId,campaignName,inviteId
        },now);
      };
    }
    if(data.action==='send')
      return await sendCampaignEmailInvitations(db,uid,{
        campaignId:data.campaignId,requestId:data.requestId,
        recipients:data.recipients,roleOffered:data.roleOffered,
        expiresInHours:data.expiresInHours
      },options);
    if(data.action==='resend')
      return await resendCampaignEmailInvitation(db,uid,{
        campaignId:data.campaignId,requestId:data.requestId,
        sourceInviteId:data.sourceInviteId,
        expectedRevision:data.expectedRevision
      },options);
    throw new Error('Unknown email invitation operation.');
  }catch(error){
    // Never send back provider response bodies or bearer tokens.
    throw new HttpsError('failed-precondition',
      error.message||'Email invitation operation failed.');
  }
});

// Phase 2.2: prepares member records only. No active access-mode transition.
// Staging is disabled on the server until explicitly reviewed and enabled.
export const asteriaMembershipPreparation=onCall({region:'us-central1',maxInstances:3,timeoutSeconds:30},async request=>{
  if(!request.auth) throw new HttpsError('unauthenticated','Sign in to continue.');
  try {
    const { stageLegacyMemberships }=await import('./campaignMembership.mjs');
    const data=request.data || {};
    if(typeof data.campaignId!=='string') throw new Error('Campaign ID is required.');
    if(data.action==='preview') {
      return await stageLegacyMemberships(getFirestore(),request.auth.uid,data.campaignId);
    }
    if(data.action==='stage') {
      if(process.env.ASTERIA_MEMBERSHIP_STAGING_ENABLED!=='1') throw new Error('Membership staging is not enabled.');
      return await stageLegacyMemberships(getFirestore(),request.auth.uid,data.campaignId,{write:true});
    }
    throw new Error('Unknown membership preparation action.');
  }catch(error){
    throw new HttpsError('failed-precondition',error.message||'Membership records could not be prepared.');
  }
});

 
// Phase 2.3: per-campaign access cutover. Safe preview by owner, and disabled
// activation unless backend operator explicitly enables migration.
export const asteriaCampaignAccessCutover=onCall({region:'us-central1',maxInstances:3,timeoutSeconds:60},async request=>{
  if(!request.auth) throw new HttpsError('unauthenticated','Sign in to continue.');
  try {
    const {prepareCampaignCutover}=await import('./campaignAccessCutover.mjs');
    const {campaignId,action}=request.data || {};
    if(action==='preview') return await prepareCampaignCutover(getFirestore(),request.auth.uid,campaignId);
    if(action==='activate') {
      if(process.env.ASTERIA_MEMBERSHIP_CUTOVER_ENABLED!=='1') throw new Error('Membership activation is not enabled.');
      return await prepareCampaignCutover(getFirestore(),request.auth.uid,campaignId,{activate:true});
    }
    throw new Error('Unknown campaign cutover action.');
  }catch(error){
    throw new HttpsError('failed-precondition',error.message||'Membership access could not be activated.');
  }
});

// Phase 3.2: per-user pending join requests. Does not approve or link members.
export const asteriaCampaignJoinRequest=onCall({region:'us-central1',maxInstances:3,timeoutSeconds:30},async request=>{
  if(!request.auth) throw new HttpsError('unauthenticated','Sign in to continue.');
  try {
    const {campaignJoinRequest}=await import('./campaignJoinRequests.mjs');
    const data=request.data || {};
    if(data.action==='submit' && process.env.ASTERIA_JOIN_REQUESTS_ENABLED!=='1'){
      throw new Error('Join requests are not enabled yet.');
    }
    return await campaignJoinRequest(getFirestore(),request.auth.uid,{
      action:data.action,
      campaignId:data.campaignId,
      ucn:data.ucn,
      characterId:data.characterId
    },{
      autoApproveEnabled:process.env.ASTERIA_AUTO_APPROVE_JOIN_REQUESTS_ENABLED==='1',
      notificationsEnabled:process.env.ASTERIA_CAMPAIGN_NOTIFICATIONS_ENABLED==='1'
    });
  } catch(error){
    throw new HttpsError('failed-precondition',error.message||'Could not process the join request.');
  }
});

// Phase 3.3: manual GM review, owner-controlled approval mode and status queue.
// All writes remain explicitly gated pending coordinated backend activation.
export const asteriaCampaignJoinReview=onCall({region:'us-central1',maxInstances:3,timeoutSeconds:45},async request=>{
  if(!request.auth) throw new HttpsError('unauthenticated','Sign in to continue.');
  try{
    const {listPendingCampaignJoinRequests,reviewCampaignJoinRequest,setCampaignJoinApprovalMode}=
      await import('./campaignJoinApproval.mjs');
    const data=request.data||{},db=getFirestore(),uid=request.auth.uid;
    const autoAvailable=process.env.ASTERIA_AUTO_APPROVE_JOIN_REQUESTS_ENABLED==='1';
    if(['character-lifecycle-list','character-lifecycle-change'].includes(data.action)){
      if(process.env.ASTERIA_CHARACTER_LIFECYCLE_ENABLED!=='1')
        throw new Error('Character lifecycle management is not enabled yet.');
      const {listCampaignCharacterLifecycle,changeCampaignCharacterLifecycle}=
        await import('./campaignCharacterLifecycle.mjs');
      if(data.action==='character-lifecycle-list')
        return await listCampaignCharacterLifecycle(db,uid,data.campaignId);
      return await changeCampaignCharacterLifecycle(db,uid,{...data,action:data.lifecycleAction});
    }
    if(data.action==='character-link-list'||data.action==='character-link-review'){
      if(process.env.ASTERIA_CHARACTER_LINK_APPROVAL_ENABLED!=='1')
        throw new Error('Campaign character approval is not enabled yet.');
      const {listPendingCampaignCharacterLinks,reviewCampaignCharacterLink}=
        await import('./campaignCharacterApproval.mjs');
      if(data.action==='character-link-list')
        return await listPendingCampaignCharacterLinks(db,uid,data.campaignId);
      return await reviewCampaignCharacterLink(db,uid,data);
    }
    if(data.action==='character-link-request'||data.action==='character-link-status'){
      if(process.env.ASTERIA_CHARACTER_LINK_REQUESTS_ENABLED!=='1')
        throw new Error('Campaign character requests are not enabled yet.');
      const {campaignCharacterLink}=await import('./campaignCharacterLinks.mjs');
      return await campaignCharacterLink(db,uid,{
        action:data.action==='character-link-request'?'request':'status',
        campaignId:data.campaignId,sourceCharacterId:data.sourceCharacterId,
        sourceKind:data.sourceKind||'owned'
      });
    }
    if(data.action==='role-change'||data.action==='permission-change'||data.action==='activity'){
      if(process.env.ASTERIA_ROLE_PERMISSIONS_ENABLED!=='1')
        throw new Error('Campaign role administration is not enabled yet.');
      const {changeCampaignMemberRole,setCampaignCoGmPermission,listCampaignMembershipActivity}=
        await import('./campaignRolePermissions.mjs');
      if(data.action==='role-change')return await changeCampaignMemberRole(db,uid,data);
      if(data.action==='permission-change')return await setCampaignCoGmPermission(db,uid,data);
      return await listCampaignMembershipActivity(db,uid,data.campaignId);
    }
    if(data.action==='member-control'){
      if(process.env.ASTERIA_MEMBER_CONTROLS_ENABLED!=='1')
        throw new Error('Campaign member controls are not enabled yet.');
      const {moderateCampaignMember}=await import('./campaignMemberControls.mjs');
      return await moderateCampaignMember(db,uid,{...data,action:data.memberAction});
    }
    if(data.action==='roster'){
      if(process.env.ASTERIA_PLAYER_ROSTER_ENABLED!=='1')
        throw new Error('Campaign player roster is not enabled yet.');
      const {listCampaignPlayerRoster}=await import('./campaignPlayerRoster.mjs');
      return await listCampaignPlayerRoster(db,uid,data.campaignId);
    }
    if(data.action==='list'){
      return await listPendingCampaignJoinRequests(db,uid,data.campaignId,{autoAvailable});
    }
    if(data.action==='review'){
      if(process.env.ASTERIA_JOIN_REVIEW_ENABLED!=='1')
        throw new Error('Campaign join approvals are not enabled yet.');
      return await reviewCampaignJoinRequest(db,uid,data,{
        notificationsEnabled:process.env.ASTERIA_CAMPAIGN_NOTIFICATIONS_ENABLED==='1'
      });
    }
    if(data.action==='mode'){
      if(process.env.ASTERIA_JOIN_REVIEW_ENABLED!=='1')
        throw new Error('Campaign join approvals are not enabled yet.');
      return await setCampaignJoinApprovalMode(db,uid,data.campaignId,data.mode,{autoAvailable});
    }
    throw new Error('Unknown campaign join review action.');
  }catch(error){
    throw new HttpsError('failed-precondition',error.message||'Unable to process GM join request review.');
  }
});
