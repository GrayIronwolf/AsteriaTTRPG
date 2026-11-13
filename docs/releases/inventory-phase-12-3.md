# Asteria Inventory & Trading — Phase 12.3 release readiness

**Scope:** The previously approved 12-phase inventory, trading, party loot, merchant and crafting upgrade. This is a final validation step, not another feature phase.

## Automated release gates

All of the following must pass on the **exact pull request head commit** before merge:

- npm run lint and the full npm test, including Phases 1–11, Phase 12.2 and the Phase 12.3 release gate.
- npm run test:firebase against the **local** demo-asteria emulators. Phase 12.1 exercises live-session permissions, player/GM ownership, item and copper conservation, rejected and replayed transactions, loot → crafting → enchanting → transfer, and NPC repair.
- npm run audit:production and npm run release:check (production dependency and feature-flag protections).
- npm run build and GitHub's committed website bundle diff check (the website assets must equal the built source).
- No pending merge conflicts or failed PR checks.

The Phase 12.3 test asserts that previous inventory regression commands, the emulator workflow, access restrictions, live-screen wiring and release gates remain connected. It does not perform migrations, enable flags, create accounts, or contact production.

## Production browser verification

**Not proven by CI:** that a published website is serving the latest committed assets and that an existing live account can use each workflow. After website publication, a GM and player can check this in their existing linked campaign; no separate test project, email service or new deployment infrastructure is required.

Use an existing test character or an item that can safely be moved:

1. **Player inventory (mobile and desktop):** open a linked character; view inventory/storage, inspect an item, select it without drag-and-drop, move it between slots, then refresh. Confirm the item is still present exactly once.
2. **Player exchange:** send a gift or trade between two controlled test characters. Confirm the correct recipient can accept/reject, both inventories update exactly once, and the receipt or activity is visible. No other player can approve the request.
3. **Merchant and party loot:** select a merchant and review a purchase/sale before confirming; confirm price, stock and balance match the inventory journal. As GM, award one controlled loot drop and verify the recipient receives it once.
4. **Crafting, enchanting and repair:** with the GM, submit a recipe or repair request for an existing item, verify that submitting consumes nothing, approve once, and verify that only the stated ingredients, Mana or copper were spent. Confirm closed stations and other players' private requests are inaccessible.
5. **Usability and feedback:** repeat the navigation on a phone-width screen. Confirm there is no sideways page scrolling, buttons are tappable, pending actions are disabled during processing, and failures are readable without losing items or currency.

For a failure, record the URL, character/campaign (without sharing personal information), action and observed result. Do not repeat a failed transaction until the inventory and activity history are checked.

## Publication boundary and Rollback

- **No automatic Firebase deployment:** this phase adds only validation files and package.json test wiring. Firebase Functions, Firestore rules, Storage rules, feature flags, and gameplay behavior remain unchanged. Running the manual Firebase backend workflow is not part of Phase 12.3.
- The existing firebase.json specifies Functions/Firestore/Storage, not Hosting. CI verifies the committed website bundle but **does not prove that a separate website publishing pipeline has served it live**. Publish the web assets using the existing approved process; do not invent a second hosting project.
- **Rollback:** if the website shows regressions after publication, restore the previous known-good frontend bundle/commit through the existing site publishing process, then verify that inventory and requests are intact. Do not roll back Firestore data or change permission rules as a routine UI rollback. Escalate any suspected duplicate or missing item before retrying.
- **Release completion distinction:** GitHub CI green + merge means **code and automated checks complete**. Browser verification on the published live website is a separate observation and should not be claimed until performed.
