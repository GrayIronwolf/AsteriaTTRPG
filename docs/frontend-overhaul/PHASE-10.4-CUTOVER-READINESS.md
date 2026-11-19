# Phase 10.4 — reversible cutover preparation

This phase creates a **non-deployed** release overlay and rollback manifest. The existing public website is published separately from Firebase Hosting: firebase.json has no hosting entry. Do not invent Firebase Hosting, a new DNS configuration or a second external service.

## Preparation
1. Build the separate Vite frontend using production browser Firebase configuration and existing explicit React feature gates. Compilation does not call live Firebase.
2. Generate pure ESM pricing from the existing canonical UMD source without changing the legacy file. Compare concrete values and legacy inputs against both versions.
3. Stage compiled frontend/index.html as a candidate root index.html, plus immutable compiled assets, in runner temporary storage. Include the old root index.html in rollback/. The current repository root index and its original styles and controllers remain untouched.
4. Hash the candidate files, original entry, key legacy dependencies and every retained react-dist asset. Abort staging if existing website assets conflict, files are missing, or entry URLs are absolute.
5. The release overlay is NOT a full standalone website: the real existing website publisher must support an overlay that retains all old static files, including previously served hashed modules, content, public assets and tools. If the publisher wipes non-uploaded content, the overlay is NOT safe to publish.

## Release blockers
- Authenticated legacy production GM and Player visual comparison was not captured in Phase 10.1. Obtain an authorized redacted comparison, without exporting user secrets or private campaigns.
- Verify the real website publication procedure, its overwrite/delete semantics, CDN/cache invalidation and old-entry URL preservation.
- Confirm live Firebase Functions, indexes and permission rules are compatible with the compiled release. Do not loosen rules to mask a failure.
- Owner must approve the known-good live release identifier, maintenance window, rollback steps and manual publication. Only Phase 10.5 may implement the final entry swap.

## Rollback plan for the user during Phase 10.5
If startup, bookmarks, login, session permissions or asset requests break after the final website publication, stop further changes. Restore the recorded rollback/index.html using the existing website publisher and retain old and new immutable compiled assets. Verify Home, login, Forge, GM dashboard, Player dashboard and scoped account access using authorized test accounts. Do not delete or roll back Firestore data, and never deploy older permissive rules as a routine website rollback.

## Commands and evidence
- npm run site:cutover-phase10-4:pricing
- npm run site:cutover-phase10-4:package-test
- npm run site:build (only with explicit VITE_FIREBASE_MODE=production and the fully tested frontend feature flags)
- npm run site:cutover-phase10-4:stage
- npm run site:cutover-phase10-4:verify

The dedicated CI workflow produces a 30-day temporary release-overlay, rollback/index.html and cutover-manifest.json artifact. No production credentials, publication or deployment are involved. The manual Firebase backend workflow does not need to run for Phase 10.4.
