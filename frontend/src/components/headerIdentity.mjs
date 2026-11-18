/**
 * Header component data contract only. It does not authenticate a user.
 * A future trusted Auth adapter must check Firebase auth and verified account
 * display data before supplying {status:"authenticated", verified:true}.
 */
export function getVerifiedHeaderIdentity(identity) {
  if (!identity || identity.status !== 'authenticated' || identity.verified !== true) {
    return null;
  }

  const username = typeof identity.username === 'string' ? identity.username.trim() : '';
  if (!username) return null;

  let avatarUrl = null;
  if (typeof identity.avatarUrl === 'string') {
    try {
      const url = new URL(identity.avatarUrl);
      if (url.protocol === 'https:' && !url.username && !url.password) {
        avatarUrl = url.href;
      }
    } catch {
      // Invalid image URL; use initials instead.
    }
  }

  return {
    username,
    initial: username.charAt(0).toLocaleUpperCase(),
    notificationCount: Number.isSafeInteger(identity.notificationCount) && identity.notificationCount >= 0
      ? Math.min(identity.notificationCount, 99) : 0,
    avatarUrl
  };
}
