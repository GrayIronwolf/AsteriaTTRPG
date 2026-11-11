# Asteria Friends notifications — controlled Firebase release

## Scope and non-goals
Target the existing `asteria-ttrpg` production project and Gen 2 Cloud Functions in `us-central1`. This release is only for:
- the preexisting `friendNotificationInbox/{uid}/items/{notificationId}` and `friendNotificationAccessThrottle/{uid}` Firestore **deny** rules, in the default database
- the single `asteriaFriendNotifications` Cloud Function with `ASTERIA_FRIEND_NOTIFICATIONS_ENABLED=0`.

Do not deploy Firebase Storage or Storage rules (that is a different service from Firestore), Firestore indexes, Hosting, email, account identity, campaigns, `asteriaFriendRequests`, or any broad `functions,firestore,storage` deploy. No data migration and no new Firebase project.

## Why two separate deployments
The existing manual `.github/workflows/firebase-deploy.yml` has a generic deployment which would change unrelated services, and single-callable Friends request deployments only. Neither is appropriate for these new features. The new `friends-notifications-deploy.yml` creates independently confirmed, narrow, disabled-by-default operations.

## Existing Workload Identity requirements
The existing `firebase-production` GitHub environment must expose `FIREBASE_WORKLOAD_IDENTITY_PROVIDER` and `FIREBASE_DEPLOY_SERVICE_ACCOUNT` to the GitHub Actions workflow. The service account requires enough permission to read Firestore rules releases and ruleset source, deploy only Firestore rules in the default database, deploy a Gen 2 Cloud Function and inspect that Function's runtime flags. A failed inventory or unavailable rules content is a blocker, not permission to skip the check.

## Manual sequence after PR and CI are successful
Open **GitHub → GrayIronwolf/AsteriaTTRPG → Actions → Deploy Friends notification backend (manual, scoped) → Run workflow** and choose branch `main`.

1. Choose **inventory** and leave confirmation blank. This is read-only and reports the Firebase project/function inventory, as well as whether the live Firestore rules are the exact reviewed pre-notification rules or already include the approved additions. Any drift halts the rules release. Do not continue until the inventory succeeds.
2. Choose **friend-notifications-rules-deploy**, with confirmation `DEPLOY-ASTERIA-FRIEND-NOTIFICATION-RULES`. The job runs tests, retrieves the published Firestore ruleset through the Firebase Rules API, requires an exact match to the reviewed baseline, stages **only** `firestore.rules`, runs `firebase deploy --only firestore:rules`, and verifies the published rules match the approved source. An already-approved production ruleset results in no deployment.
3. Choose **friend-notifications-callable-deploy**, with confirmation `DEPLOY-ASTERIA-FRIEND-NOTIFICATIONS-OFF`. It stages a private, one-function Firebase package, runs tests and deploys `functions:asteria:asteriaFriendNotifications` only. The job checks the published `ASTERIA_FRIEND_NOTIFICATIONS_ENABLED` value is exactly `0`.
4. Review each GitHub run's green status and summary before considering anything active. If there is a failure, **stop** and capture the failed step; do not run the generic `deploy` operation as a workaround.

## Rules baseline and rollback
The reviewed rules delta is exactly the two server-only blocks for `friendNotificationInbox` and `friendNotificationAccessThrottle`. The staged `firebase.json` includes a rules file only (no indexes). The release helper derives the pre-notification baseline by removing only those exact blocks from the committed approved rules. The production rules source is fetched in memory from the Firebase Rules API, compared byte-for-byte, and never committed. This prevents overwriting unknown live security changes. A drift result requires reconciliation with the exact live rules before another release.

The rules are deny-only and do not grant new user access. Never remove these denies as an operational rollback without first considering any active data. The safe application rollback is to keep the server notifications flag disabled and maintain the browser's `friendNotificationsEnabled:false`.

## Not activated yet
This step does **not** activate events or display notifications in the live account menu. The separate `asteriaFriendRequests` request backend would also need a reviewed redeploy with matching notification-event settings for changes to create notices, plus a specifically approved website flag change. Before approving that later work, verify both existing accounts, mark-read idempotence, event deduplication, block privacy, mobile/desktop focus, authenticated account switching and the pending Phase 3.2 Remove Friend scenario. Neither that activation nor Firebase Storage is within this release.

## Checks
- `npm run test:friends-notifications-release`
- `npm test`
- `npm run test:firebase`
- `npm run lint`
- `npm run content:check`
- `npm run build` and production artifact parity.

The GitHub connector can review and merge this workflow, but its installed API does not expose a new manual workflow-dispatch action. Consequently, the deployment operations must be started by an authorized user through GitHub Actions and verified from their runs. Merging the workflow alone does **not** deploy anything.
