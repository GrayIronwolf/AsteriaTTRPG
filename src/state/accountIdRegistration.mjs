// Phase 2.1: validate and hydrate an Account ID after server-side registration.
const USERNAME=/^[A-Za-z0-9._-]{3,24}$/;
const ACCOUNT_NUMBER=/^\d{5}$/;
const UID=/^[A-Za-z0-9_-]{1,128}$/;

export function accountIdRegistrationEnabled(flags) {
  // Never infer rollout from server availability or authentication alone.
  return flags?.accountIds === true || flags?.accountIdAutoCanary === true;
}

export async function finalizeRegisteredAccountId({
  enabled=false, uid, username, requestAssignment, readProfile
}={}) {
  if(!enabled) return null;
  if(typeof uid!=='string'||!UID.test(uid)||
     typeof username!=='string'||!USERNAME.test(username)) {
    throw new Error('A valid account profile is required before Account ID assignment.');
  }
  if(typeof requestAssignment!=='function'||typeof readProfile!=='function') {
    throw new Error('Secure Account ID registration is currently unavailable.');
  }

  // The caller cannot provide an Account ID, target UID, username or suffix.
  // The authenticated callable loads the username from the canonical profile.
  const callableResult=await requestAssignment({action:'ensure'});
  const assigned=callableResult?.data;
  if(!assigned || assigned.username!==username ||
     !ACCOUNT_NUMBER.test(assigned.accountNumber||'') ||
     assigned.accountId!==`${username}#${assigned.accountNumber}`) {
    throw new Error('Account ID assignment could not be verified.');
  }
  // Read canonical server-written profile rather than trusting a cached value.
  const profile=await readProfile();
  const key=`${username.toLowerCase()}#${assigned.accountNumber}`;
  if(!profile || profile.uid!==uid ||
     profile.username!==username ||
     profile.usernameLower!==username.toLowerCase() ||
     profile.accountNumber!==assigned.accountNumber ||
     profile.accountId!==assigned.accountId ||
     profile.accountIdKey!==key ||
     typeof profile.accountIdAssignedAt!=='string' ||
     !Number.isFinite(Date.parse(profile.accountIdAssignedAt))) {
    throw new Error('Account ID profile could not be confirmed.');
  }
  return {
    accountId:profile.accountId,
    accountNumber:profile.accountNumber,
    accountIdKey:profile.accountIdKey,
    accountIdAssignedAt:profile.accountIdAssignedAt
  };
}
