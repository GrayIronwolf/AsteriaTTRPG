import {normaliseAccountUsername,validAccountNumber} from './accountIdentity.mjs';
import {ensureAccountIdentityProfile} from './accountIdentityProfile.mjs';

// Operator-only, per-account migration. Not exported as a callable or CLI job.
// No bulk scan, implicit account login migration, or automatic production write.
const UID=/^[A-Za-z0-9_-]{1,128}$/;
const KEYS=['accountId','accountNumber','accountIdKey','accountIdAssignedAt'];
const owns=(obj,key)=>Object.prototype.hasOwnProperty.call(obj,key);
const validUid=uid=>typeof uid==='string'&&UID.test(uid);
const lower=email=>typeof email==='string'?email.trim().toLowerCase():'';

function alreadyAssigned(profile,assignment,registry,uid){
  try{
    const {username,usernameLower}=normaliseAccountUsername(profile.username);
    const number=assignment.accountNumber;
    const id=`${username}#${number}`;
    const key=`${usernameLower}#${number}`;
    return validAccountNumber(number)&&
      assignment.uid===uid && assignment.username===username &&
      assignment.usernameLower===usernameLower &&
      assignment.accountId===id && assignment.accountIdKey===key &&
      typeof assignment.createdAt==='string' &&
      registry?.uid===uid && registry.usernameLower===usernameLower &&
      registry.accountNumber===number && registry.accountId===id &&
      registry.accountIdKey===key &&
      KEYS.every(field=>owns(profile,field)) &&
      profile.accountId===id && profile.accountNumber===number &&
      profile.accountIdKey===key &&
      profile.accountIdAssignedAt===assignment.createdAt;
  }catch{return false;}
}

/**
 * Read-only readiness assessment of one existing account.
 * Returns a classification, never email, account metadata or private profile.
 * Existing IDs are validated against both permanent mappings.
 */
export async function inspectLegacyAccountIdentity(db,auth,uid) {
  if(!validUid(uid))throw new Error('A valid authenticated UID is required.');
  if(typeof db?.doc!=='function' || typeof auth?.getUser!=='function')
    throw new Error('Trusted backend services are required.');
  let account;
  try{account=await auth.getUser(uid);}
  catch{return {uid,status:'manual-review',reason:'auth-account-unavailable'};}
  if(account?.uid!==uid || account.disabled===true)
    return {uid,status:'manual-review',reason:'auth-account-unavailable'};
  const [profileSnap,assignmentSnap]=await Promise.all([
    db.doc(`users/${uid}`).get(),db.doc(`accountIdAssignments/${uid}`).get()
  ]);
  if(!profileSnap.exists)
    return {uid,status:'manual-review',reason:'profile-missing'};
  const profile=profileSnap.data()||{};
  // Older profiles may predate the uid property. A missing field is safe
  // to populate only during the existing transaction after Auth identity,
  // username and email have been checked. Never overwrite an explicit UID.
  if(owns(profile,'uid') && profile.uid!==uid)
    return {uid,status:'manual-review',reason:'profile-uid-conflict'};
  let username,usernameLower;
  try{({username,usernameLower}=normaliseAccountUsername(profile.username));}
  catch{return {uid,status:'manual-review',reason:'invalid-username'};}
  if(profile.username!==username ||
     (owns(profile,'usernameLower') && profile.usernameLower!==usernameLower))
    return {uid,status:'manual-review',reason:'username-normalization-mismatch'};
  if(account.displayName!==username ||
     !lower(account.email) || lower(account.email)!==lower(profile.email))
    return {uid,status:'manual-review',reason:'auth-profile-mismatch'};

  if(assignmentSnap.exists){
    const assignment=assignmentSnap.data()||{};
    if(!validAccountNumber(assignment.accountNumber))
      return {uid,status:'manual-review',reason:'identity-mapping-inconsistent'};
    const registrySnap=await db.doc(
      `accountIdRegistry/${usernameLower}#${assignment.accountNumber}`).get();
    return alreadyAssigned(profile,assignment,
      registrySnap.exists?registrySnap.data():null,uid)?
      {uid,status:'already-assigned',username}:
      {uid,status:'manual-review',reason:'identity-mapping-inconsistent'};
  }
  if(KEYS.some(field=>owns(profile,field)))
    return {uid,status:'manual-review',reason:'untrusted-identity-fields'};
  return {uid,status:'eligible',username};
}

/**
 * Explicit one-account backfill. A separate approved operator entrypoint must
 * supply the enablement, project identity and per-UID confirmation. Safe by
 * default: no callable, no scheduled task, no automatic production migration.
 */
export async function backfillLegacyAccountIdentity(db,auth,uid,options={}) {
  if(!validUid(uid))throw new Error('Invalid account UID.');
  if(options.enabled!==true || options.confirmation!==`BACKFILL-ACCOUNT-ID:${uid}`)
    throw new Error('Legacy Account ID backfill is disabled until explicitly approved.');
  // Reject project confusion even in test/demo operator tooling.
  if(typeof options.projectId!=='string' || !options.projectId ||
     options.projectId!==db?.projectId)
    throw new Error('Explicit Firebase project identity is required.');
  const preview=await inspectLegacyAccountIdentity(db,auth,uid);
  if(preview.status==='already-assigned')return {uid,status:'already-assigned'};
  if(preview.status!=='eligible')
    throw new Error('Legacy account requires manual reconciliation.');
  const result=await ensureAccountIdentityProfile(db,uid,{
    expectedUsername:preview.username,
    ...(options.nextNumber ? {nextNumber:options.nextNumber}:{}),
    ...(options.now ? {now:options.now}:{})
  });
  return {uid,status:result.alreadyAssigned?'already-assigned':'assigned',
    accountId:result.accountId,accountNumber:result.accountNumber};
}
