# Asteria Friends — Phase 4.2: Account Notifications Integration

## Scope
Phase 4.2 connects the existing Phase 4.1 `asteriaFriendNotifications` authenticated callable to the existing Account → Notifications workspace. It does not add a backend service, alter Firestore rules, enable Firebase functions, update campaign invitation permissions, or start Phase 4.3.

## Presentation and navigation
- Account → Notifications retains the existing Campaign Notifications section; it now also has a distinct **Friend Notifications** section, with its own heading, status, pagination, unread/read handling and inactive message.
- The friend view is rendered only when the independent website flag `friendNotificationsEnabled` is true and the authenticated Firebase service is ready. **The committed production flag is false**, as is the unrelated `campaignNotifications` flag.
- Friend notices use only server-provided generic title, body, kind, timestamp and notification ID. No other person's UID, Account ID, profile picture, email or relationship document is requested.
- An **Open Friends** action opens the existing Friends dialog and selects the appropriate existing tab: Requests for request events; Friends for acceptance/removal; Blocked for the signed-in actor's own block/unblock confirmations. It never accepts a notification-provided destination path.
- Read acknowledgements call the existing Phase 4.1 server-owned `mark-read` operation. The private inbox, not the browser, owns read state. The header indicator is updated after an acknowledged read.
- The existing header unread marker uses a union of the independently gated Friend and Campaign first-page notices, with identity/session guards. It does not display an invented numeric total.

## Privacy, failures and accessibility
- All friend notification requests are bound to the signed-in, verified account UID on the client and server; the browser cannot submit a UID. Responses are checked for strictly allowed fields, kinds, safe dates and bounded page sizes.
- Old-account responses are discarded after sign-out, account switch or detachment. Reopening the workspace starts with a fresh first page; no localStorage, sessionStorage, Firestore browser reads, browser notifications or user-visible sensitive errors are used.
- The panel uses existing Asteria colors and materials, high-contrast unread markers, an accessible status region, list semantics, 44px minimum touch targets, keyboard-native buttons and mobile single-column action layout.
- Campaign Notices retain their existing unrelated backend and gate. If one service is inactive, the other still has its own visible state.

## Verification and activation
- `npm run test:friends-phase4-2`: UI behavior, account isolation, read acknowledgements, navigation, disabled mode and source privacy checks.
- Standard `npm test`, Firebase emulator security tests, lint, content validation, production build and committed asset parity must pass before merge.
- There are **no new Firebase backend or rules changes in Phase 4.2**. Phase 4.1's **unreleased** social callable and rules still need a separately approved scoped production deployment; the website flag must stay off until backend production readiness and authorized rollout.
- Actual two-account mobile/desktop verification remains pending until safe activation. Phase 3.2's deferred live Remove Friend test is unchanged. Phase 4.3 reliability and end-to-end acceptance are separate.
