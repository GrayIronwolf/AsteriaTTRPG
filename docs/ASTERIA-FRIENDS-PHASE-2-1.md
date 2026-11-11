# Asteria Friends — Phase 2.1 canonical relationships, state transitions and rules

**Baseline:** Production `main` at `62f154ca122792e1ef28ded59006ac96f600afcc`. **Scope:** Data model, server-only Firestore Rules declarations and tests only. No callable, live friendships, UI friend buttons, migration, deployment, new Firebase project, campaign access or website feature flag.

## Canonical pair and persistence

- Collection: `friendRelationships/{pairId}`, with `pairId = [lowerSort(uidA,uidB)].join('~')`. Only validated Firebase Auth UID strings can form a pair: `[A-Za-z0-9_-]{1,128}`, and two UIDs must differ. The separator is not a permitted UID character, making pair keys deterministic and collision-free. **Never use editable username or five-digit Account ID as a relationship key.**
- **One record per unordered UID pair**. This is a single document, not a mirrored friendship in two users' profiles. Phase 2.2 will require a Firestore transaction and compare-and-swap `version` checks, and will reject simultaneous duplicate requests or stale responses.
- Schema v1 exact fields: `schemaVersion`, `pairId`, `participantUids` (two sorted UIDs), `requesterUid`, `recipientUid`, `status`, `blockedByUids` (sorted unique participating UIDs), `createdAtMs`, `requestedAtMs`, `updatedAtMs`, `expiresAtMs` (nullable), `nextRequestAtMs`, `requestCount`, `version`. All timestamps are integer UTC epoch milliseconds, enforced for consistency; timestamps and counters are server-generated, never client-controlled.
- No email, personal name, profile photo URL, public Account ID, secret, invitation credential, campaign membership, login details, or other private identity data is persisted on the relationship document.
- Relationship records and request quotas are **Admin-only**: `firestore.rules` explicitly denies `get`, `list`, `create`, `update`, and `delete` to all browser users, including both participants. Neither user can fetch a blocked relationship or write acceptance/blocks. The new `friendRequestIssueThrottle/{uid}` collection is also entirely private.

## State machine and who may transition

| Current | Action | Actor | Result |
|---|---|---|---|
| no record | request | sender | pending record (in Phase 2.2; no database writes yet) |
| pending, not expired | accept | recipient only | accepted |
| pending, not expired | decline | recipient only | declined |
| pending, not expired | cancel | requester only | cancelled |
| pending, expired | expire | participant through future authenticated server action | expired |
| accepted | remove | either participant | removed |
| any status not already blocked by actor | block | either participant | blocked; maintain all blocking parties |
| blocked | unblock | blocking party only | remains blocked if other party still blocking; otherwise removed |
| declined, cancelled, expired, removed | request | either participant after cooldown | pending, requester/recipient updated |

- **Pending expiry** is exactly 14 days from `requestedAtMs`. At or after expiry, accept/decline must fail; the request can transition to `expired`.
- **Re-request cooldown** is 7 days following decline, cancel, expiry or removal, including when the final blocker unblocks. Reversal of request direction is allowed *after* cooldown. An accepted relationship or any blocked relationship cannot be re-requested.
- **Blocking is symmetric for contact prevention but participant-specific for unblocking.** Either party can block, including when the relationship is already blocked by the other; the set of blockers is recorded privately. Unblocking one participant cannot remove another participant's block. Unblocking the last block **does not** recreate an accepted friendship: status becomes `removed` and cooldown applies.
- **No self-friending.** Each pair must consist of two distinct UIDs. The state machine rejects unrecognised actions, inconsistent records, nonparticipants, earlier timestamps, stale versions and forged fields.
- The immutable pair key and `createdAtMs` remain intact. The request sender can change on an eligible re-request; only server-controlled transition logic changes the status. The first request sets `requestCount=1`, increments by one on each subsequent request, and fails closed on counter overflow.

## Request throttling and concurrency

- Sender quota namespace: `friendRequestIssueThrottle/{senderUid}`, exact fields `uid`, `windowStartMs`, `issued`, `updatedAtMs`.
- **10 newly sent/re-sent requests per sender in a rolling 24-hour window.** This is the default policy for Phase 2.2; it can be reviewed before activation. The helper is fail-closed if the existing quota document is inconsistent or seems forged.
- Phase 2.2 must **read and write quota and pair record in the same Firestore transaction**. A failed/duplicate/blocked request must not increment quota or create another pair. Transaction retries must enforce limits under concurrent requests. Authentication and target UID resolution remain server-side and cannot trust browser-supplied UIDs.
- Signed-in users should eventually see only *sanitised* request summaries through scoped callables. Do **not** relax client Firestore rules or expose the `blockedByUids` field, including to either participant.
- For a daily quota, `windowStartMs` denotes a fixed 24-hour window starting with the first request; it is reset on first request after that window. This is not a sliding count of individual requests.

## Phase 2.1 tests and completion criteria

- Pure model tests: exact pair uniqueness and ordering, schema integrity, recipients-only acceptance, requester-only cancellation, expiration boundary, 7-day cooldown, re-request direction, independent blockers/unblockers, denied actions, stale versions, invalid identity, and 10-per-day quotas.
- Firebase emulator tests: anonymous, sender, recipient and unrelated accounts are all denied reading, listing, creating, updating and deleting relationship or request-quota documents; Admin SDK can create and atomically advance the canonical pair.
- Full repository CI still covers existing accounts, username changes, Account ID lookup, campaigns, build and Firebase deployment checks. No data migrations.
- The update is documentation and server-side primitives only. **No existing production records are written.** Firestore rules may be deployed only after reviewed/scoped approval, and current Firestore default-deny already prevents browser access to these previously nonexistent namespaces.

## Phase 2.2 prerequisites

1. Implement callable actions for authenticated send/accept/decline/cancel and concurrency-safe quota checks; defer remove/block/unblock UI to Phase 3 as planned.
2. Resolve exact Account ID to immutable UID inside a trusted server transaction; never rely on a UID supplied by the browser.
3. Enforce request cooldowns, blocking, expiry and recipient identity independent of the browser. No automatic campaign memberships or direct friendships based merely on search.
4. Add production feature gates, a scoped authenticated deployment path via the already trusted workflow, emergency rollback and two-account user acceptance.
5. Do not begin Phase 2.2 until explicitly requested.
