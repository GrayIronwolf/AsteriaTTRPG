# Asteria Friends — Phase 1.3: Find Player interface

**Implementation:** Browser interface only; no friend requests, social graph, invitations or changes to private Firebase records. Baseline: `main` at `68e4459a78f0e474843d3500adce204c95ff0eea`.

## Changes
- The authenticated Account dropdown adds **Friends** in a Social group, preserving existing My Profile, Account Settings, Appearance, Notifications, Security and Log Out.
- A separate, accessible Find Players dialog uses existing Asteria navy/slate colors, typography and panel treatments. It supports desktop and mobile, including minimum touch targets, keyboard Escape, focus trap, focus restoration, readable status and reduced-motion behavior.
- The dialog accepts exactly `Username#00000` and displays only a verified username, full Account ID and letter initial. No email, personal name, target Firebase UID, private profile photo or hidden contact details are exposed. Full account enumeration, prefix search, friend requests and campaign membership are out of scope.
- `js/firebase-auth.js` exposes `findFriendByAccountId()` only for the current, authenticated, ownership-ready account, through the already-implemented Phase 1.2 `asteriaFriendAccountLookup` callable. It rechecks session UID after each remote response and validates the server's allowed fields.
- The UI invalidates pending requests on account switch, sign-out, close or input changes; old results are cleared, no localStorage or browser-direct private Firestore query is used.
- Feature flag `friendAccountLookup:false` **remains disabled**. Friends menu opens to an explanatory inactive view; no network search occurs while the flag is false.

## Release safety
1. Phase 1.2 source backend is merged but is **not confirmed deployed nor enabled** in production. Do not set the website flag true before separately deploying the reviewed, single-callable `friends-lookup-deploy` operation and reviewing the backend environment flag `ASTERIA_FRIEND_LOOKUP_ENABLED`.
2. Do not change the Cloud Workload Identity provider, create another Firebase project, or deploy other Firebase functions. The Phase 1.2 deployment job is already inside the trusted `firebase-deploy.yml` workflow.
3. GitHub Pages can publish this disabled interface independently; it changes no gameplay or live data. A successful Pages deploy does **not** prove that actual account lookup is enabled.
4. Before any activation, verify live behavior with **two distinct authenticated test accounts**: exact ID, renamed current ID vs old alias, no match, disabled account, quota, sign-out/sign-in and account switching, Android/mobile and desktop. Record the test outcome; source tests and emulators cannot replace this acceptance.
5. Full CI must pass (lint, Node regressions, Firebase emulator rules, release-package isolation, production build and bundle parity). Merge only after evidence is available. Do not start Phase 2.1 automatically.

## Tests
- `npm run test:friends-phase1-3`: DOM and keyboard-facing source checks, inactive state, private-data rejection, exact formatting, current-session validation, no-match, close/logout/account-switch and in-flight callback rejection.
- Existing Phase 1.2 lookup and Firebase emulator tests still run in normal CI.
- Real-user deployment verification is explicitly **pending** until an operator-approved backend rollout. No false claim of production search functionality.
