# Asteria Account IDs — Phase 3.2: My Profile and Account ID Display

## User experience
The Phase 3.1 Account dropdown now includes **My Profile**, ahead of the existing Account Settings and Log Out items. My Profile opens a read-only, accessible dialog showing the authenticated account's name, username, email and Account ID. A Copy Account ID control appears for assigned, validated IDs; Refresh Profile rereads Firestore. Mobile and desktop share the same dialog and current menu structure.

## Identity verification boundary
The UI does **not** create, backfill, regenerate or guess Account IDs. To display an ID, the client must use `window.AsteriaFirebase.readAccountProfileForDisplay()`, which calls `getDocFromServer(users/{authenticated UID})`, not a cached local profile. Firestore rules deny client edits to assigned identity fields; the frontend checks UID ownership, case-insensitive username key, precise five-digit suffix (including zeros), complete immutable fields and canonical assignment timestamp. The UI never reads the private account ID registry or directory.

This is a *server-read profile validation*, not an independent cross-check of the server-only assignment and registry records. Registry audit remains a server-side capability. If the profile is missing, offline, incomplete or inconsistent, no Account ID can be copied. The dialog clearly distinguishes not assigned, verification required and unavailable.

The account ID is revalidated by a fresh server read immediately before copying. Profile requests are discarded after account changes, sign-out or modal closure. No account ID, email or UID is written into browser storage or logs by this display feature.

## Rollout and privacy
The website `accountIds:false` and server-side `ASTERIA_ACCOUNT_IDS_ENABLED` flag are unchanged and disabled. Existing accounts without an ID see **Not assigned**. This phase does not activate allocation, migrate users, create friend lists, modify campaigns, alter gameplay or deploy Firebase. Account Settings and Log Out remain unchanged.

## Verification
`npm run test:account-profile` includes identity validation, leading zeroes, pending states, mismatch protection and source integration checks, and is invoked by the existing full `npm test`. GitHub CI must pass audit, lint, all tests, Firebase emulator tests, production build and bundle comparison before merging. Real-device authenticated UX and production deployment remain separate.
