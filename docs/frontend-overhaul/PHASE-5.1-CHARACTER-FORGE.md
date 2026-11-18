# Phase 5.1 — React/Vite Character Forge

## Implementation

This phase migrates the existing eleven-tab Character Forge from `js/asteria-gameplay-systems.js` to React modules, using public-only Compendium projections from the existing canonical source. No second Compendium database is created.

- Guided Race, Class, conditional Patron, Appearance, Origin, Characteristics, Magic, Skills, Affinity Rolls, Equipment and Review steps
- Existing single/dual-class selection with locked primary class when editing
- Class-based elemental magic slots, required elements, religious patrons, Mancer advantage and four starting skills
- D100 affinity roll confirmation and one starting equipment pack
- Character list and editable private character profiles loaded from `users/{uid}/characters`
- Existing nested `character` creation payload, resource/characteristic fields and Forge class/race identity
- Existing character progression, inventory/rewards, owner, campaign links and GM granted magic remain intact on edits
- Public playable Forge rules are generated from the same canonical Compendium partitions, strictly limited to approved player-facing fields; GM-only and raw source data are not bundled

## Security/compatibility

The authenticated, canonical profile owner is required. Firestore reads use the signed-in UID, and linked private characters must pass server-owned campaign-character verification before being shown. Saves use Firestore transactions and reject stale revisions, missing documents, changed campaign links and owner mismatches. No guessed owner, localStorage fallback, implicit offline personal character or cloned GM-viewed character is accepted.

This is an opt-in isolated React feature (`VITE_ASTERIA_CHARACTER_FORGE_ENABLED=true`) requiring the existing Auth adapter. The default offline preview, live website and Firebase services remain unchanged. No campaign joining, character dashboard access or campaign-state mutations are activated by this phase.

## Validation

Phase 5.1 tests assert creation/edit payload compatibility, race bonuses, magic and skills, permissions, restricted asset filtering, and protection of current gameplay data. Browser acceptance uses existing Auth/Firestore emulators to create/edit/reload a character and verify second-account isolation. Earlier browser regressions and Firebase security tests remain mandatory.

Campaign linking and membership will be migrated in Phase 5.3, and end-to-end cross-Forge compatibility is verified in Phase 5.4. No interim production deployment.
