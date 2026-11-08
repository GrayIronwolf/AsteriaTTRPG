# Asteria Campaign Connection Upgrade — Phase 2.3 Access Verification

**Scope:** version-aware authorization, per-campaign cutover checks and safe discovery. No live membership migration is executed by merging this PR.

## Access model

- **Legacy campaigns** (missing or v1 `membershipSchemaVersion`) retain established `ownerUid`, `gmUids`, `playerUids`, `roles` and existing gameplay behaviour.
- **V2 campaigns** (`membershipSchemaVersion=2`) grant access only to the verified owner or a canonical `campaigns/{campaignId}/members/{uid}` record with `status=active` and role `player`/`co-gm`. Suspended, removed, banned or missing/invalid canonical memberships deny access even if legacy role arrays still list the user.
- Unknown versions fail closed; legacy arrays are never OR'ed with v2 membership checks.
- Firestore campaign root, characters, live sessions, party chat, events, systems and presence are version-aware. Firebase Storage campaign artwork and member-shared character galleries use equivalent checks.
- Cloud Functions validate member status before player, GM and combat mutations; old Co-GM role-array membership cannot elevate a v2 player.
- The legacy UCN direct-join operation is blocked for v2 campaigns. Join requests and GM approvals are in Phase 3.

## Controlled transition

- `asteriaCampaignAccessCutover` callable supports owner-only **preview**. Activation is disabled by default, requiring the **server-only** `ASTERIA_MEMBERSHIP_CUTOVER_ENABLED=1` flag and an authenticated campaign owner.
- Cutover requires every legacy member to have a matching, staged canonical role and status (including denied tombstones), valid revisions, and no unexpected extra membership documents. Conflicts block activation.
- A single Firestore transaction writes small private campaign-discovery projections at `campaignMemberProjections/{uid}/campaigns/{campaignId}` and switches the campaign version to 2. This preserves the UCN, source character ownership, XP, inventory, artwork and session data.
- Account projections store only campaign ID, role, status, display name snapshot and timestamp. Only the account holder can read them; browsers cannot write them.
- New legacy-style character linking from a v2 campaign is intentionally blocked until Phase 5's ownership, capacity and approval checks; existing links remain.
- No migration is automatic. Do not switch actual players to v2 before client discovery and character-link flows are ready.

## Client and account switching

- Account discovery also reads private projections and verifies campaign documents under Firestore rules. V2 campaigns absent from verified account discovery are removed from the active dashboard list but retained in a separate transient unavailable cache, without deleting owned sheets.
- A local/full campaign mirror is never v2 authorization. Permission errors in legacy UID-array queries do not regrant membership.
- Revocation prevents subsequent authenticated reads and writes, but previously downloaded local copies and previously issued Storage download URLs cannot automatically be recalled.

## Rollout and rollback gates

1. **Do not enable cutover** until production Firestore Rules, Storage Rules, Cloud Functions and new client are deployed, and authenticated role/account tests pass.
2. Run dry-run reconciliation per campaign, confirm owner and Co-GM roles, all active members, banned/suspended records, UCNs, characters and private projection completeness.
3. Do not set `membershipSchemaVersion=2` directly through Firebase Console. The atomic owner-verified cutover is required.
4. Never revert a v2 campaign to legacy arrays to recover access; this can re-grant access to removed or banned accounts. Retain strict rules and reconcile.
5. Firebase backend deployment remains manual and separate from website build/deployment; merging this PR does not establish backend activation.

## Verification

- New Node tests cover v1 role compatibility, v2 revoked statuses, active Co-GM privileges, forged UID/campaign references and unsupported schema versions.
- Firebase emulator tests cover Firestore/Storage denial, trusted action refusal, old invitation rejection, immutable membership and schema fields, owner cutover, private projections, character-data preservation, and collision/extra-member refusal.
- GitHub CI must pass complete tests, emulator, lint, production build and asset consistency. Real-device tests are out of scope.

## Deferred work

Phase 3 adds join requests and approval. Phase 4 adds membership status changes, role administration and audit. Phase 5 adds v2 character linking. Phase 6 adds secure separate invitations. Final production rollout is Phase 8.
