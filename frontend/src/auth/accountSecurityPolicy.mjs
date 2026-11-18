/**
 * Browser-only identity claims, query parameters and local roles never grant
 * access. A protected React page needs the active Firebase Auth session plus
 * its fresh UID/email-owned Firestore profile.
 */
export function isVerifiedOwnedSession(session) {
  return session?.status === 'authenticated' &&
    session?.profileAvailable === true &&
    session?.identity?.status === 'authenticated' &&
    session?.identity?.verified === true &&
    typeof session?.user?.uid === 'string' &&
    session.user.uid.length > 0 &&
    typeof session.user.email === 'string' &&
    session.user.email.includes('@');
}
export function classifyPrivateRoute(session,serviceAvailable) {
  if(!serviceAvailable) return 'unavailable';
  if(session?.status === 'checking') return 'checking';
  if(session?.status !== 'authenticated') return 'login-required';
  return isVerifiedOwnedSession(session) ? 'allowed' : 'profile-unverified';
}
/** Never grant access because a URL contains an Account ID, UID or GM flag. */
export function canReadRestrictedCompendium() {
  // No private compendium callable or secured content origin exists in Phase 4.
  // Even verified account ownership is NOT proof of a campaign GM role.
  return false;
}
