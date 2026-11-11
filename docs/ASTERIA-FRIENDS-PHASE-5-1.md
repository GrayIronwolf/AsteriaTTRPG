# Asteria Friends — Phase 5.1: Campaign invitation recipient selection

**Scope:** Owner-only, read-only prospective recipient selection in Campaign Forge. Implements only the first update in the approved Friends Phase 5 roadmap.

## Audited baseline

- Source: `GrayIronwolf/AsteriaTTRPG` main commit `34e3cf2378e2bbe3f7203f684860699b67b33cae`.
- Friends list already runs through authenticated `asteriaFriendRequests` with 20-item pagination and rate limits, returning only the current public username and Account ID. No relationship UIDs, pair identifiers, private blocks or email are exposed.
- Exact Account ID search already has an independent transactional search quota in `friendAccountLookup.mjs`.
- The existing secure campaign invitation backend permits only the owner of a version 2 campaign to issue credentials and independently requires the secure invitation signing secret and production gate. This update does **not** issue a token, call that backend, or change campaign access.
- `secureInvitationManager` and canonical campaign membership controls remain independently gated.

## Implementation

- `functions/campaignFriendRecipients.mjs` implements a *read-only* authorized resolver:
  - `{action:"list",campaignId,cursor}` uses the accepted Friends List's existing read quota and bounded pagination.
  - `{action:"resolve",campaignId,accountId}` uses the existing exact `Username#12345` lookup with its server-enforced quota and no broad directory search.
  - The server authenticates the requester, confirms that the campaign is owned by that UID, requires schema v2 and that invitations are open, and checks the recipient's active canonical identity and Firebase Auth status.
  - Existing membership, pending campaign join requests and blocked relationships make a candidate unavailable. A non-friend may be chosen only by exact Account ID, never by enumerating private account identities.
  - Returns only `{username,accountId}`, pagination metadata or a neutral unavailable flag. No target UID, email, block actor, campaign roster or private registry data is returned.
  - Selecting a recipient is **not** permission to issue. Phase 5.2 must re-resolve identity, check relationship and campaign status inside the issuance transaction before persisting any UID restriction.
- `functions/index.mjs` exposes `asteriaCampaignFriendRecipients` only when `ASTERIA_CAMPAIGN_FRIEND_RECIPIENTS_ENABLED=1`. Default: **off**. No Cloud Function is deployed in this phase.
- `js/firebase-auth.js` uses the authenticated callable, validates exact request/response shapes and discards late responses after a login switch.
- The new Account/Campaign Forge selector loads only for the logged-in **campaign owner** and schema v2 campaigns, and only when the independent website flag `campaignFriendRecipients` is `true`. Default: **false**. The UI cannot issue or send anything and explicitly describes this as a preview.
- Focused styling preserves existing website panels, accessible status text, keyboard controls, 44px mobile touch targets and session cancellation.
- No existing Campaign, Friends, Account ID, artwork, role, member, gameplay, Firestore rule, Storage rule, index or email logic was changed.

## Tests and deployment boundary

The phase is intentionally fail-closed and **is not active in production**. Adding a new exported callable to source does not deploy it; the existing production Friends Cloud Functions are not modified. No extra Firebase project or demo service is created.

`npm run test:friends-phase5-1` checks exact browser gating, no invitation side effects, private response shape and session isolation. `scripts/friends-phase5-1-emulator.test.mjs` uses the disposable existing `demo-asteria` emulator to check owner vs stranger, exact handle, accepted and blocked friend, inactive Auth accounts, existing members, pending joins, renamed identities, client Firestore denials, and no invitation or membership writes.

The full pull-request CI must pass production dependency audit, content checks, lint, all Node tests, existing Firebase Auth/Firestore/Storage emulator integration, website build, and generated asset consistency before merge.

**Do not run a broad production Firebase deploy.** Later separately approved scoped deployment must isolate only `asteriaCampaignFriendRecipients` and verify the flag is **off** first. Phase 5.2 is responsible for binding a newly verified recipient to the existing secure invitation contract, owner-only issuance and approval process. Phase 5.3 is responsible for coordinated feature activation and real-account acceptance.

## Deferred items

- No secure invite token, email, notification, invitation document, recipient UID persistence, account membership or character linking.
- No automatic Co-GM permissions or roster addition.
- No live player/GM testing or Firebase activation claims.
- The prior deferred Friends notification end-to-end test and Block/Unblock reconnect-cooldown remain pending and are not bypassed by this phase.
