import { randomInt } from 'node:crypto';

// Phase 1.2: server-only allocator. Do not expose a callable or copy the result
// into the owner-writable users/{uid} profile until Phase 1.3 protects it.
const USERNAME_PATTERN = /^[A-Za-z0-9._-]{3,24}$/;
const UID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const NUMBER_PATTERN = /^\d{5}$/;
export const ACCOUNT_ID_ALLOCATION_ATTEMPTS = 32;

export function normaliseAccountUsername(rawUsername) {
  const username = typeof rawUsername === 'string' ? rawUsername.trim() : '';
  if (!USERNAME_PATTERN.test(username)) {
    throw new Error('Username must be 3-24 letters, numbers, dots, underscores or hyphens.');
  }
  return { username, usernameLower: username.toLowerCase() };
}

export function validAccountNumber(value) {
  return typeof value === 'string' && NUMBER_PATTERN.test(value);
}

export function randomAccountNumber() {
  return String(randomInt(0, 100_000)).padStart(5, '0');
}

function identityFromAssignment(uid, usernameLower, assignment, registry) {
  const data = assignment.data() || {};
  const storedNumber = data.accountNumber;
  const storedUsername = data.username;
  if (data.uid !== uid ||
      !validAccountNumber(storedNumber) ||
      typeof storedUsername !== 'string' ||
      !USERNAME_PATTERN.test(storedUsername) ||
      storedUsername.toLowerCase() !== usernameLower ||
      data.usernameLower !== usernameLower ||
      data.accountId !== `${storedUsername}#${storedNumber}` ||
      data.accountIdKey !== `${usernameLower}#${storedNumber}` ||
      typeof data.createdAt !== 'string' ||
      !registry.exists ||
      registry.data()?.uid !== uid ||
      registry.data()?.usernameLower !== usernameLower ||
      registry.data()?.accountNumber !== storedNumber ||
      registry.data()?.accountIdKey !== data.accountIdKey ||
      registry.data()?.accountId !== data.accountId) {
    throw new Error('Existing Account ID requires administrator reconciliation.');
  }
  return {
    username: storedUsername,
    accountNumber: storedNumber,
    accountId: data.accountId,
    alreadyAssigned: true
  };
}

/**
 * Reserve a permanent Username#00000 identity using Firestore transactions.
 * Each normalized username has its own five-digit namespace; display casing
 * is retained. The caller MUST bind uid to verified Firebase Auth and obtain
 * the username from a trusted server-side account-creation flow. Never pass
 * an arbitrary browser-supplied username directly to this privileged writer.
 *
 * The assignment and unique registry are written in the same transaction.
 * No users/{uid} document, membership, email, or client configuration changes.
 */
export async function reserveAccountIdentity(db, uid, rawUsername, options = {}) {
  if (typeof uid !== 'string' || !UID_PATTERN.test(uid)) {
    throw new Error('Sign in to continue.');
  }
  if (!db || typeof db.doc !== 'function' || typeof db.runTransaction !== 'function') {
    throw new Error('Account ID database is unavailable.');
  }
  const { username, usernameLower } = normaliseAccountUsername(rawUsername);
  const nextNumber = options.nextNumber || randomAccountNumber;
  const now = options.now instanceof Date ? options.now : new Date();
  if (!Number.isFinite(now.getTime())) throw new Error('Invalid allocation timestamp.');
  const createdAt = now.toISOString();
  const assignmentRef = db.doc(`accountIdAssignments/${uid}`);

  for (let attempt = 0; attempt < ACCOUNT_ID_ALLOCATION_ATTEMPTS; attempt += 1) {
    const accountNumber = nextNumber();
    if (!validAccountNumber(accountNumber)) {
      throw new Error('Account number generator returned an invalid value.');
    }
    const accountId = `${username}#${accountNumber}`;
    const accountIdKey = `${usernameLower}#${accountNumber}`;
    const registryRef = db.doc(`accountIdRegistry/${accountIdKey}`);

    const outcome = await db.runTransaction(async tx => {
      const assignment = await tx.get(assignmentRef);
      if (assignment.exists) {
        const stored = assignment.data() || {};
        if (!validAccountNumber(stored.accountNumber) ||
            typeof stored.usernameLower !== 'string' ||
            stored.usernameLower !== usernameLower) {
          throw new Error('An Account ID is already assigned to this account.');
        }
        const existingRegistry = await tx.get(db.doc(
          `accountIdRegistry/${usernameLower}#${stored.accountNumber}`
        ));
        return identityFromAssignment(uid, usernameLower, assignment, existingRegistry);
      }

      const registry = await tx.get(registryRef);
      if (registry.exists) return null; // Collision; retry with a fresh random number.
      tx.create(registryRef, {
        uid, usernameLower, accountNumber, accountId, accountIdKey, createdAt
      });
      tx.create(assignmentRef, {
        uid, username, usernameLower, accountNumber, accountId, accountIdKey, createdAt
      });
      return { username, accountNumber, accountId, alreadyAssigned: false };
    });

    if (outcome !== null) return outcome;
  }
  throw new Error('No Account ID could be reserved. Please retry later.');
}
