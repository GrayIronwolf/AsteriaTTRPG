# Asteria Friends — Phase 3.3: Workspace and Limited Public Profiles

**Scope:** A usable responsive Friends workspace with mutually exclusive **My Friends**, **Requests**, and **Blocked** tabs; limited public-account previews; clearer irreversible block/unblock warnings; and a documented deferred live Remove Friend test.

## Approved UI and privacy behaviour
- The existing authenticated Account → Friends overlay retains its exact Account ID search, current approved styling and Firebase-backed data. The three relationship sections now have accessible ARIA tabs, arrow/Home/End keyboard navigation, a single visible tab panel and full-width mobile controls. No request action, friend data or existing relationship is deleted by switching tabs.
- A **View Public Profile** button is available on a verified Find Player result, accepted friend, and incoming/outgoing pending request card. The preview shows **only** the current public username, its five-digit Account ID, and a derived initial. It has a clear close button and Escape-to-close with focus return. Its relationship context ("Accepted friend" or "Incoming/Outgoing request") is derived from the permitted list already loaded by the authenticated user; no server profile query is added.
- The app must **not** disclose Firebase UID, email, private profile name, profile photo, avatar storage URL, account creation metadata, mutual friends, online presence, campaign membership or friend-of-friend directory. Existing user-owned profile images remain owner-private. A future social avatar would require a separate **explicit opt-in**, permissions review, dedicated storage design and tests; Phase 3.3 does not enable it.
- Sign-out, account switch, closing Friends or changing the selected section clears the preview and prevents exposing stale account details. Rendering uses `textContent`, never untrusted HTML, and requires the existing verified authenticated Friends overlay.
- The Block confirmation must explicitly say: blocking **ends the friendship** and existing pending requests; **unblocking does not restore** a prior friendship; once the **final** block is lifted, the existing **seven-day** reconnection cooldown begins before a new request is eligible. The existing Cancel, Escape and Confirm controls must remain accessible and not mutate relationships until the user approves.
- Remove Friend confirmation continues to disclose the separation and seven-day cooldown. **No server-side relationship state-machine changes**; no Firestore rule changes, no new Firebase functions, no new Firebase projects, and no automatically enabled production features.

## Live Remove Friend carry-forward
**Status: Pending real-account test.** The previously used pair was blocked and then unblocked, which correctly ended the friendship and began the seven-day reconnect cooldown on 11 November 2026. Do **not** bypass the cooldown or silently reinstate the pair. When another accepted friendship exists, or the previously blocked accounts become eligible to reconnect (around 18 November 2026, depending on the actual unblock time), test:
1. Confirm both players see each other as accepted friends.
2. Open **Remove Friend** and **Cancel** first: verify both accounts remain accepted.
3. Choose **Remove Friend** and explicitly **Confirm**: verify the accepted relationship disappears from **both** My Friends lists.
4. Verify neither account may immediately reconnect during the server-enforced seven-day cooldown.
5. Record live evidence. Automated Firebase emulator tests already cover removal and cooldown but do **not** replace this live-account acceptance test.

## Release and acceptance
- All changes in this phase are website UI, static CSS/HTML and Node tests. Production cloud Functions and Firestore security rules remain unchanged, so **no manual Firebase deployment is required** for this phase.
- Run full `npm test`, `npm run test:firebase`, audit/lint/build and workflow asset verification. Merge only after complete CI success. GitHub Pages deploy should then be independently checked.
- Test on authenticated mobile and desktop via `https://asteriattrpg.com/?friends-lookup-canary=1&friends-requests-canary=1`. Verify the tabs, accepted friend cards if an accepted pair is available, the Blocked section, incoming/outgoing request tabs, public previews, Escape/focus/cancel actions, and account switching.
- Keep **Remove Friend real-account** verification marked pending until live evidence exists. Do not claim it completed simply because the interface and emulator checks passed.

**Phase 4 notifications and Phase 5 campaign integration are outside scope.**
