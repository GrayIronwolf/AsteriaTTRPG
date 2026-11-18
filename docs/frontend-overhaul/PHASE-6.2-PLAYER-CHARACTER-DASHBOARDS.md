# Phase 6.2 - Player and Character Dashboard Migration

## Implemented scope
The new isolated React/Vite application now owns both saved private character routes and campaign-linked character routes. It reads existing Firestore documents with the already-initialised Auth provider and uses an opt-in Player Dashboard flag. No legacy dashboard mount or CSS layering is introduced.

- Private owner route: #/react/owned-character/{sourceCharacterId} with fresh owner profile verification, canonical shared-link verification and live owner snapshot.
- Campaign route: #/react/character/{campaignId}/{campaignCharacterId}. V1 membership and V2 active membership are enforced, plus an authoritative campaign-character link, owner UID and source mapping verification. The owner can view; a campaign GM may inspect the linked sheet read-only.
- Modules: resources (HP/SP/MP), level/XP/CP/TP, nine characteristics, natural AC, racial traits, skills, talents, spells, magic, inventory/equipment, quests and owner-only journal/history. Public party summary and live session status are read without changing gameplay state.
- Every read is server-confirmed. Cached snapshots cannot grant access; all listeners close on route/account change or permission revocation. Removed/inactive/unlinked characters fail closed.
- The owner-only Forge hub links directly to the new private dashboard. The GM read-only route does not expose the owner's personal journal.
- Existing game data remains unchanged: original record IDs, v2 server-generated gameplay IDs, inventory, permissions, stats and progression are preserved.

## Deferred to other phases
Phase 6.3 owns drag/snap/resize and layout-editor parity. Phase 6.4 owns campaign manager, presentation and looping video maps. Phase 7 owns combat, skills/spell activation, resource mutations, loot/rewards, notifications and other gameplay commands. Phase 6.2 deliberately does not write character sheets or introduce a second gameplay API.

## Cutover and verification
VITE_ASTERIA_PLAYER_DASHBOARD_ENABLED=true is off by default, independent of the existing GM opt-in. All code is deployed only after the entire ten-phase migration and user-controlled deployment.

Tests cover canonical ownership, inactive membership, v1/v2 legacy compatibility, archived/unlinked character rejection, visibility projections, malformed IDs, disabled route, two-account Forge-to-campaign lifecycle, mobile widths and session data. GitHub Actions must pass before merging.
