# Campaign Connection Upgrade — Phase 2.2: Membership records

**Baseline:** main commit \`fbf5830692af2ff10c921f1aa33064129ba3d3b0\`.
**Scope:** member data model and safe, server-controlled preparation of existing campaign rosters. **Not** the membership access/rules cutover.

## Membership model

Canonical future document: \`campaigns/{campaignId}/members/{uid}\`.

- Roles: \`owner\`, \`co-gm\`, \`player\`.
- Member statuses: \`active\`, \`suspended\`, \`removed\`, \`banned\`.
- Joining \`pending\` is not a membership status; it belongs to a future \`joinRequests\` record.
- Fields: \`campaignId\`, \`uid\`, \`role\`, \`status\`, \`joinedAt\`, \`updatedAt\`, \`invitedByUid\`, \`approvedByUid\`, \`lastStatusReason\`, \`revision\`, \`origin\`, \`capabilityOverrides\`.
- \`owner\` must remain \`active\`. Legacy extra GMs map to \`co-gm\` but **do not** receive new admin capability grants.
- Membership documents do not contain private player emails, character sheets, inventories, XP or owner-secret invitation data.
- New server-allocated campaigns create their owner's member record in the same transaction as the campaign and permanent UCN. The campaign itself stays at **legacy schema** until Phase 2.3.

## Existing campaign staging

\`legacyMembershipPlan(campaign,id)\` converts only the current legacy authorization sources: ownerUid, gmUids, playerUids and roles. A \`players[uid]\` entry on its own is **not** proof of active membership.

- Existing \`players[uid].status\` values suspended, removed or banned stay denied in the staged document. Inactive former players without any current role/UID membership are included as denied tombstones.
- Unsupported status/role, malformed ID, owner status conflict, orphan active player, or more than 100 members are **review issues**. Never coerce a questionable record into active membership.
- \`stageLegacyMemberships(db,actorUid,campaignId)\` reads the campaign and current member documents in one Admin transaction, requires the *verified owner UID* and returns a dry-run preview by default. It does not accept a client-supplied roster or arbitrary membership status.
- Write mode stages only **missing** member records by transactional \`create\`. It never edits already-staged, suspended, removed, banned, or previously revised member documents. A role/status/identity conflict blocks the entire write.
- Re-running an unchanged campaign is idempotent. The original campaign, all gameplay subcollections, saved character documents, existing UCN, account mirrors and invite records are untouched.
- No bulk-all-campaign migration is provided in this phase.

## Callable and access safeguards

\`asteriaMembershipPreparation\` is a new authenticated Callable Function:

- \`{action:'preview',campaignId}\` returns a limited owner-only migration preview.
- \`{action:'stage',campaignId}\` writes ONLY if the separately deployed backend environment variable \`ASTERIA_MEMBERSHIP_STAGING_ENABLED=1\` is deliberately set. Default: **disabled**.
- There is no automatic staging from browser login or campaign save. No UI invokes this callable.
- Stage is **not** a join or approval API. It never writes \`membershipSchemaVersion=2\`, legacy role arrays, member snapshots into personal accounts, or character links.
- Firestore Rules currently deny ordinary browser reads/writes to \`campaigns/{id}/members/{uid}\`; Admin SDK can create them. A member record is not yet an access credential.
- Existing \`asteriaInvite\`, character ownership, Firebase membership reads, Storage rules, and all other gameplay authorization still use the existing v1 paths. A suspended/banned staged status cannot itself revoke v1 access until Phase 2.3.

## Rollout and test requirements

1. CI checks: run \`npm run test:campaign-membership\`, full \`npm test\`, \`npm run test:firebase\`, lint, build and generated-asset diff.
2. Validate owner, Co-GM and Player mapping; orphan active rows; inactive tombstones; owner guard; bad IDs; 100-member bound; idempotency and conflict refusal.
3. Validate Firebase browser cannot read or forge membership docs, while existing party character reads remain unchanged.
4. Verify any deployed Functions do not have \`ASTERIA_MEMBERSHIP_STAGING_ENABLED\` set. Do not stage live campaigns without a reviewed migration runbook and explicit owner decision.
5. Phase **2.3** must complete all Firestore/Storage/Function/UI authorization gates **before** enabling \`membershipSchemaVersion=2\` on a campaign. Do not combine old and new checks with \`legacyMember || newMember\` for migrated campaigns.
6. Migration rollback must never restore old-array access to accounts intentionally revoked under v2. Do not wipe existing member tombstones.

## Limitations

This update adds the model, owner initialization, guarded per-campaign staging and tests. It does **not** implement suspension actions, a GM member-management interface, join-request submission or approval, email/link invitations, automated migration of real campaigns, client discovery of member records, or the v2 permission cutover. Those remain within the approved later phases.

**Operational state:** production Firebase backend deployment is handled separately; merging this PR does not imply the callable has been deployed to production.
