# Asteria Friends Notifications — Website Activation (Prepared, Unpublished)

## Release boundary

This pull request prepares the **website** to display the private Friends notification inbox on Account → Notifications. It must **remain unmerged until the owner separately approves publication**. The website is served independently of Firebase Hosting, and this PR does not deploy Firestore, Firebase Storage, Cloud Functions, Hosting, or any Firebase security rules.

Already completed in the existing production project `asteria-ttrpg`:
- Approved private Firestore deny rules are live.
- `asteriaFriendNotifications` was deployed in `us-central1` with the notification read flag enabled by GitHub Actions #51.
- `asteriaFriendRequests` was updated in `us-central1` with event production enabled, while preserving Friends request availability, by GitHub Actions #52.

These are production deployment verifications, **not** evidence that real account notifications have passed end-to-end testing.

## Changes

- Enable only `friendNotificationsEnabled:true` in the immutable client feature flags. Keep the unrelated Campaign notification, campaign permissions, and existing Friends search/request canary controls unchanged.
- Version the five Account/Friends notification entry scripts together to ensure cached browsers do not run a mixture of older and newer code.
- Use the already implemented private callable for listing 25 notifications per page, marking as read, and opening the relevant Friends tab.
- Preserve session-change cancellation, generic private notice text, unread indicator, 44px mobile touch targets, keyboard-native buttons, accessible status updates, and responsive layout.
- Update the old tests that expected the web flag to remain false; add explicit website release regression coverage.
- Decouple backend-only packaging and Firestore-rule checks from the browser flag so **future emergency backend rollback remains available** after the website is published.

## Approval and verification

1. Require a green pull-request CI run: production dependency audit, content checks, lint, complete Node tests including `test:friends-notifications-website`, Firebase emulator tests, production build and generated asset consistency.
2. Before approving merge, inspect the latest live backend flags via **read-only** `friend-notifications-activation-audit`. Confirm `ASTERIA_FRIEND_REQUESTS_ENABLED=1` and the notification flags on **both** callables are `1`; require the approved Firestore rules to be published.
3. Only after a **separate explicit instruction to publish/merge** this PR, merge the tested website source. Independently verify that the actual live website serves the new flag and script references. A GitHub merge by itself is not proof the website was published.
4. With both of the user's existing authenticated accounts, test request received, accept, decline, cancel, remove when eligible, private block/unblock acknowledgements, persistent read/unread state, unread header, pagination, and cross-account sign-out on Android and desktop.
5. Confirm that Campaign notifications remain independently disabled and no new direct browser access to notification Firestore collections is possible.

## Rollback

If the live website notification UI is faulty, revert the single website feature flag to `false` in a reviewed website-only release and restore matching cached asset versions. The two backend feature flags can be disabled separately via the already-approved one-callable workflows, **event creation first**, then inbox reads. Do not remove Firestore deny rules or delete notification documents. The backend rollback process must not require the website flag to remain off.

## Current state

Preparation only. The new website flag is **true on this PR branch**, not in deployed production. No Firebase function, Firestore/Storage rule, or website publication takes place until the separate release approval.
