import {defineSecret} from 'firebase-functions/params';
import {deliverAsteriaInvitationEmail} from './campaignEmailTransport.mjs';

// Phase 7.1 wiring point for a future authenticated Phase 7.2 Cloud Function.
// This module does NOT export an HTTP/callable/event-triggered function.
// The Phase 7.2 Cloud Function must explicitly bind this secret using
// {secrets:[asteriaResendApiKeySecret]} and provide server-verified invite data.
export const asteriaResendApiKeySecret=defineSecret('ASTERIA_RESEND_API_KEY');

export async function deliverAsteriaInvitationFromCloudFunction(invitation,{
  env=process.env,fetchImpl=globalThis.fetch
}={}){
  if(env.ASTERIA_EMAIL_DELIVERY_ENABLED!=='1')
    return {status:'disabled',provider:'resend'};
  // Accessing .value() before a bound, configured function is deployed must
  // fail closed. Never put the secret in a VITE_ variable or Firestore record.
  return deliverAsteriaInvitationEmail(invitation,{
    env,apiKey:asteriaResendApiKeySecret.value(),fetchImpl
  });
}
