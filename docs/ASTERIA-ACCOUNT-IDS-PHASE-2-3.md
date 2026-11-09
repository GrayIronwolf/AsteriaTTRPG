# Phase 2.3 — Registration validation and recovery

## Changes
- Add a required Confirm Password field to the existing registration form, with validation for email, username, name length and passwords before Firebase Auth creates the user.
- Save only a short-lived **session-scoped** pending identity draft (UID, email, username, first/last name) when Firebase Auth creation succeeds. Never store a password or Firebase Auth credential.
- If Firestore profile saving or an enabled Account ID finalisation fails, retain the Auth account; a visible "Finish Account Setup" control can retry on the same authenticated UID.
- Recovery checks the draft belongs to the current Firebase user by UID and email, creates a missing account profile or fills only absent name fields on a matching existing profile, then verifies the canonical read. It never overwrites a different account, an existing username, immutable Account ID fields, characters or membership.
- If account ID issuance was enabled for this registration, recover its ID only after verifying the profile; otherwise recover the ordinary account profile without allocation. Do **not** auto-backfill legacy accounts on every login.

## Safety
The Account IDs website flag remains `accountIds:false`; the backend gate `ASTERIA_ACCOUNT_IDS_ENABLED` is also unchanged and disabled. The new functionality does not deploy Firebase, send emails, allocate existing-account IDs, alter campaigns, or change approved artwork/gameplay. A pending draft is scoped to the current browser tab/session; the original account can always sign in even if recovery cannot complete.

## Verification
`npm run test:account-id` includes phase 2.3 validation and recovery unit/source regressions. GitHub CI must pass audit, lint, full Node test suite, Firebase emulator access tests, build and bundle check before merge. Real device/production Firebase registration testing is separate and not claimed by CI.
