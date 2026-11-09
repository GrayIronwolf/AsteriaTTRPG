import {normaliseAccountUsername} from './accountIdentity.mjs';
import {ensureAccountIdentityProfile} from './accountIdentityProfile.mjs';

// This is an additional server-side issuance gate, not a replacement for
// operator-reviewed legacy backfill. Firebase Auth creationTime is maintained
// by Firebase Auth and cannot be backdated by a browser profile update.
export const NEW_REGISTRATION_WINDOW_MS=15*60*1000;
const FUTURE_CLOCK_SKEW_MS=5*1000;
const UID=/^[A-Za-z0-9_-]{1,128}$/;
const CANONICAL_UTC=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const notEligible=()=>new Error('Account ID issuance requires a new registration; existing accounts require reviewed backfill.');

/**
 * Admission policy for browser-facing Account ID issuance:
 * - Explicit operator-configured, immutable Firebase Auth creation cutoff.
 * - Only newly created accounts (no older than 15 minutes).
 * - Exact authenticated UID, normalised Auth email, valid Auth display name.
 * No client-supplied date, profile timestamp or username can grant access.
 */
export function assertNewRegistrationEligible(authUser,uid,{
  notBefore,now=new Date()
}={}){
  if(typeof uid!=='string'||!UID.test(uid)||
     !authUser||authUser.uid!==uid||authUser.disabled===true)throw notEligible();
  if(!(now instanceof Date)||!Number.isFinite(now.getTime()))throw notEligible();

  // The cutoff MUST be manually supplied when production issuance is enabled.
  // Missing, ambiguous or incorrectly formatted values fail closed.
  if(typeof notBefore!=='string'||!CANONICAL_UTC.test(notBefore))
    throw notEligible();
  const cutoff=new Date(notBefore);
  if(!Number.isFinite(cutoff.getTime())||
     cutoff.toISOString()!==notBefore||cutoff.getTime()>now.getTime())
    throw notEligible();

  // Firebase Admin may return an RFC 1123 or an ISO 8601 creationTime.
  const createdText=authUser.metadata?.creationTime;
  if(typeof createdText!=='string'||!createdText.trim())throw notEligible();
  const created=Date.parse(createdText);
  if(!Number.isFinite(created)||created<cutoff.getTime()||
     created>now.getTime()+FUTURE_CLOCK_SKEW_MS||
     now.getTime()-created>NEW_REGISTRATION_WINDOW_MS)
    throw notEligible();

  if(typeof authUser.displayName!=='string')throw notEligible();
  let username;
  try{username=normaliseAccountUsername(authUser.displayName).username;}
  catch{throw notEligible();}
  if(username!==authUser.displayName)throw notEligible();
  const email=typeof authUser.email==='string'?
    authUser.email.trim().toLowerCase():'';
  if(!EMAIL.test(email))throw notEligible();
  return {uid,username,email};
}

/**
 * The *only* Account ID writer reachable from the public callable.
 * An existing UID cannot gain a new number by signing in, supplying client
 * metadata, or changing the editable Firestore profile after registration.
 * Admin-only, operator-reviewed legacy assignments remain a separate method.
 */
export async function issueNewRegistrationAccountId(db,authUser,uid,options={}){
  const {username,email}=assertNewRegistrationEligible(authUser,uid,{
    notBefore:options.notBefore,now:options.now||new Date()
  });
  return ensureAccountIdentityProfile(db,uid,{
    expectedUsername:username,
    expectedEmail:email,
    ...(options.nextNumber?{nextNumber:options.nextNumber}:{}),
    ...(options.now?{now:options.now}:{})
  });
}
