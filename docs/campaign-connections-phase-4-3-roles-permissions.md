# Campaign Connection Upgrade — Phase 4.3: Roles, Permissions and GM Activity

## Scope
This update adds owner-controlled canonical membership roles and explicit Co-GM capabilities, with a read-only GM audit timeline. It does not transfer ownership, moderate campaign members beyond Phase 4.2, link characters, or deploy production Firebase backend changes.

## Canonical role policy
- **Owner** is sourced only from the campaign root's authoritative `ownerUid`. The owner cannot change their own role, transfer ownership through role management or be demoted.
- **Co-GM** is an active member with canonical role `co-gm`. Existing Firestore and Storage rules authorize GM-only resources based on this role, not on legacy `gmUids` or `roles` lists. Co-GMs are not automatically allowed to moderate player accounts or review join requests.
- **Player** is an active member with canonical role `player`. Players cannot change any role or grant permissions.
- The owner may promote active Players to Co-GM or demote active Co-GMs to Player. Inactive members must be restored using Phase 4.2 first. Demoting a Co-GM consumes a Player capacity slot and fails if no slot is available.
- Role changes reset all delegated capability overrides to an empty object, preventing lingering permissions.
- Only the owner may enable or disable the two existing capabilities on an active Co-GM:
  - `review-join-requests` — grants access to review pending applications using the Phase 3.3 server validator.
  - `moderate-members` — allows the Phase 4.2 validator to suspend, remove or restore ordinary players, but not ban or moderate another Co-GM.
- Unknown capability keys, malformed IDs, invalid revisions, mismatched member projections, legacy campaign schemas, inactive accounts and unauthorized callers fail closed.

## Atomic state, revision and history
The server validates owner UID from Firebase Auth, canonical campaign/member/projection identities, member role and revision. Each accepted action is one Firestore transaction updating the member, private account projection where relevant, campaign membership revision and an immutable `membershipRoleEvents/{memberUid}-{revision}` event. Identical retries are idempotent. Unrelated character, XP, inventory and gameplay data are untouched.

New server read-only `listCampaignMembershipActivity` merges bounded slices of existing `joinReviewHistory`, `memberModerationEvents`, and new `membershipRoleEvents`. It is available only to the owner or a currently active canonical Co-GM. The response returns limited identity/status/activity fields, not private character sheets. The frontend uses `textContent` to render all activity entries.

## Website
Campaign Forge → Manage Campaign uses the approved roster panel to display owner-only **Make Co-GM**, **Make Player**, and per-capability **Enable/Disable** buttons. Each action requires confirmation. A separate GM Activity History area shows the most recent 40 events with refresh. Existing approved artwork and React dashboard bundles are unchanged.

## Activation
All changes are **disabled by default**. The backend requires `ASTERIA_ROLE_PERMISSIONS_ENABLED=1`, and the website requires `window.AsteriaFeatureFlags.campaignRolePermissions=true`. The existing roster must also be activated. Earlier canonical Firestore and Storage rules, membership projection reconciliation and join-review APIs must be deployed and authenticated before activation.

No backend deployment or automatic migration of production legacy campaigns occurs in this PR. Previously loaded/offline client data is not retroactively removed merely by server role changes.

## Verification
Run `npm test`, Firebase emulator integration tests, lint, production build and bundle consistency. Test owner versus unauthorized callers, role transition capacity, stale revision, projection mismatch, demotion clearing overrides, canonical GM permission changes, owner preservation, optional capability restrictions, activity history authorization, and no changes to gameplay data.

The next roadmap step is Phase 5.1 Character Linking, which is not part of this implementation.
