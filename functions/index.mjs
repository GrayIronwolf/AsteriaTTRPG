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
