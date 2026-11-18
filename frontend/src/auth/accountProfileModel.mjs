import { inspectAccountProfileDisplay } from '../../../src/state/accountProfileDisplay.mjs';
import { ownedProfile } from './authSessionModel.mjs';

/** Only server-read, UID/email-matched account data enters React presentation. */
export function accountProfileProjection(user, profile) {
  if (!ownedProfile(user, profile)) return null;
  const display = inspectAccountProfileDisplay({
    uid: user.uid, authEmail: user.email, profile
  });
  if (display.status === 'unavailable') return null;
  const revision = profile.avatarUpdatedAt;
  const avatarVersion = revision && typeof revision.seconds === 'number'
    ? String(revision.seconds) + ':' + String(revision.nanoseconds || 0)
    : typeof revision === 'string' ? revision : '';
  return Object.freeze({
    ...display,
    uid: user.uid,
    firstName: typeof profile.firstName === 'string' ? profile.firstName.slice(0, 80) : '',
    lastName: typeof profile.lastName === 'string' ? profile.lastName.slice(0, 80) : '',
    accountNumber: display.status === 'assigned' ? profile.accountNumber : null,
    avatarVersion
  });
}

/** No browser may guess or copy an Account ID from an incomplete profile. */
export function copyableAccountId(account) {
  return account?.status === 'assigned' &&
    typeof account.accountId === 'string' ? account.accountId : null;
}
