# Asteria Account IDs — Phase 2.1: Registration Integration

## Context
Phase 1.2 allocator and Phase 1.3 immutable profile projection are implemented in stacked PRs #119 and #120. This update builds exclusively on Phase 1.3 and integrates the new-account registration path. It does not merge earlier PRs, alter the existing account menu, migrate old accounts, add friend lists, or change campaign invitations.

## Flow
1. The existing Create Account form validates the user's chosen 3–24-character username and credentials, then creates the Firebase Auth account.
2. The app updates the Auth display name and writes the initial Firestore user profile, retaining the existing sign-up fallback if this fails.
3. **Only when `window.AsteriaFeatureFlags.accountIds === true`**, and only if the initial Firestore profile write succeeded, the app calls `asteriaAccountIdentity` with exactly `{action:'ensure'}`. No UID, username or desired number is sent from the browser. The authenticated backend derives UID, reads the canonical profile username, and atomically reserves the unique five-digit suffix.
4. The app verifies the callable response and independently rereads the canonical Firestore profile before updating its local session with `accountId`, `accountNumber`, `accountIdKey`, and `accountIdAssignedAt`.
5. Errors do not pretend an Auth account was rolled back. The user gets a clear pending-ID warning and retains the created account; later account-recovery/backfill is separate work.

## Default-disabled rollout and security
The frontend feature flag `accountIds:false` is committed and the server's `ASTERIA_ACCOUNT_IDS_ENABLED` remains disabled by default. Both independent gates must be enabled through separately approved deployment processes. No production Firebase deploy or live email sending is performed in this phase. Firestore rules continue preventing client forgery of Account IDs. Existing accounts are **not** automatically allocated IDs on sign-in or restored sessions; this is intentionally a new-registration integration only.

## Verification
`npm run test:account-id` includes Phase 2.1 helper/source regressions and the existing Phase 1 unit suites. GitHub's standard workflow also runs lint, `npm test`, Firebase emulator authorization tests, production build, and bundle consistency. Tests passing in CI do **not** demonstrate real-device registration against production Firebase: that requires a separate, reviewed canary with backend/website flags deliberately enabled.

## Remaining
Phase 2.2 and later updates must address safe legacy assignment, recovery of partially created accounts, account menu/display, and campaign/friend discovery without exposing private email addresses or breaking established logins.
