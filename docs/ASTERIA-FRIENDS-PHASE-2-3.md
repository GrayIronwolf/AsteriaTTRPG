# Asteria Friends — Phase 2.3: Requests Inbox and Approval Controls

**Scope:** Incoming/outgoing requests, status, accept/decline/cancel and send-from-search controls, private paginated authenticated inbox callable, UI tests and Firebase emulator security tests.

## Release state and safety
- Phase 2.2 callable `asteriaFriendRequests` exists in source, but **is not yet deployed/activated** in production. The normal website keeps the request manager disabled.
- The website test URL for **both** search and requests is `https://asteriattrpg.com/?friends-lookup-canary=1&friends-requests-canary=1`. The flags are separate; request-only testing uses `?friends-requests-canary=1`. This **only enables the browser interface** and is **not a security boundary**. The backend must independently require Firebase Auth and `ASTERIA_FRIEND_REQUESTS_ENABLED=1`.
- No new Firestore browser read permissions are granted. The private `friendRelationships` collection and account registries remain server-only. No campaign invitations, friendships by merely searching or arbitrary profile discovery.
- Phase 2.1 relationship rules (14-day pending expiry, 7-day retry cooldown, participant blocks and daily quotas) continue unchanged.

## Authenticated callable request inbox
- Operation `{action:"list",direction:"incoming"|"outgoing",cursor:0|20|40|…}`, paginated up to 20 records per page, max scan offset 1,000.
- Returns `{items:[{username,accountId,direction,status,version,requestedAtMs,expiresAtMs}],nextCursor:number|null}`.
- Reads only pairs containing the authenticated UID. Server-side filters hide all accepted/blocked/expired/nonpending relationships; recipient identity is reverified from the **current** active Account ID registry and Firebase Auth. Old usernames and disabled accounts are not returned.
- Pagination uses a bounded scan rather than returning pair document IDs or opaque secrets containing raw UIDs. As this is a source-only release, production data and indexes are unchanged; query uses existing single-field `array-contains` index.
- The listing is advisory, not a permission grant. The existing Phase 2.2 transaction rechecks account ownership, pair state and `expectedVersion` before accepting, declining or cancelling.

## Request manager UI
- Existing **Account → Friends** window retains exact-ID searching. Found players gain a **Send Friend Request** button when requests are separately activated.
- Tabs: **Incoming** (Accept/Decline), **Outgoing** (Cancel Request). Each tab has loading, empty, unavailable and error states; Refresh and Load More.
- Every action disables conflicting buttons while pending. The UI uses DOM `textContent`, never `innerHTML` or local persistence. The existing Friends dialog focus trap, Escape, signed-in requirement, layout and mobile presentation are preserved.
- Close, sign-out and account change invalidate pending results, clear the candidate and inbox and reject stale callbacks. The Firebase browser bridge also rechecks Auth UID and ownership before and after calls.
- Only public usernames and Account IDs appear. Internal UID, pair key, email, block state, avatar URLs and private account profile information never appear.

## Test and deployment order
1. Run full PR CI: `npm test`, `npm run test:firebase`, audited dependencies, lint, page build, isolated Firebase release package.
2. Merge only after full CI passes and the manual scoped deployment/activation steps have been reviewed.
3. Separately run the existing manual `friends-request-backend-deploy` operation to install **only** `functions:asteria:asteriaFriendRequests` with `ASTERIA_FRIEND_REQUESTS_ENABLED=0`; verify actual disabled runtime flag.
4. After the disabled deployment is verified, the existing trusted workflow offers separate `friends-request-backend-activate` (confirmation `ACTIVATE-ASTERIA-FRIEND-REQUESTS`) and `friends-request-backend-deactivate` (confirmation `DEACTIVATE-ASTERIA-FRIEND-REQUESTS`). Both deploy **only** the same function; each checks the actual runtime environment setting after deployment. These operations are not triggered by a merge.
5. **Security:** when the backend is activated, any eligible authenticated account may use the callable, including without the canary URL. The browser flag only controls UI visibility, not server permissions.
6. Verify live account A sends to account B, B sees it and accepts; test decline, cancellation, duplicate rejection, refresh, logout, account switching and mobile/desktop.
7. Never interpret successful GitHub Pages deployment as proof that Firebase requests are enabled or live-tested.

**No automatic production Firebase deployment or activation occurs when this PR merges. Do not begin Phase 3.1 without explicit instruction.**
