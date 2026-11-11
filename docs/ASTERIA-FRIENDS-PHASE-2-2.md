# Asteria Friends — Phase 2.2 secure friend request backend

**Scope:** authenticated Cloud Function, server-only send/accept/decline/cancel transactions, quotas, tests and optional functions-only deployment. **No live activation, no frontend request controls, no campaign access, and no new Firebase project.**

## API and security

- Callable: `asteriaFriendRequests`, Firebase Functions v2 (`us-central1`), disabled by default unless `ASTERIA_FRIEND_REQUESTS_ENABLED=1`. No website flag or Phase 2.3 inbox is introduced.
- Request payload is exact: `{action:"send",targetAccountId:"Username#00000"}` or `{action:"accept"|"decline"|"cancel",targetAccountId:"Username#00000",expectedVersion:N}`. The browser never supplies a Firebase UID, pair ID, email or Firestore path. Future Phase 2.3 inbox must provide only authenticated recipient-scoped request summaries and the current version.
- Actor UID comes from verified Firebase Auth `request.auth.uid`; both participants' account profiles, Account ID assignments, active registry entries and Firebase Auth users are reverified. Historical account handles, forged records, deleted/disabled users and self-requests fail safely. Target identity resolution uses the existing exact Account ID lookup, *including* its per-account rate limit (10/15 minutes, 40/day).
- Transactional document: `friendRelationships/{sortedUidA~sortedUidB}`. Send creates once, or re-sends only after the Phase 2.1 cooldown and expiry rules. Accept and decline belong exclusively to the recipient; cancel belongs to the requester. State machine and stale `expectedVersion` rejection are inherited from Phase 2.1.
- The send action reads and writes `friendRequestIssueThrottle/{actorUid}` in the **same Firestore transaction** as the canonical pair record (10 newly issued requests per 24-hour fixed window). Concurrent or reciprocal duplicate requests cannot create a second friendship record or bypass limits. Failed send actions do not consume this issuance quota (though the separate account lookup attempt is counted).
- Requests expired at 14 days cannot be accepted/declined. A later re-request is allowed only after the original expiry plus the seven-day cooldown. Blocks and accepted friendships cannot be re-requested. The callable does not expose block identity or state.
- Response is limited to `{ok:true,status,version,expiresAtMs}`, never a raw UID, email, profile data, blocking party or campaign membership. Unknown/blocked/inaccessible combinations receive the same generic unavailable error. The callback maps request quotas and malformed input to standard Firebase errors without displaying private records.
- Existing Firestore default-deny and Phase 2.1 explicit deny rules keep relationship documents and throttles private. The Firebase Admin SDK is the only writer; **do not** loosen Firestore browser permissions for Phase 2.2.

## Deployment

- No production Function deployment occurs merely because this PR merges or the site deploys.
- The existing trusted `.github/workflows/firebase-deploy.yml` adds manual operation `friends-request-backend-deploy`. Only branch `main`, authenticated production environment and exact confirmation `DEPLOY-ASTERIA-FRIEND-REQUESTS-OFF` can run it.
- The release builder stages exactly one function, `functions:asteria:asteriaFriendRequests`, the two request/model helpers and existing Account ID validation helper, with `.env.asteria-ttrpg` containing `ASTERIA_FRIEND_REQUESTS_ENABLED=0`. No lookup function, existing account functions, campaign service, secrets, website assets, Firestore/Storage rules or migrations are bundled.
- The deployment job verifies the function's actual Gen 2 environment flag is `0`, never silently enables friend requests and never creates relationships. Full activation and real two-account testing belong to a separately reviewed later update; do not manually set the flag to `1` in Phase 2.2.

## Automated validation

- `npm run test:friends-phase2-2` tests strict action payloads, callable authentication/gating and the isolated release boundaries.
- `npm run test:firebase` includes `scripts/friends-phase2-2-emulator.test.mjs` for actual Firestore transactions: send/accept, declined/cancelled paths, no-match and aliases, self-request, disabled users, blocking, duplicate/concurrent requests, stale versions, daily quota, and browser denial.
- Existing Phase 1 and Phase 2.1 tests, gameplay/campaign regressions, lint, content checks, production build and bundle parity remain required. CI also creates and checks the disabled single-function release package without deploying to Google Cloud.

**Status:** Code-only implementation, no production enablement or UI. Phase 2.3 is the next planned update; do not start it without explicit request.
