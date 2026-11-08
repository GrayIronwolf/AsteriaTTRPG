# Asteria Campaign Connection Upgrade — Phase 3.2 Join Requests

**Scope:** create/read one pending player request per account and v2 campaign; optional owned-character preference. GM approval and membership changes belong to Phase 3.3.

## Implemented

- Authenticated callable `asteriaCampaignJoinRequest` accepts `{action:'status'|'submit',campaignId,ucn,characterId?}`. The requester UID is taken from Firebase Auth, never from the browser body.
- Server checks exact v2 campaign ID and UCN, current membership, existing request, and optional character ownership. A valid request writes only `campaigns/{campaignId}/joinRequests/{uid}` with `status:'pending'`, timestamps, revision and selected character reference. It cannot grant access, link a character, mutate the roster, or write another account's data.
- Repeated submissions return the existing request; approved/declined/expired/cancelled records do not reset themselves to pending. Existing banned, suspended, removed and active members cannot create a request. Closed campaign policies reject new requests while preserving existing pending records.
- A server-only per-account counter limits new pending requests to 10 per rolling 24 hours. All writes are in a Firestore transaction.
- The Join Campaign preview can show request status and optional owned-character selection. Pending requests show a clear waiting message. Character selection is **preference only**, not a link or transfer.
- The existing v1 joining flow is unchanged. Unknown and legacy campaigns do not accept these new join requests.
- Browser Firestore Rules continue to deny direct reads/writes of join request and counter documents; the callable returns only the signed-in user's own limited status.

## Safe activation

**Default: disabled.** Backend `ASTERIA_JOIN_REQUESTS_ENABLED=1` is needed for submission; website `window.AsteriaFeatureFlags.campaignJoinRequests=true` in `index.html` is additionally needed to enable the form. `campaignJoinPreview` (Phase 3.1) must also be activated after deploying the new preview Cloud Function and testing the intended Firebase project.

Do not activate the UI until the updated Functions are deployed and authenticated end-to-end checks pass. Simply merging source into `main` does not deploy Functions, Rules or migrate campaigns. No existing campaign is switched to v2 by this update.

Because Phase 3.3 does not exist yet, **GM approval is unavailable** even if a pending request can be submitted. Do not enable on production before a GM can review and approve requests.

## Tests

- Unit suite: initial status, duplicate idempotency, terminal statuses, ownership validation, missing/forged UID or campaign, inactive members, closed policy, throttle, and no member/character writes.
- Firebase emulator: pending request cannot read protected campaign documents, client cannot forge approval, character ownership proof, legacy denial, banned-user denial, closed policy, and retained gameplay data.
- Standard CI: `npm test`, Firebase emulator suite, lint, production bundle build, and asset consistency checks.

## Deferred to Phase 3.3

GM request queue, Approve/Decline actions, transactional membership creation and capacity enforcement, notifications and history. No approval code is introduced in Phase 3.2.