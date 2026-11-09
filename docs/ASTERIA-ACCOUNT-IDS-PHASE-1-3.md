# Account ID upgrade — Phase 1.3: Permanent profile storage and protection

## Scope
This branch builds on PR #119 (Phase 1.2), without requiring its merge. It adds authenticated account ID finalization, a permanent profile projection, and security rules. No friend-list UI, campaign invitation update, or production activation.

## Storage contract
- Identity display format: `Username#01416`.
- `accountIdAssignments/{uid}` holds the permanent authoritative mapping.
- `accountIdRegistry/{usernameLower}#{accountNumber}` permanently reserves unique combinations.
- `users/{uid}` mirrors `accountId`, `accountNumber`, `accountIdKey`, and `accountIdAssignedAt` for the account UI. These fields are server-only and immutable to browser clients.
- Firebase Authentication UID is the source-of-truth private principal and is never replaced by the public Account ID.
- Username cannot change after Account ID assignment. Existing unassigned profiles retain legacy editable username behavior.
- Different usernames may share a number; same username, ignoring case, may not reuse a number.

## Secure flow
The `asteriaAccountIdentity` callable only accepts `{action:'ensure'}`, derives UID from verified Firebase Auth, checks the account is not disabled, and calls `ensureAccountIdentityProfile`. The server reads the stored username inside one Firestore transaction and creates assignment, registry, and immutable profile fields together. It retries collisions, safely returns existing allocations, and fails closed on mismatched records. No client may choose an account number or target UID.

## Safety and compatibility
The callable checks `ASTERIA_ACCOUNT_IDS_ENABLED==='1'` (off by default). It is not integrated into website registration or sign-in in this phase; existing accounts are not migrated or modified. Browser access is entirely denied to the assignment and registry collections. Profile rule changes protect ID fields and locked usernames while preserving ordinary profile preferences, characters, and dashboard layouts. Nothing enables campaign flags or email sending.

## Verification and release
`npm run test:account-id` executes Phase 1.2 and 1.3 unit suites. `npm run test:firebase` includes a dedicated emulator test of cross-account permissions, immutable fields, legacy compatibility, and transactional collision behavior. The full GitHub CI suite (including lint, production build, emulator, and bundle checks) must pass before merge. Physical login testing and any production Firebase activation require a separately reviewed deployment step; do not enable the flag in Phase 1.3.

## Future phases
Account creation UX, immediate assignment, controlled migration/backfill for existing accounts, account menu, friend lists, username lookup and campaign invitations remain separate work. Do not auto-allocate for legacy accounts until their usernames and ownership are verified.
