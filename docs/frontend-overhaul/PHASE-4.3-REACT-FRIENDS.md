# Phase 4.3 — React Friends and Chat Entry

The current legacy website remains the production implementation. This React/Vite-only migration reuses the existing Firebase Auth + Functions clients; no new backend, Firestore reads of social relationships, new cloud services, rules, messages or production deployment.

## Features

- Exact Account ID lookup using `asteriaFriendAccountLookup`. Never searches partial names, emails or UIDs.
- Private inbound/outbound requests with send, accept, decline, cancel and server-provided pagination/version checks.
- Current accepted friends and blocked players, with bounded pagination and confirmation before removal/block/unblock.
- Explicit seven-day reconnection cooldown warning and irreversible block/unblock messaging. Server remains authoritative.
- Chat entry describes the existing Party dashboard chat; no private friend DMs, chat records, messaging UI or invented access rights.
- Reuses the existing authenticated `asteriaFriendRequests` callable. No browser client reads of the relationship or identity registry.
- All user-specific state clears on UID/session changes; delayed responses are rejected by the adapter as well as the page's generation guard.
- Friends registration requires BOTH an authenticated existing owner profile and the explicit React build flag `VITE_ASTERIA_FRIENDS_ENABLED=true`. This preview flag alone does not enable any backend; production rollout is separate. Default guest build remains offline and isolated.

## Tests / release

Contract tests verify the exact server response shapes, version checks, required opt-in, route gating, and absence of client Firestore social reads. Existing full CI, emulator and browser regressions must succeed before merge. Private friendship state cannot be validated against live accounts by a GitHub test fixture. Actual two-account staging acceptance and production activation remain separately controlled.
