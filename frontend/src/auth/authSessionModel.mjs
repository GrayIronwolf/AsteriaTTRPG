/**
 * Derive one safe presentation identity from Firebase Auth and a server-read
 * owner-scoped Firestore document. Email verification is NOT equivalent to
 * verified ownership of the Firestore profile.
 */
export function ownedProfile(user, profile) {
  if (!user || typeof user.uid !== 'string' || !user.uid ||
      !profile || profile.uid !== user.uid ||
      typeof profile.username !== 'string' || !profile.username.trim()) return null;
  const authEmail = String(user.email || '').trim().toLowerCase();
  const savedEmail = String(profile.email || '').trim().toLowerCase();
  if (!authEmail || !savedEmail || authEmail !== savedEmail) return null;
  return Object.freeze({
    uid: user.uid,
    username: profile.username.trim(),
    avatarUrl: typeof profile.avatarUrl === 'string' ? profile.avatarUrl : null,
    accountId: typeof profile.accountId === 'string' ? profile.accountId : null
  });
}

export function safeAuthSession(user, profile) {
  if (!user || typeof user.uid !== 'string' || !user.uid) {
    return Object.freeze({ status: 'guest', user: null, identity: null });
  }
  const owned = ownedProfile(user, profile);
  return Object.freeze({
    status: 'authenticated',
    user: Object.freeze({
      uid: user.uid,
      email: typeof user.email === 'string' ? user.email : '',
      emailVerified: user.emailVerified === true
    }),
    // The presentation field verified=true denotes checked Auth+profile
    // ownership, NOT the emailVerified Firebase property.
    identity: owned
      ? Object.freeze({
          status: 'authenticated', verified: true,
          username: owned.username, avatarUrl: owned.avatarUrl,
          notificationCount: 0
        })
      : null,
    accountId: owned?.accountId ?? null,
    profileAvailable: Boolean(owned)
  });
}

/**
 * StrictMode/logout protection: profile requests can complete after a newer
 * signed-in user or a sign-out. All outstanding requests become invalid.
 */
export function createAuthObserver({ observe, readProfile, publish }) {
  if (typeof observe !== 'function' || typeof readProfile !== 'function' ||
      typeof publish !== 'function') throw new TypeError('Auth observer requires explicit providers');
  let sequence = 0, disposed = false;
  const emit = value => { if (!disposed) publish(value); };
  emit({status:'checking',user:null,identity:null});
  const unsubscribe = observe(async user => {
    const generation = ++sequence;
    if (!user) { emit(safeAuthSession(null)); return; }
    // Drop the old identity as soon as Firebase signals a new user.
    emit({status:'checking',user:null,identity:null});
    let profile = null;
    try { profile = await readProfile(user); } catch { /* fail closed */ }
    if (disposed || generation !== sequence) return;
    emit(safeAuthSession(user, profile));
  }, () => {
    ++sequence;
    emit({status:'unavailable',user:null,identity:null});
  });
  return () => {
    if (disposed) return;
    disposed = true;
    ++sequence;
    if (typeof unsubscribe === 'function') unsubscribe();
  };
}
