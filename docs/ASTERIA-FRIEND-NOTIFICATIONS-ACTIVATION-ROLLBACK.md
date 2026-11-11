# Asteria Friends notifications — staged activation and rollback

## Scope

This update **prepares** activation, but does not execute any production operations. Current deployed Firestore security rules and `asteriaFriendNotifications` remain in place. No Firebase Storage, Hosting, campaigns, Account IDs, email, or Firestore rules are deployed by these jobs.

The existing Workload Identity provider authorizes **only** `.github/workflows/firebase-deploy.yml` on `main`. Use that workflow and the existing `firebase-production` environment. Do not create another GitHub Actions deployment file or change IAM attribute conditions.

The activation package `scripts/friends-notifications-activation-release.mjs` isolates **one** Firebase 2nd Gen callable per operation. Event generation and inbox reads remain independent. All operations require an exact manual confirmation and are disabled until explicitly run.

## Planned sequence (requires separate production approval)

1. **Read-only activation audit.** In GitHub Actions → *Deploy Firebase backend (manual)* → branch `main`, select `friend-notifications-activation-audit`, leave the confirmation empty. The workflow verifies that Firestore rules match the reviewed production version and reports all three current flags: `ASTERIA_FRIEND_REQUESTS_ENABLED`, `ASTERIA_FRIEND_NOTIFICATIONS_ENABLED` on the request callable, and `ASTERIA_FRIEND_NOTIFICATIONS_ENABLED` on the notification callable. No production write is performed. **Do not run this audit until CI succeeds and the preparation PR is merged.**
2. **Read-only endpoint activation (separate approval).** Select `friend-notifications-read-activate` and enter `ACTIVATE-ASTERIA-FRIEND-NOTIFICATION-READS`. This deploys only `asteriaFriendNotifications` with notification reads enabled (`1`). It does **not** generate friend notification events. Backend flags are rechecked after deployment. The approved Firestore rules must still be live; otherwise deployment aborts.
3. **Notification event activation (separate approval).** After the read endpoint is verified, select `friend-notifications-events-activate` and enter `ACTIVATE-ASTERIA-FRIEND-NOTIFICATION-EVENTS`. This deploys only `asteriaFriendRequests` with event emission enabled, retaining its **verified existing** Friends request-enabled flag as `1`. The preflight aborts if the read callable or Friends request handler is not enabled, or if Firestore rules differ.
4. **Website activation (not in this PR).** The website flag `friendNotificationsEnabled:false` in `index.html` **remains disabled**. A later, separately approved website PR must deliberately enable the interface, include updated tests for the site flag, and verify live behaviour with the two existing real accounts. There is no one-click web activation hidden in this deployment workflow. Account Notifications must keep Campaign notifications independently gated.

## Safe rollback after an approved rollout

Reverse the order. First disable the website notification interface through the separately approved website release if it has been enabled. Then run:

- `friend-notifications-events-deactivate` with `DEACTIVATE-ASTERIA-FRIEND-NOTIFICATION-EVENTS` to turn off new event creation. **Preserve the live Friends request-handler availability** so Friends requests do not unexpectedly stop or restart.
- `friend-notifications-read-deactivate` with `DEACTIVATE-ASTERIA-FRIEND-NOTIFICATION-READS`, but only after the request callable's event flag is confirmed to be `0`. The job refuses to disable the read endpoint while event emission remains on.

Rollbacks do not require an exact Firestore rules match (to ensure emergency disablement remains possible), but they still require authenticated main-branch manual approval and isolated one-function deployments. Existing private notification records and canonical relationships are not deleted. The reviewed deny-only Firestore rules remain deployed.

## Server-only safeguards

- Both notification feature flags are independent from Campaign notifications and account identity.
- The event callable writes a recipient-private, deterministic notice inside the same transaction as each valid friendship mutation, not via client Firestore writes.
- The notification callable authenticates the recipient and has bounded rate limits, private cursor validation and idempotent read acknowledgements.
- The activation workflow reads the currently deployed function flags before any write, validates the exact expected target and enabled state, checks reviewed Firestore rules for **activations**, and re-checks deployed flags after each release.
- Operation-specific typed confirmations, project `asteria-ttrpg`, region `us-central1`, Firebase codebase `asteria`, GitHub `main`, Workload Identity and the `firebase-production` environment are all required.
- New release packages contain one function only and no Storage, Hosting, Firestore index or rules resources.

## End-to-end acceptance after activation

Using the two existing accounts on desktop and Android: incoming friend request appears only in the recipient inbox; accept/decline/cancel produces the right neutral actor/recipient notice; removal sends neutral messages without exposing private identities; block/unblock confirmation is **only** visible to the acting account; repeated retries cannot duplicate events; read/unread state survives refresh and device switching; signing out clears previous-account notices; pagination remains stable; all controls remain accessible on mobile. Do not circumvent the existing re-request cooldown to create missing test scenarios. Keep the previously deferred live Remove Friend acceptance pending until an eligible friendship exists.

Automated CI and emulators are necessary but **not equivalent** to these live checks. Neither notification service should be called fully accepted until the live checks pass and the release remains reversible.

## Current result and next action

As of the preparation PR, production Firestore rules and `asteriaFriendNotifications` were successfully deployed in previous separately approved operations, with notification reads **disabled**. This preparation update does not change that state or alter `index.html`. A successful CI result makes the activation controls available; it does not authorize the actual activations.
