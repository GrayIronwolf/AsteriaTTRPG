# Account IDs — Phase 1.2: Secure allocation

## Scope
Backend-only allocator on baseline `a1eef651ce2849c5b01377dbb08eee88a5e7b05d`. No Cloud Function export, frontend invocation, profile schema change, Firestore rule change, database migration, deployment, or friend-list functionality.

## Identity contract
- Display `Username#00000` through `Username#99999`.
- Username is 3–24 ASCII letters, digits, dots, underscores, or hyphens, with surrounding whitespace trimmed.
- Uniqueness is case-insensitive for username and exact for the five-digit suffix.
- Username display case remains intact and the Firebase Auth UID stays the private authoritative account key.
- The allocated pair is immutable; changing usernames requires a future separately designed migration.

## Transactional reservation
`functions/accountIdentity.mjs` uses Node `crypto.randomInt(0, 100000)` and pads to five digits. It tries at most 32 candidates. Each transaction checks `accountIdAssignments/{uid}` and `accountIdRegistry/{usernameLower}#{accountNumber}` before atomically creating both. Collisions trigger a retry. Repeats return validated existing assignments; inconsistent or missing registry records fail closed.

## Security and rollout
This module is not callable from the live website. Its caller in a future phase MUST derive UID from trusted Firebase Auth and obtain a verified username through a trusted creation path; never permit a browser-provided username to control the privileged registry. Existing `users/{uid}` profile fields are owner-writable and are not trusted for identity enforcement. Both new collections remain non-readable and non-writable by Firestore browser SDK clients under existing default-deny rules. Nothing touches existing accounts, membership, email, invitations, or production settings.

## Phase 1.3 prerequisites
Define reliable authenticated profile creation, reconcile existing accounts, protect immutable account identity fields in `users/{uid}`, safely migrate/backfill legacy profiles, and add Firebase emulator security and concurrency regression tests before any feature activation or deployment.

## Verification
Run `npm run test:account-id` for thirteen transaction/identity unit tests. GitHub CI runs this through `npm test`; full Firebase emulator and production tests are separate gates.
