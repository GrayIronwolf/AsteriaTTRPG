// Phase 1.2 — exact Friend account discovery. All Firestore access is Admin-only.
// An Account ID is a lookup handle, never a friendship, invitation, or access grant.
const UID = /^[A-Za-z0-9_-]{1,128}$/;
const HANDLE = /^([A-Za-z0-9._-]{3,24})#([0-9]{5})$/;
const WINDOW_MS = 15 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
export const FRIEND_LOOKUP_LIMITS = Object.freeze({
  windowMs: WINDOW_MS, perWindow: 10, dayMs: DAY_MS, perDay: 40
});

const validUid = value => typeof value === 'string' && UID.test(value);
const documentData = snapshot => snapshot?.exists ? snapshot.data() || {} : null;

export function normaliseFriendAccountId(value) {
  if (typeof value !== 'string' || value.length > 40)
    throw new Error('Invalid Account ID.');
  const match = HANDLE.exec(value.trim());
  if (!match) throw new Error('Invalid Account ID.');
  return {
    key: match[1].toLowerCase() + '#' + match[2],
    usernameLower: match[1].toLowerCase(), accountNumber: match[2]
  };
}

function verifiedActiveIdentity(uid, profile, assignment, registry) {
  if (!validUid(uid) || !profile || !assignment || !registry ||
      typeof assignment.username !== 'string' ||
      !/^[A-Za-z0-9._-]{3,24}$/.test(assignment.username) ||
      !/^[0-9]{5}$/.test(assignment.accountNumber) ||
      typeof assignment.createdAt !== 'string' ||
      !Number.isFinite(Date.parse(assignment.createdAt)))
    return null;
  const lower = assignment.username.toLowerCase();
  const id = assignment.username + '#' + assignment.accountNumber;
  const key = lower + '#' + assignment.accountNumber;
  if (assignment.uid !== uid ||
      assignment.usernameLower !== lower ||
      assignment.accountId !== id || assignment.accountIdKey !== key ||
      profile.uid !== uid || profile.username !== assignment.username ||
      profile.usernameLower !== lower || profile.accountId !== id ||
      profile.accountIdKey !== key ||
      profile.accountNumber !== assignment.accountNumber ||
      profile.accountIdAssignedAt !== assignment.createdAt ||
      registry.uid !== uid || registry.accountId !== id ||
      registry.usernameLower !== lower || registry.accountNumber !== assignment.accountNumber ||
      registry.accountIdKey !== key || registry.createdAt !== assignment.createdAt ||
      registry.alias === true ||
      (registry.activeAccountIdKey != null && registry.activeAccountIdKey !== key))
    return null;
  return {username: assignment.username, accountId: id, accountIdKey: key};
}

function nextQuota(previous, uid, nowMs) {
  if (previous && (previous.uid !== uid ||
      !Number.isSafeInteger(previous.windowStartMs) ||
      !Number.isSafeInteger(previous.dayStartMs) ||
      !Number.isSafeInteger(previous.windowCount) ||
      !Number.isSafeInteger(previous.dayCount) ||
      previous.windowCount < 1 || previous.windowCount > FRIEND_LOOKUP_LIMITS.perWindow ||
      previous.dayCount < 1 || previous.dayCount > FRIEND_LOOKUP_LIMITS.perDay ||
      previous.windowStartMs > nowMs || previous.dayStartMs > nowMs))
    throw new Error('Account search unavailable.');
  const inWindow = previous && nowMs - previous.windowStartMs < WINDOW_MS;
  const inDay = previous && nowMs - previous.dayStartMs < DAY_MS;
  const windowCount = inWindow ? previous.windowCount : 0;
  const dayCount = inDay ? previous.dayCount : 0;
  if (windowCount >= FRIEND_LOOKUP_LIMITS.perWindow ||
      dayCount >= FRIEND_LOOKUP_LIMITS.perDay)
    throw new Error('Account search rate limit reached.');
  return {
    uid, windowStartMs: inWindow ? previous.windowStartMs : nowMs,
    dayStartMs: inDay ? previous.dayStartMs : nowMs,
    windowCount: windowCount + 1, dayCount: dayCount + 1,
    lastAttemptAt: new Date(nowMs)
  };
}

/**
 * Caller UID is supplied exclusively from verified Firebase Auth. The user
 * entered handle is never used to choose a UID, bypass private directory rules,
 * or create a membership. Every syntactically valid lookup (including misses)
 * consumes one transactional, server-owned quota unit before returning.
 *
 * Only the current, non-alias registry entry is discoverable. Historical
 * names reserved after renaming remain private. Never return a target UID.
 */
export async function findFriendByAccountId(db, authAdmin, actorUid, rawAccountId, {
  now = new Date()
} = {}) {
  if (!validUid(actorUid) || typeof db?.doc !== 'function' ||
      typeof db?.runTransaction !== 'function' ||
      typeof authAdmin?.getUser !== 'function')
    throw new Error('Account search unavailable.');
  if (!(now instanceof Date) || !Number.isFinite(now.getTime()))
    throw new Error('Account search unavailable.');
  const sought = normaliseFriendAccountId(rawAccountId);
  const actor = await authAdmin.getUser(actorUid);
  if (actor?.uid !== actorUid || actor.disabled === true)
    throw new Error('Account search unavailable.');
  const nowMs = now.getTime();
  const match = await db.runTransaction(async tx => {
    const actorProfileRef = db.doc('users/' + actorUid);
    const actorAssignmentRef = db.doc('accountIdAssignments/' + actorUid);
    const quotaRef = db.doc('friendLookupThrottle/' + actorUid);
    const [actorProfile, actorAssignment, quota] = await Promise.all([
      tx.get(actorProfileRef), tx.get(actorAssignmentRef), tx.get(quotaRef)
    ]);
    const profileData = documentData(actorProfile);
    const assignmentData = documentData(actorAssignment);
    if (!profileData || !assignmentData ||
        !/^[a-z0-9._-]{3,24}#[0-9]{5}$/.test(assignmentData.accountIdKey || ''))
      throw new Error('Account search unavailable.');
    const actorRegistry = await tx.get(db.doc(
      'accountIdRegistry/' + assignmentData.accountIdKey
    ));
    if (!verifiedActiveIdentity(actorUid, profileData, assignmentData,
      documentData(actorRegistry)))
      throw new Error('Account search unavailable.');
    const quotaData = nextQuota(documentData(quota), actorUid, nowMs);
    const targetRegistrySnap = await tx.get(db.doc('accountIdRegistry/' + sought.key));
    const targetRegistry = documentData(targetRegistrySnap);
    let result = null;
    if (targetRegistry && validUid(targetRegistry.uid) &&
        targetRegistry.alias !== true &&
        targetRegistry.accountIdKey === sought.key &&
        targetRegistry.usernameLower === sought.usernameLower &&
        targetRegistry.accountNumber === sought.accountNumber &&
        (targetRegistry.activeAccountIdKey == null ||
          targetRegistry.activeAccountIdKey === sought.key)) {
      const targetUid = targetRegistry.uid;
      const [targetProfile, targetAssignment] = await Promise.all([
        tx.get(db.doc('users/' + targetUid)),
        tx.get(db.doc('accountIdAssignments/' + targetUid))
      ]);
      const verified = verifiedActiveIdentity(targetUid,
        documentData(targetProfile), documentData(targetAssignment), targetRegistry);
      if (verified && verified.accountIdKey === sought.key)
        result = {uid: targetUid, username: verified.username, accountId: verified.accountId};
    }
    // This is the only database write; all reads precede it. Firestore retries
    // concurrent transactions, so simultaneous guesses cannot bypass quotas.
    tx.set(quotaRef, quotaData);
    return result;
  });
  if (!match) return {found: false};
  try {
    const target = await authAdmin.getUser(match.uid);
    if (target?.uid !== match.uid || target.disabled === true)
      return {found: false};
  } catch {
    return {found: false};
  }
  return {found: true, username: match.username, accountId: match.accountId};
}
