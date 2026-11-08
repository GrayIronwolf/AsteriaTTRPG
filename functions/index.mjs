import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
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
    },{autoApproveEnabled:process.env.ASTERIA_AUTO_APPROVE_JOIN_REQUESTS_ENABLED==='1'});
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
      return await reviewCampaignJoinRequest(db,uid,data);
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
