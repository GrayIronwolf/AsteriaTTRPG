# Phase 7.3 — React/Vite inventory, containers, trading, loot, shops and crafting

## Boundary
This phase migrates the existing economy UI to React/Vite and does **not** replace the underlying game rules, create another Firebase app, create a Firestore permission bypass, or activate production. `VITE_ASTERIA_ECONOMY_ENABLED` defaults to OFF until the complete 10-phase cutover. Existing data and legacy pages remain intact for the transitional period.

## Canonical sources
- Shared item operations: `campaigns/{campaignId}/characters/{characterId}` and `users/{uid}/characters/{sourceId}`; `updateCharacterInventory` and existing `asteriaAction` callable protect storage creation, movement, splitting, equipping, quick slots, item use and approved GM edits. All inventory mutations use existing receipts and server transactions, not direct client writes.
- Two-party item requests: `campaigns/{cid}/itemRequests`, queried only by fromOwnerUid or toOwnerUid for the respective player; **escrow and final two-party confirmation** are handled by existing commands `createLiveItemRequest`, `respondLiveItemRequest`, `finalizeLiveItemTrade`, `cancelLiveItemRequest`, acknowledgment actions. Players are never allowed to read unrelated trade terms. The GM audit uses the existing GM read grant.
- Shared stashes and revealed loot: `partyStashes` / `partyLoot`; hidden drafts: `partyLootDrafts` GM only. Players can request deposit/withdraw, claim revealed loot or vote Need/Greed/Pass; the GM creates and reveals loot, controls stash permissions, starts reviewed distribution and settles currency splits through existing secure commands. The public voting document contains tallies, not private participant votes.
- Shops and bargains: campaign `shops` records and owner-scoped `merchantDeals`. Existing pricing and variant checks calculate actual transaction amounts; the migrated UI does not bypass merchant status, character visit restrictions, funds or stock validation. GM shop stock enters authored Market Price/Value in silver marks, per the existing pricing engine.
- Recipes: `craftingRecipes` (GM drafts or published player definitions), `craftingRequests` (private player or GM). The server revalidates ingredients, source definition codes, crafting stations and output before GM approval. No local granting of crafted items.
- Stations, NPC service definitions, repairs: `craftingStations`, `npcCraftingServices`, `npcRepairRequests`; players see only open/published definitions and their own requests. GM repair approval uses current item fingerprint, material and currency preflight from the existing implementation.

## Security and fidelity
- One existing Firebase Auth, Firestore and Functions client created in the site bootstrap; a verified canonical profile and v1/v2 campaign membership precede subscriptions/commands.
- Player command adapter checks linked character ownership and private owner source; live subscriptions fail closed on revoked status and ignore cached/pending writes.
- Firestore streams query player trades separately for sender and recipient ownership, never the full campaign collection. Private crafting/repair/bargaining requests use ownerUid equality filters. Hidden loot drafts are not requested for players. Public recipe, station and service queries constrain publication status.
- UI projections strip unrevealed names, magical effects and secret metadata from unidentified items. No raw GM-only ecosystem document is imported. No client-side Firestore writes; all command results and errors are shown.
- Existing server handles session gating, idempotency, critical state reconciliation, escrow release and inventory/currency mirroring.

## Coverage and constraints
- Player: inventory cards, storage creation/moves/splitting, equipment and consumables; give/trade/sell/identify offers and escrow notifications; party stash moves, Need/Greed/Pass and revealed loot claims; merchant purchase, sale and bargaining; published crafting recipes and NPC repair requests.
- GM: party inventory supervision, shared chest policy, hidden/revealed treasure, Need/Greed reviewed awarding and currency split, shops/stock/restock, merchant bargain approvals, recipe authoring and crafting approvals, crafting stations, NPC repair services and approvals, trade audit.
- Existing advanced systems remain in their authoritative server modules; the initial React workspace offers basic recipe authoring (single material requirement) and basic NPC services. Additional material lines and advanced templates can be added without duplicating server rules.
- Tests cover full source and website regression, projection isolation, role/owner checks, disabled production default, authenticated two-account emulator workflows and guest-only restoration. Changes merge only after all GitHub checks are green, and no Firebase deployment is performed during this phase.
