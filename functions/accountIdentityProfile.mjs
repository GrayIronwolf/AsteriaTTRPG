import {
  ACCOUNT_ID_ALLOCATION_ATTEMPTS, normaliseAccountUsername,
  randomAccountNumber, validAccountNumber
} from './accountIdentity.mjs';

// Server-only profile binder. Never accept a username or target UID from client data.
const UID = /^[A-Za-z0-9_-]{1,128}$/;
const FIELDS = ['accountId','accountNumber','accountIdKey','accountIdAssignedAt'];
const has = (obj,key) => Object.prototype.hasOwnProperty.call(obj,key);

function verifyExisting(uid, profile, username, lower, assigned, registry) {
  const number=assigned.accountNumber;
  const accountId=`${username}#${number}`, accountIdKey=`${lower}#${number}`;
  if(!validAccountNumber(number) || assigned.uid!==uid ||
    assigned.username!==username || assigned.usernameLower!==lower ||
    assigned.accountId!==accountId || assigned.accountIdKey!==accountIdKey ||
    typeof assigned.createdAt!=='string' || !registry ||
    registry.uid!==uid || registry.usernameLower!==lower ||
    registry.accountNumber!==number || registry.accountId!==accountId ||
    registry.accountIdKey!==accountIdKey || registry.createdAt!==assigned.createdAt) {
    throw new Error('Existing Account ID requires administrator reconciliation.');
  }
  const patch={accountId,accountNumber:number,accountIdKey,accountIdAssignedAt:assigned.createdAt};
  const existing=FIELDS.filter(field=>has(profile,field));
  if(existing.length && (existing.length!==FIELDS.length ||
    FIELDS.some(field=>profile[field]!==patch[field]))) {
    throw new Error('Account profile identity requires administrator reconciliation.');
  }
  return {patch,needsRepair:existing.length===0};
}

/**
 * Phase 1.3: atomically bind the permanent Account ID to users/{uid}.
 * The user-chosen username is read within the server transaction from their
 * profile. The authenticated caller UID must be verified by a trusted handler.
 * No production use until ASTERIA_ACCOUNT_IDS_ENABLED is explicitly enabled.
 */
export async function ensureAccountIdentityProfile(db,uid,options={}) {
  if(typeof uid!=='string' || !UID.test(uid)) throw new Error('Sign in to continue.');
  if(!db || typeof db.doc!=='function' || typeof db.runTransaction!=='function')
    throw new Error('Account ID database is unavailable.');
  const now=options.now instanceof Date?options.now:new Date();
  if(!Number.isFinite(now.getTime())) throw new Error('Invalid allocation timestamp.');
  const createdAt=now.toISOString();
  const nextNumber=options.nextNumber || randomAccountNumber;
  const profileRef=db.doc(`users/${uid}`);
  const assignmentRef=db.doc(`accountIdAssignments/${uid}`);

  for(let attempt=0;attempt<ACCOUNT_ID_ALLOCATION_ATTEMPTS;attempt++) {
    const number=nextNumber();
    if(!validAccountNumber(number))
      throw new Error('Account number generator returned an invalid value.');
    const outcome=await db.runTransaction(async tx=>{
      const profileSnap=await tx.get(profileRef);
      if(!profileSnap.exists)
        throw new Error('Create the account profile before assigning an Account ID.');
      const profile=profileSnap.data() || {};
      if(has(profile,'uid') && profile.uid!==uid)
        throw new Error('Account profile ownership requires administrator reconciliation.');
      const {username,usernameLower}=normaliseAccountUsername(profile.username);
      if(profile.username!==username)
        throw new Error('Account profile username must be normalized before assigning an ID.');
      const assignedSnap=await tx.get(assignmentRef);
      if(assignedSnap.exists) {
        const assigned=assignedSnap.data() || {};
        if(!validAccountNumber(assigned.accountNumber))
          throw new Error('Existing Account ID requires administrator reconciliation.');
        const registrySnap=await tx.get(db.doc(
          `accountIdRegistry/${usernameLower}#${assigned.accountNumber}`
        ));
        const {patch,needsRepair}=verifyExisting(uid,profile,username,usernameLower,
          assigned,registrySnap.exists?registrySnap.data():null);
        if(needsRepair || !has(profile,'uid') || profile.usernameLower!==usernameLower)
          tx.update(profileRef,{...patch,usernameLower,uid});
        return {username,accountNumber:assigned.accountNumber,accountId:patch.accountId,
          alreadyAssigned:true,profileRepaired:needsRepair};
      }
      if(FIELDS.some(field=>has(profile,field)))
        throw new Error('Account profile identity requires administrator reconciliation.');
      const accountId=`${username}#${number}`;
      const accountIdKey=`${usernameLower}#${number}`;
      const registryRef=db.doc(`accountIdRegistry/${accountIdKey}`);
      const registrySnap=await tx.get(registryRef);
      if(registrySnap.exists) return null;
      const assignment={uid,username,usernameLower,accountNumber:number,
        accountId,accountIdKey,createdAt};
      tx.create(assignmentRef,assignment);
      tx.create(registryRef,{uid,usernameLower,accountNumber:number,
        accountId,accountIdKey,createdAt});
      tx.update(profileRef,{uid,usernameLower,accountNumber:number,
        accountId,accountIdKey,accountIdAssignedAt:createdAt});
      return {username,accountNumber:number,accountId,
        alreadyAssigned:false,profileRepaired:false};
    });
    if(outcome!==null) return outcome;
  }
  throw new Error('No Account ID could be reserved. Please retry later.');
}
