# Asteria Friends — Phase 3.1 Accepted Friends List

**Purpose:** Display an authenticated account's accepted friendships after a friend request has been approved, without exposing Firebase user IDs, relationship document keys, private profiles or block records.

## Implementation
- **Server:** `asteriaFriendRequests` gains `{action:"list-friends",cursor:0|20|40|…}`. The callable still requires authenticated Firebase Auth and its existing `ASTERIA_FRIEND_REQUESTS_ENABLED=1` server flag. It returns `{items:[{username,accountId,friendsSinceMs}],nextCursor}` with at most 20 public summaries per scan page. Firestore data is read only through Admin SDK.
- **Identity:** Every list read validates the requesting account against Firebase Auth and the current canonical Account ID assignment/registry. Other participants are revalidated too. A username rename updates their display on the next refresh without changing UID-backed friendships. Deleted, disabled, blocked, malformed and removed relationships are omitted.
- **Pagination:** A bounded 20-record raw scan with a limit of 1,000 offset. Pages may be sparse because nonaccepted records are omitted. The next cursor is numeric; private pair IDs never leave Firebase.
- **Rate limits:** Uses the existing private `friendRequestInboxThrottle/{uid}` transactional quota of 30 lookups in 15 minutes and 120 per 24 hours, shared with incoming/outgoing request pages. No new unrestricted endpoint or new Firestore index.
- **Browser:** My Friends appears inside the existing Account → Friends dialog. Shows public username, Account ID, initial and friendship date, plus Refresh and Load More controls, empty/error/disabled states. It uses the existing `friendRequestsEnabled` browser canary and current Auth session. It clears previous results on closing, sign-out and account switching; delayed results are discarded.
- **Acceptance:** A successful accept action refreshes the Friends List automatically. Pending requests continue to appear only in the existing Incoming/Outgoing tabs. Removing/blocking a friendship is outside 3.1 (planned for 3.2); social profile previews are planned for 3.3.
- **Privacy:** No email, raw UID, relationship key, profile photograph, blocked state or campaign permission returned to the client. Existing Firestore relationship records and quota documents remain Admin-only with explicit client denial.

## Deployment and acceptance
1. Merge only after the repository's complete CI and Firebase emulator tests pass. No Firebase function is deployed solely because the UI is published.
2. **Production uses a separate, already approved manual activation workflow.** Since Phase 3.1 changes the server-side listing code, an operator must **rerun** `friends-request-backend-activate` on the existing trusted `firebase-deploy.yml` after merge to deploy the updated `asteriaFriendRequests` callable with the existing enabled flag. This deploys only that function, never the lookup function, Firestore rules, Hosting or other cloud functions.
3. Test using `https://asteriattrpg.com/?friends-lookup-canary=1&friends-requests-canary=1`. Sign in to both existing test accounts; confirm an already-accepted friendship appears for each. Verify rename, refresh, missing/nonexistent accounts, sign-out, account switching, and mobile and desktop.
4. If the manual update fails, the previously deployed accepted-requests backend remains separately gated; do not claim that the updated Friends List is available until the new function's deployment is verified.
5. No Phase 3.2 or 3.3 work is included.

## Tests
- `npm run test:friends-phase3-1`: browser controls, disabled state, session isolation, public-only DOM fields and integration with existing Friends dialog.
- `npm run test:firebase`: the new accepted Friends List emulator tests cover mutual friend visibility, current handle after rename, removed/blocked filtering, deleted/disabled participants, bounded pagination and private quota protections.
- Full repository regression suite and isolated Firebase release package checks unchanged.
