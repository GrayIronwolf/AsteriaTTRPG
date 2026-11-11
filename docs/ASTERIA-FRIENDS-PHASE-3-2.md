# Asteria Friends — Phase 3.2: Friendship Management & Blocking

**Scope:** Remove Friend, Block Player, Unblock Player, private blocked accounts list and explicit confirmations. Existing Phase 3.1 accepted list and Phase 2 request system are preserved. No campaign membership or invitation change.

## Backend and security

- The existing authenticated `asteriaFriendRequests` callable supports three additional actions: `remove`, `block` and `unblock`. The same `ASTERIA_FRIEND_REQUESTS_ENABLED` production flag gates every operation.
- Requests include only the target's exact **current** `Username#00000` Account ID and, where applicable, the `expectedVersion` from a trusted list response. The signed-in actor UID is obtained only from Firebase Auth. No raw UID, email or pair ID is accepted from the browser.
- All changes run in a single Firestore transaction on the existing canonical `friendRelationships/{sortedUidA~sortedUidB}` record. Other accounts cannot remove, block on behalf of, or unblock a player. Both accounts' active canonical Account IDs and Firebase Auth states are revalidated before any write.
- **Remove Friend**: only allowed from an accepted relationship. Transitions to `removed`, disappears from both accepted friend lists, and applies the existing seven-day re-request cooldown. It never automatically removes campaign memberships.
- **Block Player**: can be initiated from a found player or an accepted friend. It works even if no prior relationship exists (the server creates the canonical pair directly in a blocked state) and also when the other player has blocked the actor. A block immediately terminates pending or accepted friend status and rejects subsequent friend requests. Each participant retains independent blocking state; block actions are never reversible by the other party.
- **Unblock Player**: only available to the user who created that block. If the other participant is still blocking, the relationship remains blocked and that party is never disclosed. Unblocking the final block changes status to `removed`; it **never** automatically restores an accepted friendship. The seven-day reconnection cooldown applies.
- Stale versioned controls are rejected. An exact Account ID search can block a user without supplying a version: the server resolves and checks the current state atomically rather than exposing private revision numbers.
- The private `list-blocked` operation returns only **accounts blocked by the signed-in user**, filtered against active canonical identities. It does not reveal who has blocked the actor or any other party's block decisions. Pagination is bounded to 20 raw pair documents and scan offsets up to 1,000. Existing transactional inbox read quotas (30 per 15 minutes, 120 per 24 hours) also apply.
- Accepted Friends List summaries now include only the record `version` needed for safe, confirmed removal and blocking. Existing browser clients still receive only the public username, Account ID, friendship date and revision. No internal UIDs, pair keys or private profile data are exposed.
- Relationships, blocked state and quotas remain inaccessible directly from browser Firestore: existing explicit deny rules are unchanged.

## Interface and confirmations

- **My Friends** cards offer **Remove Friend** and **Block** buttons.
- The exact Find Player result offers **Block Player**.
- A new **Blocked Players** section shows the signed-in player's own active blocked accounts and an **Unblock** button for each, with Refresh and Load More.
- Every removal, block and unblock requires an explicit in-dialog confirmation with Cancel and Confirm, Escape cancellation, keyboard focus handling and no pending changes on cancellation.
- All updates are session-scoped: switching accounts, signing out or closing the dialog invalidates pending results and prevents late responses from showing a former account's data.
- After a successful action, the accepted list and blocked list are refreshed; the interface displays a result. No notifications or campaign changes are generated in this phase.
- The new controls remain disabled on the normal website; testing requires the existing opt-in `?friends-lookup-canary=1&friends-requests-canary=1` URL. This URL is **only a browser UI flag**: the backend continues to enforce Auth, rate limits and relationship permissions for all eligible accounts.

## Deployment boundaries

1. Run `npm test`, Firebase Auth/Firestore/Storage emulator tests and the full website build in PR CI.
2. After a successful review and merge, the updated Cloud Function is **not deployed automatically**. Use the existing trusted `.github/workflows/firebase-deploy.yml` with branch `main`, operation `friends-request-backend-activate`, and exact confirmation `ACTIVATE-ASTERIA-FRIEND-REQUESTS` to redeploy **only** `functions:asteria:asteriaFriendRequests` while keeping its existing enabled flag.
3. Verify the GitHub Actions job confirms a successful single-function update and `ASTERIA_FRIEND_REQUESTS_ENABLED=1`. No Firestore rules deployment, other functions, Hosting or campaign data are touched.
4. Test remove, block, unblock and mutual independent blocks with two accounts; verify one account cannot see another's private block decisions and that removed/blocked friendships disappear from both accepted lists.
5. In case of a production issue, the same existing workflow can run `friends-request-backend-deactivate` with confirmation `DEACTIVATE-ASTERIA-FRIEND-REQUESTS`, disabling friend request management until a reviewed fix is deployed.

**Known limitation:** The current blocked list deliberately hides disabled/deleted or noncanonical accounts. The existing exact current-handle API also cannot unblock an account that no longer has an active canonical Account ID. Do not purge blocking records to work around this. A later recovery operation will require a separate privacy-preserving design, not browser access to raw UIDs.

**Out of scope:** Friend profile previews (3.3), friend notifications (Phase 4), account visibility rules beyond exact Account ID lookup, campaign invitations and gameplay changes.
