// Phase 2.1 — canonical, PRIVATE Friends relationship record and transition policy.
// Pure data-model functions only: this module exposes no network endpoint, Firestore
// write operation, UI action or campaign membership permission.
const UID = /^[A-Za-z0-9_-]{1,128}$/;
const DAY_MS = 24 * 60 * 60 * 1000;
const PENDING_MS = 14 * DAY_MS;
const RETRY_MS = 7 * DAY_MS;
const QUOTA_MS = DAY_MS;
const PER_DAY = 10;
const STATES = Object.freeze([
  'pending', 'accepted', 'declined', 'cancelled', 'expired', 'removed', 'blocked'
]);
const KEYS = Object.freeze([
  'blockedByUids','createdAtMs','expiresAtMs','nextRequestAtMs','pairId',
  'participantUids','recipientUid','requestCount','requestedAtMs',
  'requesterUid','schemaVersion','status','updatedAtMs','version'
]);

export const FRIEND_RELATIONSHIP_POLICY = Object.freeze({
  schemaVersion: 1,
  pendingExpiryMs: PENDING_MS,
  reRequestCooldownMs: RETRY_MS,
  issueWindowMs: QUOTA_MS,
  maxIssuesPerDay: PER_DAY
});

const invalid = message => { throw new Error(message); };
const validUid = uid => typeof uid === 'string' && UID.test(uid);
const validMs = value => Number.isSafeInteger(value) &&
  value >= 0 && value < 8_639_000_000_000_000;
const validRecord = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const ordered = values => [...values].sort();
const same = (left,right) => left.length === right.length &&
  left.every((value,index) => value === right[index]);
function timeMs(now) {
  const time = now instanceof Date ? now.getTime() : NaN;
  if (!validMs(time) || time > 8_639_000_000_000_000 - PENDING_MS)
    invalid('Invalid friendship timestamp.');
  return time;
}

export function friendPairId(leftUid,rightUid) {
  if (!validUid(leftUid) || !validUid(rightUid) || leftUid === rightUid)
    invalid('A friendship requires two different valid accounts.');
  // A Firebase Auth UID cannot contain "~" under this validated UID scheme.
  // Sorted, delimited IDs are collision-free and stable across username changes.
  return ordered([leftUid,rightUid]).join('~');
}

export function friendRelationshipPath(leftUid,rightUid) {
  return 'friendRelationships/' + friendPairId(leftUid,rightUid);
}

export function assertFriendRelationship(record) {
  if (!validRecord(record) || !same(Object.keys(record).sort(),KEYS) ||
      record.schemaVersion !== FRIEND_RELATIONSHIP_POLICY.schemaVersion ||
      !Array.isArray(record.participantUids) ||
      record.participantUids.length !== 2 ||
      !validUid(record.participantUids[0]) ||
      !validUid(record.participantUids[1]) ||
      record.participantUids[0] >= record.participantUids[1] ||
      record.pairId !== friendPairId(...record.participantUids) ||
      !record.participantUids.includes(record.requesterUid) ||
      !record.participantUids.includes(record.recipientUid) ||
      record.requesterUid === record.recipientUid ||
      !STATES.includes(record.status) ||
      !Array.isArray(record.blockedByUids) ||
      !same(record.blockedByUids,ordered([...new Set(record.blockedByUids)])) ||
      record.blockedByUids.some(uid => !record.participantUids.includes(uid)) ||
      !validMs(record.createdAtMs) || !validMs(record.requestedAtMs) ||
      !validMs(record.updatedAtMs) || record.createdAtMs > record.requestedAtMs ||
      record.requestedAtMs > record.updatedAtMs ||
      !validMs(record.nextRequestAtMs) ||
      !Number.isSafeInteger(record.version) || record.version < 1 ||
      !Number.isSafeInteger(record.requestCount) || record.requestCount < 1)
    invalid('Friendship record requires administrator reconciliation.');

  if (record.status === 'blocked') {
    if (record.blockedByUids.length === 0 || record.expiresAtMs !== null ||
        record.nextRequestAtMs !== 0)
      invalid('Friendship record requires administrator reconciliation.');
  } else if (record.blockedByUids.length !== 0) {
    invalid('Friendship record requires administrator reconciliation.');
  }
  if (record.status === 'pending') {
    if (record.expiresAtMs !== record.requestedAtMs + PENDING_MS ||
        record.updatedAtMs !== record.requestedAtMs ||
        record.nextRequestAtMs !== 0)
      invalid('Friendship record requires administrator reconciliation.');
  } else if (record.expiresAtMs !== null) {
    invalid('Friendship record requires administrator reconciliation.');
  }
  if (record.status === 'accepted' && record.nextRequestAtMs !== 0)
    invalid('Friendship record requires administrator reconciliation.');
  if (['declined','cancelled','expired','removed'].includes(record.status) &&
      record.nextRequestAtMs !== record.updatedAtMs + RETRY_MS)
    invalid('Friendship record requires administrator reconciliation.');
  return true;
}

export function createFriendRequestRecord(requesterUid,recipientUid,{now=new Date()}={}) {
  const pairId = friendPairId(requesterUid,recipientUid);
  const timestamp = timeMs(now);
  const record = {
    schemaVersion: 1,
    pairId,
    participantUids: ordered([requesterUid,recipientUid]),
    requesterUid,recipientUid,
    status: 'pending',
    blockedByUids: [],
    createdAtMs: timestamp,
    requestedAtMs: timestamp,
    updatedAtMs: timestamp,
    expiresAtMs: timestamp + PENDING_MS,
    nextRequestAtMs: 0,
    requestCount: 1,
    version: 1
  };
  assertFriendRelationship(record);
  return record;
}

/**
 * Pure transition proposal for Phase 2.2's future authenticated Firestore
 * transaction. The caller must obtain actorUid from trusted Auth and must
 * compare the expectedVersion inside a transaction on the pair document.
 * This function does NOT create any friendship or permit browser writes.
 */
export function transitionFriendRelationship(record,{
  actorUid,action,expectedVersion,now=new Date()
}={}) {
  assertFriendRelationship(record);
  if (!validUid(actorUid) || !record.participantUids.includes(actorUid))
    invalid('Friendship action unavailable.');
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion !== record.version)
    invalid('Friendship changed. Refresh and try again.');
  const timestamp = timeMs(now);
  if (timestamp < record.updatedAtMs)
    invalid('Invalid friendship timestamp.');
  const requester = actorUid === record.requesterUid;
  const recipient = actorUid === record.recipientUid;
  const pending = record.status === 'pending';
  const expired = pending && timestamp >= record.expiresAtMs;
  const next = {...record,updatedAtMs:timestamp,version:record.version+1};

  switch (action) {
    case 'accept':
      if (!pending || expired || !recipient) invalid('Friendship action unavailable.');
      next.status = 'accepted';
      next.expiresAtMs = null;
      next.nextRequestAtMs = 0;
      break;
    case 'decline':
      if (!pending || expired || !recipient) invalid('Friendship action unavailable.');
      next.status = 'declined';
      next.expiresAtMs = null;
      next.nextRequestAtMs = timestamp + RETRY_MS;
      break;
    case 'cancel':
      if (!pending || expired || !requester) invalid('Friendship action unavailable.');
      next.status = 'cancelled';
      next.expiresAtMs = null;
      next.nextRequestAtMs = timestamp + RETRY_MS;
      break;
    case 'expire':
      if (!expired) invalid('Friendship action unavailable.');
      next.status = 'expired';
      next.expiresAtMs = null;
      next.nextRequestAtMs = timestamp + RETRY_MS;
      break;
    case 'remove':
      if (record.status !== 'accepted') invalid('Friendship action unavailable.');
      next.status = 'removed';
      next.nextRequestAtMs = timestamp + RETRY_MS;
      break;
    case 'block':
      if (record.blockedByUids.includes(actorUid))
        invalid('Friendship action unavailable.');
      next.status = 'blocked';
      next.blockedByUids = ordered([...record.blockedByUids,actorUid]);
      next.expiresAtMs = null;
      next.nextRequestAtMs = 0;
      break;
    case 'unblock':
      if (record.status !== 'blocked' || !record.blockedByUids.includes(actorUid))
        invalid('Friendship action unavailable.');
      next.blockedByUids = record.blockedByUids.filter(uid => uid !== actorUid);
      if (next.blockedByUids.length === 0) {
        // Unblocking never restores an accepted friendship or pending request.
        next.status = 'removed';
        next.nextRequestAtMs = timestamp + RETRY_MS;
      }
      break;
    case 'request':
      if (!['declined','cancelled','expired','removed'].includes(record.status) ||
          timestamp < record.nextRequestAtMs ||
          record.blockedByUids.length !== 0 ||
          record.requestCount >= Number.MAX_SAFE_INTEGER)
        invalid('Friendship request unavailable.');
      next.status = 'pending';
      next.requesterUid = actorUid;
      next.recipientUid = record.participantUids.find(uid => uid !== actorUid);
      next.requestedAtMs = timestamp;
      next.expiresAtMs = timestamp + PENDING_MS;
      next.nextRequestAtMs = 0;
      next.requestCount = record.requestCount + 1;
      break;
    default:
      invalid('Friendship action unavailable.');
  }
  assertFriendRelationship(next);
  return next;
}

/** Rate-policy primitive; Phase 2.2 must update one sender quota doc in the
 * same Firestore transaction as creation/renewal of the canonical pair doc. */
export function nextFriendRequestIssueQuota(previous,actorUid,{now=new Date()}={}) {
  if (!validUid(actorUid)) invalid('Friendship request unavailable.');
  const timestamp = timeMs(now);
  if (previous != null &&
      (!validRecord(previous) ||
       !same(Object.keys(previous).sort(),[
         'issued','uid','updatedAtMs','windowStartMs'
       ]) ||
       previous.uid !== actorUid || !validMs(previous.windowStartMs) ||
       !validMs(previous.updatedAtMs) || previous.windowStartMs > previous.updatedAtMs ||
       previous.updatedAtMs > timestamp ||
       !Number.isSafeInteger(previous.issued) ||
       previous.issued < 1 || previous.issued > PER_DAY))
    invalid('Friendship request quota requires administrator reconciliation.');
  const inWindow = previous && timestamp - previous.windowStartMs < QUOTA_MS;
  const issued = inWindow ? previous.issued : 0;
  if (issued >= PER_DAY) invalid('Daily friend request limit reached.');
  return {
    uid: actorUid,
    windowStartMs: inWindow ? previous.windowStartMs : timestamp,
    issued: issued + 1,
    updatedAtMs: timestamp
  };
}
