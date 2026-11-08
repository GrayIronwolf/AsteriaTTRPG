# Campaign Connection Upgrade — Phase 4.2 GM Player Controls

**Scope:** Suspend, Restore, Remove and Ban members of upgraded v2 campaigns. Phase 4.3 role and capability administration is separate.

## Server authorization

- Authenticated callable dispatch `asteriaCampaignJoinReview({action:'member-control',memberAction,...})`; server activation requires `ASTERIA_MEMBER_CONTROLS_ENABLED=1`.
- The owner can moderate Player and Co-GM accounts, never the owner or themselves. An active Co-GM needs canonical `capabilityOverrides['moderate-members'] === true` to moderate ordinary Players. Delegated Co-GMs cannot ban, restore a banned account, or moderate another Co-GM.
- Suspend moves active → suspended. Remove moves active/suspended → removed. Ban moves active/suspended/removed → banned. Restore moves suspended/removed/banned → active; restoring a banned account requires the owner. Self-moderation, unknown membership schemas and v1 campaigns are blocked.
- Remove/Ban require a recorded 4–240-character reason; all actions require confirmation in the UI.
- Every transaction checks member UID, campaign ID, canonical role/status, expected revision, expected original status, active moderator permissions and matching account projection. Stale/conflicting data fails closed. Exact authorized retries are idempotent.
- In one transaction, update membership status and revision, the private account-discovery projection status, campaign membership revision, and a permanent member moderation audit entry.
- Restoring a Player requires an available canonical active-player slot. Character linking and gameplay state never change.

## Immediate access revocation

V2 Firestore and Storage rules authorize only **active canonical membership**. Suspend/Remove/Ban immediately block subsequent authenticated campaign reads/writes (session, party, shared characters, artwork and trusted gameplay actions), regardless of stale legacy UID arrays. User-owned characters remain accessible to their owners.

Existing campaign data, XP, inventory, ownership, linked character records and history are retained. Do not delete campaign member documents to represent removal. Previously downloaded offline copies and already-issued public Storage download URLs cannot be retroactively recalled by membership-status changes; this is an important residual limitation.

## GM interface

- Phase 4.1 roster displays only server-derived allowed actions for each member.
- Confirm Suspend/Restore/Remove/Ban; additionally require a reason for Remove and Ban.
- Refresh roster and account-discovery state after a successful server response. No permission to moderate owner or self is displayed.
- Responsive actions use the existing Asteria panel style. No React production bundle, approved artwork or gameplay systems changed.

## Activation and verification

Both switches remain disabled: server `ASTERIA_MEMBER_CONTROLS_ENABLED` and website `window.AsteriaFeatureFlags.campaignMemberControls`. The Phase 4.1 roster must also be enabled. Deploy and verify the earlier canonical Rules/Functions and authenticated multi-account revocation first. This PR does not deploy Cloud Functions or migrate a production campaign.

Unit and Firebase emulator suites test every transition, GM versus Player permissions, owner protection, Co-GM delegation, stale revision and projection denial, restore capacity, immutable audit record, and preserved character data. Require all CI, lint, production build and bundle checks before merge.

Phase 4.3 member role/permission administration remains deferred.
