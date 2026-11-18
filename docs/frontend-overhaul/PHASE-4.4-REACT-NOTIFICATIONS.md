# Phase 4.4 — React Notifications, Account Header & Foreground Updates

## Implementation

The isolated React/Vite app reuses the existing authenticated `asteriaFriendNotifications` and `asteriaCampaignNotifications` Cloud Functions through the same Phase 4.1 Firebase app and Functions client. Both services default to **disabled** and must be independently opted into for a React build with `VITE_ASTERIA_SOCIAL_NOTIFICATIONS_ENABLED=true` and/or `VITE_ASTERIA_CAMPAIGN_NOTIFICATIONS_ENABLED=true`. Server-side feature flags are authoritative. Nothing is deployed to production.

- One shared React provider powers header unread count and private account notification views. Badge counts describe **only unread first-page messages**; no inaccurate all-history count.
- Client validates every notification shape, opaque cursor, notification ID, date, kind, and read acknowledgement; rejects private fields.
- Social/campaign tabs support manual refresh, explicit read acknowledgement, separate cursor pagination, and disabled/partial failure states.
- A single owner-scoped refresh controller checks each enabled channel at initial sign-in, foreground visibility/focus, and 60-second intervals **while the tab is visible**, with a 30-second minimum automatic refresh interval. Refresh after a mark-read action is immediate. This is near-real-time **polling**, not a Firestore push subscription. Backend friend notification access quotas still apply (120 reads per ten minutes).
- No browser reads of `friendNotificationInbox`, `campaignNotificationInbox` or notification access-throttle documents. No service workers, push notifications, local storage or new Firebase projects.
- A sign-out or switch of authenticated UID disposes listeners and timers and discards private results. Notifications never grant campaign membership, reveal invitation tokens, activate secure invites, or enable unconverted dashboards.
- The guest preview and currently hosted legacy site are unchanged. Live social/campaign flag activation, phone screen-reader checks and real-account acceptance require separate approval.

## Verification

Phase 4.4 contract tests cover malformed responses, cross-account response invalidation, private data rejection, cursor rules, strict unread counts, read state and timer cleanup. The entire existing React browser, Firebase emulator/security, lint, production build and committed bundle parity suite must pass before merging.
