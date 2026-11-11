# Asteria Friends — Phase 4.3 Reliability & Responsive Acceptance

## Implementation boundaries
Phase 4.3 hardens the existing Phase 4.1/4.2 social notification service and its account interface. It does **not** introduce another Firebase project, modify campaign notification rollout, change approved artwork, provide friendship permissions, or enable live social notifications.

## Reliability safeguards
1. **Deterministic, transactional events.** Every social event derives its identifier from the private recipient, relationship identity, revision and kind. Duplicate creation fails the transaction; repeat acknowledgements return the original timestamp without a second write. A new revision creates a distinct notice. Friendship re-issue after expiry may advance by two canonical revisions.
2. **Stable pagination.** The server orders by creation time descending and document ID descending for deterministic ordering when many events share exactly the same timestamp. Cursor checks are recipient-private; wrong-account or deleted cursors fail closed. The client navigates with only server-issued opaque ID cursors, restores page one on refresh and blocks repeated pagination while a request is in flight.
3. **Recipient-bound limits.** `friendNotificationAccessThrottle/{uid}` is a new server-only document. In a 10-minute rolling window, a recipient can make up to 120 list calls and 180 mark-read calls. A separate Firestore transaction atomically charges each authenticated request; unlimited repeated reads are not permitted. The window resets automatically. Invalid quota documents fail closed and require operator reconciliation. This service neither shares nor changes campaign notification quotas.
4. **Account isolation.** The rendered social inbox clears on the existing authentication-change and sign-out events. The prior view becomes hidden immediately, with old rows, unread markers and page cursors erased. Out-of-order async responses are discarded using both the account identity and a session revision. New account sessions must create a fresh view and fetch its own page; no browser persistence is used.
5. **Failure handling.** Disabled server and website flags fail closed. UI shows neutral messages for unavailable notification reads or acknowledgements, with a distinct rate-limit explanation but no private identifiers. No client may write Firestore notification or rate-limit documents.
6. **Responsive and accessible.** Preserve Asteria's existing colors and controls; buttons maintain 44px minimum touch height, stack on narrow screens, use native keyboard behavior and accessible status/list/unread semantics. Do not introduce motion that violates reduced-motion preference.

## Verification
- `npm run test:friends-phase4-3`: quotas, malformed inputs, deterministic same-timestamp pagination, stale/wrong-recipient cursors, repeat reads, duplicate delivery, old-account dismissal and mobile/accessibility assertions.
- `npm run test:firebase`: Firestore emulator verifies browser denial of both inbox records and the new throttle namespace, including other users and anonymous clients.
- Existing full test suite, lint, content check, production build, isolated release checks and committed-bundle parity must pass before merge.
- CI success is **not** a substitute for real authenticated Android and desktop usability testing. Screen-reader and physical touch acceptance must be marked pending until performed.

## Controlled release — no automatic deployment
Before activation, the operator must:
1. Review the new `friendNotificationAccessThrottle` deny rule and existing inbox deny rules for a **scoped rules-only** deployment.
2. Prepare a reviewed **notification-callable-only** deploy for `asteriaFriendNotifications` and an **independently reviewed request-callable** deployment for `asteriaFriendRequests` with identical `ASTERIA_FRIEND_NOTIFICATIONS_ENABLED` settings. Prior production builds have the notifications option disabled by default; a notification callable alone will not generate events.
3. Inspect exact Cloud Function names, region and permissions using the existing trusted GitHub OIDC environment; never use the broad `deploy` operation for these changes. Keep the server flag `0` until scoped tests and deployment inventory are verified. A specific scoped production workflow still needs to be reviewed before these steps can be run.
4. Obtain explicit approval to activate notifications and to enable the website `friendNotificationsEnabled` flag. Keep campaign notifications independently disabled unless separately approved.
5. Use two existing accounts to verify incoming requests, accepted/declined/cancelled outcomes, private block/unblock confirmations, owner-only mark-read, cross-session sign-out, pagination, mobile/desktop focus and unread markers. The Phase 3.2 deferred Remove Friend live test requires an eligible accepted friendship; do not bypass the seven-day cooldown.
6. Preserve a tested rollback route to disable server and website flags without deleting canonical relationships or notification records.

**Release state:** Code can be merged with all production gates disabled. Production Firebase deployment, activation and live-user acceptance remain separately gated.
