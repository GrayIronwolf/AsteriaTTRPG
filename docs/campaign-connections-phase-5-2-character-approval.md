# Campaign Connection Upgrade — Phase 5.2: GM Character Approval

**Scope:** Authenticated GM read/review of Phase 5.1 pending character links. Add a verified account-owned sheet to an upgraded campaign only on approval. A decline creates no campaign gameplay record and never alters the owner's saved character.

## Authorization and transaction contract
- `asteriaCampaignJoinReview` handles `character-link-list` and `character-link-review` only when backend `ASTERIA_CHARACTER_LINK_APPROVAL_ENABLED=1`.
- Campaign must use **v2 canonical membership**. Owner may review; an active canonical Co-GM needs the explicitly delegated `review-join-requests` capability. Other members, stale Co-GMs, banned/suspended accounts and legacy role arrays cannot approve.
- GM queue returns bounded, safe identifiers and timestamps, not private sheets or email addresses. Frontend displays account and saved character references using `textContent` and requires confirmation.
- Review requires a current request revision and checks link/key identity, active owner membership and matching account projection, genuine private Forge ownership, GM link settings, campaign character ID collision, and player/total character capacity. All validation occurs before transactional writes.
- Approval creates `campaigns/{campaignId}/characters/{campaignCharacterId}` using an explicit allowlist of published profile and gameplay fields from the **server-read** private source, while preserving XP, resources, coins, inventory and other allowed gameplay state.
- The owner keeps `users/{uid}/characters/{sourceCharacterId}`; only its link metadata is updated (`campaignCharacterIds[campaignId]`, `linkedCampaignIds`, and `sharedCampaignId` when absent). The source sheet is neither moved nor replaced, and private non-allowlisted fields are not copied.
- The same transaction updates campaign `party`, `characters`, `playerCharacterLinks` and `players[uid].characterIds`, the canonical link status/revision, and an immutable audit event.
- Decline only changes the link record and creates audit. The player may retry the declined request at a higher revision, while a stale GM approval cannot apply. Approval/decline retries by the same reviewer are idempotent.
- Approval cannot retroactively recover downloaded copies or force offline clients to discard cached data. The new campaign-scoped gameplay character ID is distinct from the owner's Forge ID; existing ownership verification and saved-progress lookup are adapted to use the explicit mapping.
- No changes to existing legacy campaign linking, artwork, panels, combat commands, XP calculations, inventory mechanics, Firebase security rules or physical-device settings.

## Activation and known limits
Feature stays **disabled by default** in backend and website. `ASTERIA_CHARACTER_LINK_APPROVAL_ENABLED=1` and `window.AsteriaFeatureFlags.campaignCharacterApproval=true` require separate reviewed activation after Phase 5.1 and earlier membership/rules deployment. PR does not change production Firebase, cutover campaigns or migrate live characters.

This update delegates character review to the established `review-join-requests` Co-GM capability. Future work may split this into a separate owner-configurable `review-character-links` capability. The `sourceKind` marker is user-supplied and is not an independently attested new-character creation record. Approved sheets are subject to the current published field allowlist; custom future fields require explicit mapping rather than broad copies.

## Verification
Run new Node tests, all `npm test`, Firebase emulator regressions, lint, content integrity and production build; check committed asset consistency through GitHub Actions. Verify no disclosure of nonallowlisted source fields, no writes on decline, retry/revision safety, collision and capacity checks, owner mapping, source sheet integrity, account separation and backend-disabled behavior.

**Phase 5.3** unlink/deactivation is not included and is not activated here.
