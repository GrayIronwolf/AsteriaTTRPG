# Asteria campaign backend: staged deployment controls

This change only prepares the GitHub release workflow; it does **not** deploy to Google Cloud, edit production Firebase Security Rules or indexes, run Firestore migrations, enable feature flags, or send campaign email.

## Motivation
As of 9 November 2026, Google Cloud production inventory from the authenticated GitHub audit listed only the legacy `asteriaAction` and `asteriaInvite` Cloud Functions. The source defines additional campaign functions. The existing manual `deploy` operation deploys functions, Firestore and Storage rules as one broad release, which should not be used simply to stage campaign backend code.

## New opt-in workflow operations
- `campaign-backend-inventory`: read-only Google Cloud Functions listing in `asteria-ttrpg`/`us-central1`. Requires the protected `firebase-production` environment and main branch; it never changes production. It prints function names/status only, not user data.
- `campaign-backend-deploy`: **not for immediate use**. Protected manual operation requiring both the exact `DEPLOY-ASTERIA-CAMPAIGN-BACKEND` confirmation and the GitHub `firebase-production` environment. Requires successful dependency/security audit, full unit tests and Firebase emulator tests. Uses Firebase CLI `--only` for **five new callables**: `asteriaCampaignUCN`, `asteriaMembershipPreparation`, `asteriaCampaignAccessCutover`, `asteriaCampaignJoinRequest`, and `asteriaCampaignJoinReview`. It does not include the legacy `asteriaAction` or `asteriaInvite`, and does not include Firebase Security Rules, Storage rules, indexes, website assets, secure-invitation/email/notification functions, or data migration.
- The original `auth-check`, `backup-audit`, and broad `deploy` operations are preserved; default operation remains read-only `auth-check`.

## Important dependencies before any production invocation
1. Independently compare the currently deployed Firestore/Storage Security Rules and indexes with source, and check that no endpoint requires a newer rule to be safe.
2. Verify the five new callables' permissions and server flag configuration on the target release. Do not enable any flags for staging.
3. Verify the Firebase CLI selects only the intended functions; codebase is `asteria` in `firebase.json`.
4. Perform a formal production go/no-go and human approval, including a rollback/recovery plan. This workflow is **not** approval, and the broad deploy option must not be used as a substitute.
5. Run a private authenticated canary with distinct GM/player accounts; v2 migration/cutover must not be triggered automatically.

## Test coverage
`scripts/firebase-campaign-deploy-scope.test.mjs` guards the read-only inventory and five-callable scope, trigger and production confirmation. It is included in `npm run test:firebase-auth-check`, which runs in the existing full test suite.

## Intentionally deferred
- Firestore rules/indexes/storage-rule deployment
- Secure invitation and email/notifications deployment
- Migration, cutover and legacy data rewriting
- Website/backend feature activation
- Live campaign creation, player joins and email delivery

The Phase 8.3 rollout guidance remains NO-GO for public activation until real production evidence has been independently reviewed.
