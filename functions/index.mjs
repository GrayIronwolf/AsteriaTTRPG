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
    return await accessInvite(getFirestore(),request.auth.uid,request.data?.code,request.data?.join===true);
  } catch(error) {
    throw new HttpsError('failed-precondition',error.message||'The invitation could not be checked.');
  }
});
