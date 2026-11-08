# Campaign Connection Upgrade — Phase 5.1: Character Link Requests

**Scope:** Existing saved-character selection and Character Forge handoff for an **already active** v2 campaign member. This is *request creation*, not GM approval, party admission or character import. Phase 5.2 implements review/approval; Phase 5.3 implements unlink/deactivation.

## Implementation
- `campaigns/{campaignId}/characterLinks/{sha256(uid + NUL + sourceCharacterId)}` is a server-owned, deterministic pending record.
- `characterLinkKeys/{sameDigest}` reserves the same owner/source pair. A unique `linkchar-<UUID>` campaign character ID is reserved and never used to overwrite a Forge ID.
- `auditEvents/character-link-{digest}` records the request without an email, token or full sheet.
- The Phase 3/4 authenticated callable accepts `character-link-request` and `character-link-status`, taking the UID **only** from Firebase Auth.
- Only an active canonical member with a matching account projection can request. Owner identity remains tied to the campaign root; malformed membership and legacy/non-v2 campaigns fail closed.
- A valid private `users/{uid}/characters/{sourceCharacterId}` record must already exist and verify ownership. A pending request does not write to it, to campaign gameplay characters, to the active party, or to any legacy access list.
- Pending retries are idempotent; inactive and conflicting reservations are rejected rather than recreated.
- The GM's explicit `allowPlayerLinkCharacter` and `allowPlayerCreateCharacter` settings are respected (the latter for Forge-tagged flows). Capacity checks account for existing party/gameplay indexes and active or pending canonical links. Linking must not be considered equivalent to campaign membership.
- Browser clients have **no direct write access** to the new characterLink, characterLinkKeys or audit collections under existing Firestore rules.
- The existing Campaign Forge selector and Character Forge handoff display a pending-approval message for v2. Legacy campaigns retain their current behavior. The UI cannot grant approval.
- No changes to approved art, React dashboards, HP/SP/MP, XP, inventory, owned sheets, session authority or character image assets.

## Activation and limitations
This code is **disabled by default**. The backend requires `ASTERIA_CHARACTER_LINK_REQUESTS_ENABLED=1`; the website requires `window.AsteriaFeatureFlags.campaignCharacterLinks=true`. Both should remain off until the earlier membership, cutover and join-review stack is deployed, and authenticated multi-account + emulator checks pass. This PR does **not** deploy Cloud Functions, Firebase Rules, enable production flags, migrate live data or claim physical-device testing.

`sourceKind` distinguishes the Forge handoff from saved-character selection in the UI. The server verifies saved-sheet ownership but does not certify a sheet's creation origin; a future hardened setting can use a server-authored creation origin if this becomes a strict policy requirement. Do not treat this label as security authority.

The capacity policy deliberately fails closed on invalid configured limits or malformed legacy link rows. For campaigns with missing capacity metadata, it uses the established party-size setting and a conservative one-character-per-account default, until GM settings are explicitly migrated.

## Verification
Run `npm run test:campaign-character-links`, `npm test`, `npm run test:firebase`, `npm run lint`, `npm run content:check`, `npm run build` and verify generated website bundles are unchanged except for intended assets. Test ownership, pending retry, stale membership, account mismatch, Forge settings, limits, legacy collision, and isolated account IDs.

Manual tests after **separate** backend activation: sign in as an approved player, request an existing character, create a new Forge character, refresh and confirm pending status without party entry; test disabled settings, simultaneous requests and GM read-only visibility. Phase 5.2 is required before any approval can occur.
