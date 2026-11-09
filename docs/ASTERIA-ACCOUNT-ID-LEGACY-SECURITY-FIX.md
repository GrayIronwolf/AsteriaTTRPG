# Asteria Account ID Security Fix — Legacy Self-Allocation Guard

## Problem
The Phase 4.1 audit found that the authenticated `asteriaAccountIdentity` callable previously invoked the unrestricted profile allocator as soon as `ASTERIA_ACCOUNT_IDS_ENABLED=1`. An existing account could therefore issue its own permanent public ID, bypassing the operator-reviewed legacy backfill. No production feature flags were enabled when this issue was identified.

## Resolution
The callable no longer calls `ensureAccountIdentityProfile` directly. Its only public issuance path now passes through `issueNewRegistrationAccountId` with the server-trusted Firebase Auth user object and a separately configured **canonical UTC Auth creation cutoff**. It rejects:
- Auth users created before `ASTERIA_ACCOUNT_IDS_REGISTRATION_NOT_BEFORE` (the operator-controlled rollout boundary), even if they freshly edit or recreate a Firestore profile.
- Auth users more than 15 minutes old or with missing/invalid/future Auth creation metadata.
- Requests with mismatched UID, disabled account, invalid Auth display name or missing Auth email.
- Profiles whose username or email differ from Auth; these are compared within the same Firestore transaction that creates the assignment and registry.
- Missing or incorrectly formatted cutoff configuration. The original `ASTERIA_ACCOUNT_IDS_ENABLED` gate is unchanged, so both controls must be configured correctly.

The cutoff must **never** be set to a historical registration date as a convenience; configure it at initial approved production activation and preserve it across releases. Legacy UID migration remains **only** via the existing operator-controlled `backfillLegacyAccountIdentity`, which requires manual eligibility review and per-account approval.

The server-issued Firebase Auth `metadata.creationTime` comes from Firebase Admin Auth, not a client-controlled Firestore field. The bound profile username and email come from the server-trusted Auth account, not the caller's requested number or identity.

## Regression coverage
- Unit tests for legacy-account rejection, cutoff absence and format, 15-minute window, clock skew, Auth UID and email mismatch, transactional identity collision, idempotency, and reviewed legacy migration.
- Firestore emulator tests for genuine new-account issuance, immutable owner/profile data, prevented legacy allocation and continued operator-reviewed backfill.
- Phase 4.1 read-only audit now checks the new callable boundary; all existing release gates remain NO-GO without independently verified production evidence.

## Deployment
Nothing in this branch activates `ASTERIA_ACCOUNT_IDS_ENABLED`, `accountIds`, email delivery, campaign notifications, or performs migrations. No Firebase deploy occurs. CI may merge this safe guard after all automated checks pass, but an operational activation still requires real Firebase credentials/flags confirmation, backups, canary testing and approval.

## Known rollout consideration
The 15-minute Auth creation window deliberately errs on the side of refusing late issuance for accounts with partially completed signup. Such accounts require reviewed recovery/backfill. Never extend the window to hours or days without a separate security review because it would weaken the boundary. Auth `displayName` must be set before the callable; registration already attempts this but may fail, in which case the safe behavior is to refuse allocation rather than issue an unverified ID.
