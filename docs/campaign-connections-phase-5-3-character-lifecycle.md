# Campaign Connection Upgrade — Phase 5.3: Character Deactivation and Unlinking

**Scope:** Safely remove a character from live campaign participation while preserving its original account-owned Forge sheet, latest verified gameplay, ownership, and an immutable server audit trail. V2 canonical campaigns only; no automatic activation, migration, or changes to approved graphics.

## Lifecycle transitions

| Starting status | Action | Who | Result |
| --- | --- | --- | --- |
| Pending | Withdraw | Character owner | Declined; may submit a fresh request later |
| Approved | Deactivate | Campaign owner or active Co-GM with `moderate-members` | Inactive; gameplay archived; active party/roster reference removed |
| Inactive | Restore | Same GM permission | Approved; archived gameplay restored under the **same campaign ID** |
| Approved / inactive | Unlink | Character owner or authorised GM | Unlinked; gameplay archive retained, permanent terminal state |

**No delete-character action exists.** A terminal unlinked character cannot be restored or re-requested under the same reservation; any future return requires a separately designed review/migration flow, not an implicit reset.

## Storage and identity guarantees
- `campaigns/{cid}/characterLinks/{digest}` retains the deterministic reservation, immutable source and campaign character IDs, and revisioned lifecycle status.
- The matching `characterLinkKeys/{digest}` remains server-managed; a link cannot be reallocated to another account.
- On deactivation or active unlink, the complete server-read `campaigns/{cid}/characters/{characterId}` is archived at `campaigns/{cid}/archivedCharacters/{characterId}` (server-only) before deleting the active copy in **the same transaction**.
- The original private Forge sheet remains at `users/{uid}/characters/{sourceId}`. Gameplay fields are mirrored from the verified active sheet to the Forge record. Private identity/backstory/private metadata not included in the mirror remains unchanged.
- Active `party`, `players[uid].characterIds`, `characters` summary, and `playerCharacterLinks` are removed from the campaign root transactionally, but **account membership stays unchanged**.
- Private `campaignCharacterIds[cid]`, `linkedCampaignIds` and primary shared campaign link are removed (other campaign mappings remain). Re-activation recreates the active gameplay record from the archive and reinstates explicit ownership mapping, assuming current membership, settings, capacity and Forge gameplay match.
- Unlinking an inactive record marks the archive as unlinked but does not delete or change it otherwise.
- A revision-specific audit event records actor, prior state, requested action, resulting state, and character IDs, with no inventory or private character notes.
- Live encounter participants must leave or end their encounter before deactivation/unlink. Conflicting newer Forge gameplay or mutated indices fails closed rather than silently losing inventory/XP. Revision checks prevent stale concurrent decisions.
- Full gameplay archives are **not** readable/writable by browser clients under the existing no-match default. New Firestore rules also forbid **all v2 client-side character creation/deletion**, preventing stale browsers from resurrecting archived campaign character IDs. Legacy v1 client imports remain supported. Direct character updates require an active `linked` state.
- The Firebase bridge now uses update-only progression and character saves instead of `set(..., merge:true)` on missing records; locally cached generated campaign character IDs are pruned once no longer active. Server gameplay commands already require a live character document.
- Live history such as encounter logs, quests and prior notifications is retained; archival of a character record does not erase those historical references.

## Permissions and user experience
- Backend gate: `ASTERIA_CHARACTER_LIFECYCLE_ENABLED=1` enables list/change actions in `asteriaCampaignJoinReview`.
- Website gate: `window.AsteriaFeatureFlags.campaignCharacterLifecycle=true` enables the GM's **Manage Campaign Characters** panel and an account owner's **Unlink My Character** button (or pending withdrawal).
- Player identity is derived from Firebase Auth; a GM supplies only a server-issued digest, never an owner UID or sheet payload.
- An authorised GM can list deactivatable and inactive character references, deactivate, restore, and unlink; a player can withdraw their own pending request or unlink their own approved/inactive character, never other players' characters.
- UI requires explicit confirmation, uses safe text rendering for server-returned labels, and refreshes campaign data after state changes.
- Server rejects legacy campaigns, non-current revisions, contradictory records, active encounters, unauthorised Co-GMs, and restoration into over-capacity or inactive-member campaigns.

## Activation status and verification
Both backend and website flags remain **off by default**. This phase does not deploy Cloud Functions, activate Firebase rules, or migrate active production campaigns. Turn on only after Phase 5.1/5.2 dependencies, coordinated rules rollout, Firebase emulator checks, and authenticated cross-account/stale-device testing.

Tests cover pending cancellation, GM permissions, original-sheet and gameplay preservation, archive/restore, revision idempotency, terminal unlink, capacity, source identity, in-combat blocking, stale cache and browser resurrection attempts. Run the standard full test, Firebase emulator, lint, production audit, content validation, build and committed-asset consistency workflow before merging.

**Phase 5.4 or later is not started by this update.**
