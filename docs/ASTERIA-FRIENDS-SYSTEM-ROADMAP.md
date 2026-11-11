# Asteria Friends System — Audit and controlled roadmap

**Status:** Phase 1.1 (audit and planning) complete; implementation phases proposed for approval.
**Audited baseline:** GrayIronwolf/AsteriaTTRPG main at e1504f78b102f1d93ac04a9f29b8e729ecdb0a05 (11 November 2026).
**Plan:** Five phases, three independently tested updates per phase (15 updates total).
**Deployment boundary:** No new Firebase project, Hosting site, DNS entry, public directory, migration, or automatic production activation.

## 1. Findings from the current repository

1. **Verified account identity is already available.** The permanent Firebase Auth UID and five-digit number are recorded in server-owned accountIdAssignments; accountIdRegistry keys contain normalized `username#00000`. Username changes update the active handle transactionally while reserving the previous handle as an alias. Relevant sources: `functions/accountIdentity.mjs`, `functions/accountIdentityUsername.mjs`, `src/state/accountProfileDisplay.mjs`.
2. **Account data is private by default.** Current `firestore.rules` allows each user to read their own `users/{uid}` profile and denies all browser reads/writes of `accountIdRegistry` and `accountIdAssignments`. A friend search must use an authenticated, rate-limited server callable and never open those collections to clients.
3. **The Account menu is available on desktop and mobile.** `index.html` and `js/asteria-account-menu.js` have authenticated My Profile, settings, notifications and security entries. A Friends entry should use their existing keyboard, focus, sign-out and responsive patterns.
4. **Profile avatars are owner-private.** Current `storage.rules` and `js/firebase-auth.js` implement authenticated owner-controlled profile pictures. Other users must not receive unrestricted URLs to these private uploads. Start with username/initials; a later opt-in public thumbnail requires an independently reviewed storage design.
5. **The secure campaign invitation stack is implemented but separately gated.** `functions/campaignSecureInvitations.mjs` supports a single-use recipientUid restriction on owner-issued invitations and enforces GM approval on acceptance, while `functions/campaignInvitationAcceptance.mjs` creates a pending canonical join request. Current website flags for secure invitation manager and acceptance are false in `index.html`, and server enablement is separately guarded. Do not claim production activation based on source code or website deployment.
6. **Campaign in-app notifications are not a general friends inbox.** `functions/campaignNotifications.mjs` and `js/campaign-notifications-ui.js` are limited to campaign-related kinds and use an independent campaign-only feature gate. The website `campaignNotifications` flag is false. Reuse the security and UI patterns without prematurely enabling or widening campaign notifications.
7. **No canonical friend graph, friend request workflow, friend search API, or Friends UI was found** in the audited source tree or repository code search.
8. **The existing production GitHub identity allowlist is workflow-specific.** The Google Cloud Workload Identity provider currently authorizes the established `firebase-deploy.yml` and `deploy-asteria-username.yml` on `main`. Prefer a tightly scoped friends operation inside the already-approved `firebase-deploy.yml` rather than introducing a third deployment workflow that would fail authentication until separately authorized.

## 2. Locked architectural boundaries for implementation

- **Identity:** Every friendship is bound to immutable Firebase Auth UIDs. Display `Username#00000` is resolved server-side and is never a relationship key. Renaming a username cannot sever an existing friendship. The five-digit number remains unchanged.
- **Discovery:** Exact, full active `Username#00000` lookups only (case-insensitive username part; exact five-digit number); no prefix directory, public email search, broad browsing or client query of the private identity registry. Historical aliases remain reserved and cannot be claimed by another user; whether aliases should resolve to a visible profile requires an explicit privacy decision, defaulting to not surfacing previous handles.
- **Safe response:** Return only the account's current public username/Account ID and minimal permitted profile indication. Do not return email, private name, phone, raw UID, Firebase Auth token, account creation metadata, campaign memberships or private avatar URL. An opaque, short-lived server reference may be used for acting on a search result.
- **Friendship authority:** New canonical social records live in a server-only top-level Firestore namespace (proposed `friendRelationships/{stablePairKey}` and server-only throttles/notifications); clients never write relationship status or impersonate a target UID. Deterministic pair keys derived from sorted UIDs prevent duplicate and reciprocal relationships. Transaction checks must cover both parties, states, blocks, authentication and concurrent actions.
- **Requests:** Sender may send/cancel; recipient may accept/decline; either accepted participant may remove; either may block/unblock. Self-friending, pending duplicates, spam, cross-account leakage, forged confirmations and stale writes must fail safely. The exact declined/re-request policy will be defined before phase 2 code.
- **Privacy:** Only authenticated users can attempt lookup; rate-limit search and requests. Blocking prevents new requests and direct social invitations, and should not disclose the blocker's identity to a blocked sender. Treat public profile/avatar sharing as opt-in.
- **Notifications:** Use server-owned, recipient-only event data. No exposed email or invitation secret, no unauthenticated listing and no browser-writable unread counts. Friends notifications must work independently of the disabled campaign-notifications feature.
- **Campaign security:** Friendship does NOT create campaign membership, confer GM permissions, approve characters, read campaign data or bypass sanctions. GMs may choose a friend or enter a verified account handle as a proposed invite target. Actual secure invitations require an enabled v2 campaign invitation backend and still create a pending GM-reviewed join request. Existing v1 join behavior must not be silently changed.
- **Rollout:** All new features default off until scoped Firebase security rules/functions, audit, CI/emulator and two-account authenticated verification succeed. Use the existing Firebase project, approved manual deployment permissions and current account test users. No test/demo cloud project is required.
- **Presentation:** Reuse Asteria's existing crystal buttons, layout, header, mobile drawer, profile artwork and accessibility behavior. Do not replace approved visual assets, gameplay, XP, character storage or dashboards.

## 3. Fifteen-update roadmap

### Phase 1 — Account discovery

**1.1 — Existing-system audit and roadmap (this document).**
Inspect current Account ID issuance/rename, Firestore and Storage access boundaries, Account menu, invitations, notification gates and CI/release controls; document exact reuse and missing pieces.
**Exit:** Source-grounded roadmap reviewed; no production changes.

**1.2 — Secure exact Account ID resolution.**
Build a Firebase Auth-scoped callable for normalized exact handle lookup against the server-only registry, with bounded request size, query throttling, non-enumeration controls, privacy-safe fields and server-side account/alias integrity checks. Add fail-closed unit and emulator tests. Design a scoped functions-only manual release using the existing trusted deployment workflow.
**Exit:** Private data inaccessible from client Firestore; no partial/broad search; tests pass; feature remains off.

**1.3 — Find Player experience.**
Add an authenticated Friends entry and exact Account ID search UI on desktop/mobile. Display only validated permitted fields, clear no-match feedback, and safe sign-out/account-switch cleanup. Keep controls inactive until backend verification and enablement.
**Exit:** Search tested on two real accounts, including renamed accounts and invalid handles; approved artwork preserved.

### Phase 2 — Friend requests

**2.1 — Canonical relationships, transitions and rules.**
Define the private relationship schema, deterministic pair identity, pending/incoming/outgoing/accepted state machine, block-related invariants, quotas and Firestore deny rules. Confirm repeat/decline and expiry policies in tests.
**Exit:** Data model and unit/emulator tests prove no direct client writes or duplicate pairs.

**2.2 — Authenticated friend request actions.**
Implement send, cancel, accept and decline as transactional callable actions. Enforce per-party identity, stale revision, self-request, flood limits, concurrent acceptance, blocked recipient and account integrity.
**Exit:** Two-account and adversarial emulator tests pass; no client-supplied target UID trusted.

**2.3 — Requests inbox and approval controls.**
Add incoming/outgoing tabs, request status, accept/decline/cancel, disabled/busy states and pagination to the Friends workspace. Validate real signed-in account switching, refresh, logout and mobile keyboard/touch behavior.
**Exit:** Live two-account canary accepted and declined correctly; release separately approved.

### Phase 3 — Friends List and privacy

**3.1 — Accepted-friends listing.**
Implement recipient-scoped paginated list and stable UID-backed friendship summaries. Resolve current display handles safely after a rename; no client access to the private account registry or complete user profiles.
**Exit:** List remains accurate across username changes, account switching and removals.

**3.2 — Friendship management and blocking.**
Add remove friend, block and unblock with confirmation and server-enforced state transitions. Suppress inappropriate social requests and friend selection across blocks.
**Exit:** Blocked, removed and concurrent states behave correctly in unit/emulator and signed-in tests.

**3.3 — Friends workspace, limited public profile, and Phase 3.2 UX follow-up.**
Build accessible, responsive friend cards/profile preview using current public handle and initials by default; consider explicit opt-in social avatar thumbnail via isolated, reviewed permissions rather than granting access to existing owner-private photos.

**Carry-forward from Phase 3.2 (approved 11 November 2026):**
- Update the **Block Player** confirmation to explain explicitly that blocking ends an accepted friendship and any pending request; **Unblock** removes the block but **does not restore the friendship**. When the final block is removed, the existing **seven-day cooldown starts at unblocking**, so a new request cannot be sent immediately. Keep these backend rules unchanged and ensure the mobile confirmation is clear before a destructive action.
- Keep the **live Remove Friend test pending**, since the two current test accounts are no longer friends after block/unblock. Complete a real two-account removal test when another accepted friendship is available or reconnection becomes eligible after the cooldown; verify removal on both accounts and the reconnection restriction. Do **not** bypass the cooldown or automatically reinstate a friendship just to test removal.
- Preserve approved Asteria styling and existing secure request/block behaviour; test confirmation wording and cancel/confirm handling on mobile and desktop.

**Exit:** Privacy, mobile, accessibility and visual acceptance passed; block/unblock warning shown and tested; Remove Friend live test completed when an eligible accepted relationship is available, or explicitly recorded as pending rather than misreported as passed.

### Phase 4 — Social notifications

**4.1 — Server-side friend notification events.**
Create deterministic recipient-private notices for incoming request, accepted request and relevant management outcomes, without storing private identity information, raw invitation credentials or duplicate events. Keep this independently gated from campaign notifications.
**Exit:** Authenticated callable and Firestore-deny/emulator tests passed.

**4.2 — Account notifications integration.**
Reuse Account menu and existing notification presentation patterns; add friend-specific unread/read handling, simple navigation to the Friends workspace, and clear separation from disabled campaign notifications.
**Exit:** Recipient cannot read another account's inbox or forge unread state.

**4.3 — Reliability and responsive acceptance.**
Test duplicate delivery, stale cursors, idempotent read, account switching, mobile/desktop layouts, accessibility, rate limits and disabled/failure modes.
**Exit:** Authenticated end-to-end and CI pass before separately approved social notifications activation.

### Phase 5 — Campaign invitation integration

**5.1 — GM recipient selection.**
In Campaign Forge, let an authorized campaign owner pick from accepted friends or enter an exact Account ID; resolve target server-side and prevent information leaks or disabled/blocked-target invitations.
**Exit:** Correct recipient selection; no elevated campaign access or accidental email disclosure.

**5.2 — Reuse existing secure invitation contracts.**
Bind the selected account as `recipientUid` on a single-use secure invitation. Preserve owner-only issuance, one-time bearer-token handling, signing-key validation, revocation, and pending GM approval. Never automatically promote a Co-GM or add a friend as a member.
**Exit:** Authenticated friend, non-friend, blocked, expired, revoked, wrong-recipient and duplicate claim cases tested; legacy v1 untouched.

**5.3 — Final cross-system release.**
Audit feature gates and production dependencies. Run full CI/emulators and real-account/mobile/desktop canary. Deploy only separately approved scoped changes to existing production Firebase. Verify existing campaign v2 invitation rollout is independently approved and active before enabling direct friend invitations, with a documented rollback.
**Exit:** Production verification, owner/GM and two-player acceptance, no regression to Account IDs, existing campaign members or gameplay.

## 4. Mandatory release and QA checklist for each implementation update

1. Audit current `main` and recent PRs before the update; use a dedicated branch and make only that update's changes.
2. Scope the release to necessary files, Firebase functions and rules. Never create new cloud projects or automatically deploy unrelated services.
3. Run focused Node/security tests, `npm test`, `npm run test:firebase`, lint, content checks, production build and committed asset parity where applicable. Record actual results and limitations.
4. Keep feature flags/Cloud Function gates disabled until the reviewed backend exists and matches the frontend. Test failure and denial paths.
5. Require review of manual Firebase deployment scope and IAM. Reuse the already trusted `firebase-deploy.yml` workflow so a new Workload Identity allowlist change is not needed.
6. Verify authenticated Android/mobile and desktop account switching, friend request concurrency, privacy boundaries and renamed handles; automated emulator tests do not substitute for a real-user check.
7. Merge/deploy only on passing CI; report exact PR/run links and explicitly distinguish implemented, merged, deployed, enabled and verified.
8. Implement phases sequentially; do not begin the next numbered update automatically without an explicit request.

## 5. Status and next action

- **Phase 1.1:** Complete — audited and documented; no website/Firebase code or live data changed.
- **Phase 1.2:** Next — exact, privacy-preserving Account ID lookup backend and tests.
- The roadmap is a proposed technical plan; do not treat phase 5's campaign integration as approved production activation of the existing gated campaign v2 migration.
