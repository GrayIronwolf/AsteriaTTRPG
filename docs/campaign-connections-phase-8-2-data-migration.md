# Campaign Connection Upgrade — Phase 8.2: Data Migration Rehearsal

**Approved scope:** Prepare and verify the data transition from existing campaign membership, UCNs and linked characters to canonical v2 records, with owner verification, reproducible dry runs, conflict reporting, safe rehearsal and a rollback plan. **Do not activate production data migration or start Phase 8.3.**

## Baseline and architecture audit

- Base: `main` at `f300cef55db13a98cdf59ee7ddb31acf74c8ea77` after Phase 8.1, PR #113.
- Existing owner-only `stageLegacyMemberships` and `prepareCampaignCutover` already provide staged canonical member records and transactional v1→v2 cutover. Both production mutation gates are disabled by default.
- `campaigns/{id}/members/{uid}` holds authoritative v2 membership. `campaignMemberProjections/{uid}/campaigns/{id}` is private discovery metadata, **not** authority.
- Source character ownership stays at `users/{uid}/characters/{sourceId}`, while existing campaign gameplay remains at `campaigns/{cid}/characters/{campaignCharacterId}`. `characterLinks` and `characterLinkKeys` use SHA-256 of `uid + NUL + sourceCharacterId`, one reservation per owner/source, and must never overwrite existing character records.
- Legacy `campaignInvites/{ucn}` is a compatibility credential for v1 and cannot remain the access grant for v2; `campaignDirectory/{ucn}` must point to the same owner and campaign, without duplicate UCN assignments.
- Recipient email information in historical `campaign.invites` is still privacy-sensitive. A rehearsal must not replicate it into member projections, logs, exports or member-visible records.
- Permission enforcement is versioned in Firestore/Storage/Functions. Never roll a revoked v2 user back into v1 UID arrays to recover access.
- The React UI, approved artwork, website panels, inventory, XP, GM systems and account-owned sheets remain unchanged in this phase.

## Implementation

New `functions/campaignMigrationRehearsal.mjs` exposes `rehearseLegacyCampaignMigration(db, authenticatedOwnerUid, campaignId, options)` **for direct trusted tooling and tests only**. It is **not** exported as a Firebase callable and is not invoked from the website.

- **Default `stage:false`:** read-only verification. The owner identity, campaign version, legacy role/status plan, canonical member conflicts, UCN registry and legacy mapping, ownership of every bounded shared character, private Forge source sheet, source-to-campaign mapping, existing link reservations and duplicate source IDs are checked. Reports contain counts and code-only diagnostics, never raw invitations, account UIDs, email addresses, token digests or gameplay payloads.
- **`stage:true`:** strongly locked to `demo-asteria` and `FIRESTORE_EMULATOR_HOST` at localhost/127.0.0.1. A real production Firestore project is rejected. Any audit error or privacy/ownership-mapping warning aborts the transaction. All reads happen before any writes; only missing membership docs, directory records and matching character-link/key reservation records are created.
- No direct write to existing membership, campaign, character, owned sheet, invitation, legacy UCN mapping, client mirror, account projection or feature-flag data.
- Existing inactive members retain denied statuses; an inconsistent or newer canonical member record blocks migration, it is never reset to active.
- Link candidates require a canonical campaign character document, consistent legacy owner, active legacy membership and a **verified private source sheet**. Missing/contradictory mappings and conflicts block writes. Two owners may share the same source ID because reservations include owner UID.
- Existing canonical links are compared for identity, status, revision and reservation matching; unexpected extra links and unlisted active canonical members require owner review.
- Numeric safety bounds: 100 members and 80 character records per campaign, with no partial processing beyond the limit.
- No implicit full-data export, no automatic cross-campaign enumeration, and no migrations on account sign-in or page load.

## Release and rollback checklist

1. **Backup** the entire Firestore database using the production Firebase/GCP export facilities and preserve Storage/Rules configuration and deployed Functions versions. Verify backup integrity and restore procedures before any production writes. Never commit real backup data or secrets to GitHub.
2. Deploy and verify correct versioned backend Rules/Functions manually **before** considering any cutover; check the independent feature flags and the Firebase project identity. GitHub Pages deployment alone is not a Firebase backend deployment.
3. For each selected owner-approved campaign, run the dry-run reconciliation; validate the permanent UCN, owner, active and inactive member roles, current joins/invitations, canonical reservations, private source identity, gameplay character snapshots and all unresolved warning codes. Keep a private operator-side run record.
4. Resolve conflicts manually against the authoritative original data. Do **not** guess owners from names or infer email recipient authorization from an invitation record.
5. Rehearse any proposed data repair and repeated staging **in a sandbox emulator** with representative snapshots; include account switching, revoked access and stale client mirrors. The code in this PR never reads real production data or stages production.
6. A subsequent separately approved migration operator must create a small, explicit, versioned execution manifest, backup, ownership authorization, failure ledger and per-campaign rollback plan. Never auto-activate Phase 8.2 staging from a merged PR.
7. Before v2 cutover, reconcile any privacy-sensitive legacy invites and private character mapping warnings. The atomic existing cutover may be considered only after every Rules/Storage/Functions/mobile/dashboard consumer is ready.
8. Roll back unsuccessful pre-cutover **emulator** staging by restoring the known pre-run emulator fixture; do not delete canonical records in a live campaign to imitate rollback. After a v2 cutover, retain v2 restrictive authorization and reconcile access; never blindly set `membershipSchemaVersion=1` or union legacy roles to restore access.
9. Require a separately approved Phase 8.3 for production activation, authenticated real-account/mobile/tablet/desktop tests and monitoring.

## Verification

- `npm run test:campaign-migration`: dry-run purity, owner gate, emulator-only staging, no existing-data mutation, idempotence, banned-member conflict, missing owner/sheet, source mapping mismatch, invitation privacy, UCN collisions, unsupported schema and same-ID/different-owner cases.
- `npm run test:firebase`: emulator integration verifies actual Firestore transactions preserve campaign and character records, denied browser access, no schema cutover and unchanged bans.
- Existing CI also runs production dependency audit, content validation, lint, full game and dashboard regressions, XP/data sync, production build and artifact consistency checks.
- **CI cannot verify a live production backup, existing real campaigns, production Functions/Rules configuration or authenticated real-device compatibility.** These remain explicit rollout blockers, not implicit passes.

**Phase 8.2 is preparatory verification and safe migration rehearsal only; no production data migration is performed by this PR. Do not start Phase 8.3 automatically.**
