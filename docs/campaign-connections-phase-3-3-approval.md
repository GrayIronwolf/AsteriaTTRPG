# Campaign Connections — Phase 3.3: GM Approval

**Scope:** GM join-request review, Approve/Decline, owner-controlled optional auto-approval, server-side capacity validation, and player membership/status feedback. No Phase 4 roster moderation or Phase 5 character-link implementation.

## Access and behavior

- `asteriaCampaignJoinReview`: authenticated callable with `list`, `review`, and `mode`.
- Review list is available to verified Owner or an active v2 Co-GM explicitly granted `review-join-requests`; other users cannot enumerate applicants. It returns only minimal pending request metadata.
- Owner/authorized reviewer can **Approve** or **Decline** a pending request with an expected request revision; stale, forged, already resolved or conflicting requests fail closed. Repeated identical decisions are idempotent.
- Approve transaction creates `campaigns/{id}/members/{uid}` with canonical active Player role and the private account `campaignMemberProjections/{uid}/campaigns/{id}` record. It increments the campaign membership revision to serialize concurrent approvals. A persistent `joinReviewHistory/{uid}` event and request review status/revision are written in the same transaction.
- Decline updates only request status/history, never membership.
- Capacity is enforced against **canonical active Player records**, not the number of linked characters or legacy UID arrays. Campaign root `playerLimit` is first priority, otherwise `partySize` / `settings.partySize`, then a safe 12-player default. Invalid limits fail closed.
- The selected owned character from Phase 3.2 is a **preference only**. Approval does not transfer, link, change XP or inventory, or authorize a GM to view the player's source character.
- Player's existing `joinRequestStatus` query returns approved/declined; successful membership also activates Firestore access and account discovery projection.
- Default approval is **manual**. Only the verified Owner can set `joinPolicy.autoApprove` using a server transaction. Automatic approval requires the separate backend flag, and new submissions run the same capacity, identity and canonical membership checks; no bypass or fallback.

## UI

- Existing GM Campaign Manager gets a compact Join Requests panel, keeping approved artwork and dashboard structure.
- Pending request list includes applicant UID, optional character preference and submission time. Approve/Decline both require an explicit confirmation.
- Refresh, capacity summary, pending count, approval feedback, and owner-only manual/automatic setting.
- When the frontend activation switch is disabled, the component does not display and existing dashboard behavior is unchanged.

## Deployment safety

The following flags are disabled by default and must be enabled only after backend, Firestore Rules, Storage Rules, and authenticated multi-account integration tests are verified:

- `ASTERIA_JOIN_REVIEW_ENABLED=1` enables reviewed Approve/Decline and owner mode changes.
- `ASTERIA_AUTO_APPROVE_JOIN_REQUESTS_ENABLED=1` separately permits automatic approval.
- Website `window.AsteriaFeatureFlags.campaignJoinReview=true` is separately required for the panel.
- Phase 3.1/3.2 `campaignJoinPreview` and `campaignJoinRequests` controls and backend gating remain in effect.
- No real v1 campaign is automatically migrated to v2 and no Firebase production backend is deployed in this PR.

## Verification checklist

Unit and Firebase emulator tests cover Owner/Co-GM permissions, unauthorized players, revision mismatch, declined/approved idempotency, capacity saturation, canonical membership projection, protected pre-existing characters, automatic mode gating and manual fallback.

Review CI lint, all Node tests, Firebase emulators and production build before merge. Backend deployment and real-device authenticated testing remain separate release gates.

## Deferred

Phase 4 introduces member suspend/restore/remove/ban, role administration and GM history. Phase 5 implements character linking permissions and switches. Phase 7 introduces in-app notifications and outbound email invitation delivery. This update does not begin those phases.
