# Phase 4.2 — React Account Profile and Settings

## Scope and isolation

- Migrated the existing Account, My Profile and Account Settings hash URLs to one authenticated React-owned Account page. The existing live website remains unchanged until the approved final cutover.
- Reuses Phase 4.1's one Firebase App/Auth/Firestore/Functions client and the existing Firebase Storage bucket; the emulator preview explicitly uses the local Auth, Firestore and Storage emulators.
- The browser may edit only first/last names using the existing strict validator and owner-scoped transaction. UID, username and permanent Account ID fields are not browser-writable. A username change requires the existing gated `asteriaAccountUsername` callable and validates the final server-read ID.
- Account ID copy is available only when all four canonical server ID fields have been verified. No ID is derived from a username or cached record.
- Profile pictures are prepared by cropping a user-selected PNG/JPG/WEBP (maximum 4 MB input) to 512×512 WEBP (maximum 2 MB upload) and stored only at `users/{uid}/profile/avatar`. Reads, uploads, and removals check the current Auth UID, and Firestore is updated with the existing `avatarUpdatedAt` metadata.
- Password reset and email-verification checks are bound to the currently signed-in Firebase account. There are no new password collection forms in the authenticated account area.
- Account appearance has a manual cloud Load, Apply to browser, and Save browser to cloud flow. Save uses the existing `users/{uid}/settings/appearance` revision model. A stale revision is not silently overwritten. Local-only Appearance settings remain available to guests.
- Friends, notifications, GM/Player dashboards, private campaigns, character data and all other unconverted routes stay fail-closed. No Firebase rules, live data, Cloud Functions or hosted production files are changed.

## Acceptance

- Source/contract tests for ownership, Account ID verification, editable field restrictions, avatar validation, cloud revision conflicts and protected route isolation.
- Auth/Firestore/Storage emulator browser acceptance covers registration, authenticated My Profile, personal name editing, account sections, logout and session restoration. Account ID/username callable operations remain disabled in emulators where Functions are intentionally not started; no success is falsely claimed for that gated operation.
- All earlier React/CSS/JS/Compendium/browser tests, repository lint, security emulators, production build and committed bundle parity must pass before merging.
