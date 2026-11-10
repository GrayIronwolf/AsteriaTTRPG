// Client-side account verification eligibility. Firebase Auth and the callable
// remain the authorities; this module never grants Account ID permissions.
export const ACCOUNT_ID_REGISTRATION_WINDOW_MS=15*60*1000;
export const VERIFICATION_RESEND_COOLDOWN_MS=60*1000;
const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function canSendVerificationEmail(user) {
  return Boolean(user && typeof user.uid==='string' && user.uid &&
    typeof user.email==='string' && EMAIL.test(user.email) &&
    user.emailVerified===false);
}

export function verificationResendAvailable(lastSentAt,now=Date.now()) {
  return !Number.isFinite(lastSentAt) ||
    (Number.isFinite(now) && now-lastSentAt>=VERIFICATION_RESEND_COOLDOWN_MS);
}

export function accountIdCompletionEnabled(flags) {
  // The canary toggle is distinct from the later general-registration toggle.
  // Neither grants access on its own; the server must independently authorise.
  return flags?.accountIds===true || flags?.accountIdCanary===true;
}

export function canCompleteNewAccountId(user,flags,now=Date.now()) {
  if(!accountIdCompletionEnabled(flags) ||
     typeof user?.uid!=='string' || !user.uid ||
     user.emailVerified!==true ||
     typeof user.email!=='string' || !EMAIL.test(user.email) ||
     typeof user.displayName!=='string' || !user.displayName) return false;
  const created=Date.parse(user.metadata?.creationTime||'');
  return Number.isFinite(now)&&Number.isFinite(created)&&
    created<=now && now-created<ACCOUNT_ID_REGISTRATION_WINDOW_MS;
}
