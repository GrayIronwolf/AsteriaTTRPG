/**
 * Future authenticated account-header boundary. Call only from a real Auth
 * provider during the Account migration; this file connects to no Firebase
 * app and is not registered in previewServices. Private profile and unread
 * counts MUST be fetched after Auth verification using ownership-scoped
 * backend queries. Unverified/mismatched data fails closed.
 */
export function createAccountHeaderGateway({
  getAuthenticatedUser, getOwnedProfile, getUnreadNotificationCount
} = {}) {
  for (const provider of [getAuthenticatedUser, getOwnedProfile, getUnreadNotificationCount]) {
    if (typeof provider !== 'function') {
      throw new TypeError('Account header requires explicit authenticated providers');
    }
  }
  return Object.freeze({
    async load() {
      try {
        const user = await getAuthenticatedUser();
        if (!user || typeof user.uid !== 'string' || !user.uid.trim()) return null;
        const profile = await getOwnedProfile(user.uid);
        if (!profile || profile.uid !== user.uid ||
          typeof profile.username !== 'string' || !profile.username.trim()) return null;

        const count = await getUnreadNotificationCount(user.uid);
        if (!Number.isSafeInteger(count) || count < 0) return null;
        return Object.freeze({
          status: 'authenticated',
          verified: true,
          username: profile.username.trim(),
          avatarUrl: profile.avatarUrl ?? null,
          notificationCount: Math.min(count, 99)
        });
      } catch {
        return null; // No silent unauthenticated fallback for personal data.
      }
    }
  });
}
