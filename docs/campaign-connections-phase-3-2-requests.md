# Campaign Connection Upgrade — Phase 3.2: Join Requests

**Scope:** authenticated player requests, one pending request per player and campaign, optional character preference, and a player-visible status. GM approval and actual membership activation are **Phase 3.3**.

## Request rules

- Canonical path: `campaigns/{campaignId}/joinRequests/{uid}`. The trusted callable uses Firebase Auth's UID, not a user-supplied UID, and validates exact campaign ID and permanent UCN.
- Only campaigns already using `membershipSchemaVersion=2` accept requests. Legacy campaigns keep the existing invite-join flow.
- `status` returns one safe summary for the signed-in applicant. A nonexistent request is `none`, while existing `pending`, `approved`, `declined`, `cancelled`, or `expired` records are returned without leaking a roster.
- `submit` creates a **pending** request in one Firestore transaction, with deterministic identity. Repeated submissions return the existing request and do not create a duplicate, replace terminal statuses, or charge the daily limit again.
- The owner and existing active members are already members. Suspended, removed, and banned accounts are blocked. No request bypasses a previous ban.
- Optional selected character ID must refer to a saved character with matching owner UID under `users/{uid}/characters/{id}`. Only the preference ID is stored: the sheet, inventory, XP, character owner, and linked campaign are never mutated or copied.
- At most 10 new request documents per account per rolling 24 hours; server-managed `campaignJoinRequestThrottle/{uid}`.
- Firestore browser rules only let the applicant get their own request (and permit v2 GMs to view the queue). Ordinary clients cannot create, edit, approve or delete requests. All existing v1 permissions remain unchanged.
- **No campaign membership record, role, activity, private account mirror, party membership or projection is changed by a request.**

## Deployment / activation

- Cloud Function: `asteriaCampaignJoinRequest`, with `status` and `submit` actions.
- Submission is disabled by default on the backend unless `ASTERIA_JOIN_REQUESTS_ENABLED=1` is explicitly configured.
- Both `window.AsteriaFeatureFlags.campaignJoinPreview` and `window.AsteriaFeatureFlags.campaignJoinRequests` remain `false` in `index.html`. Existing legacy joining remains available. Turning on the new frontend flags requires the updated Cloud Function *and* Firestore rules to be deployed and verified.
- The preview for v2 campaigns shows pending / blocked / approved status when available and a **Request to Join** button only when server status is `none` and submission is enabled.
- The applicant can nominate an owned character or choose no preference. The request remains pending; no access is granted until a GM's reviewed approval in Phase 3.3.

## Acceptance tests

- Duplicate requests; no accidental membership, roster, or character writes.
- Active and blocked members, owner accounts, terminal requests, forged campaign IDs/UCNs, invalid/foreign character IDs.
- Applicant-only request status, GM queue visibility only for v2, no direct client request writes or approvals, and no v1 queue disclosure.
- Transactional daily-limit updates and no counting repeated requests.
- Preview/account/UCN revalidation after asynchronous Firebase responses.
- No changes to approved Asteria artwork, panels, dashboard gameplay or progression.

**Not included:** approval/decline decisions, auto-approval, invitation-token workflow, email notifications, or live production migration. Those remain in later roadmap updates.
