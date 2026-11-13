# Universal Check Request System — Phase 2

## Workspaces connected
- **NPC & Creature Library:** campaign NPCs have an embedded interaction-check composer with a validated NPC reference. Official compendium records and unstable legacy NPC IDs remain read-only.
- **Merchant & Stock Manager:** individual merchants have conversation/haggling checks; each pending offer has a dedicated check attached to its canonical deal ID, with its player-character locked.
- **Gameplay Systems:** create skill, social, crafting, group or opposed checks without leaving the gameplay tab.
- **Player Dashboard:** incoming check popup and history show the NPC, merchant offer or gameplay scene that requested the roll.
- **GM check history:** source labels and resolved results remain available in the Phase 1 check manager and directly in the contextual workspace.

## Backend and security
Phase 2 augments the existing `asteriaUniversalCheck` Cloud Function. All NPC names, merchant names and pending bargaining offers are looked up inside the existing authoritative transaction, then stored as a compact immutable `context` snapshot on each player-owned check request. Client-supplied source labels cannot impersonate an NPC or merchant. The request inherits Phase 1's campaign membership, GM-only creation, player ownership, digital dice generation, idempotency, history and Firestore read rules.

Merchant-deal checks require the original deal to exist, belong to the selected shop and player, be pending and unexpired, and use a single social check. The resulting success or failure **does not modify** price, shop stock, character currency, relationship standing or approval state. GMs approve or decline offers via the existing merchant workflow after interpreting the result. No new Firestore collections, indexes or security-rule permissions are necessary.

The general gameplay source is a GM-defined scene label, bounded to 3–120 characters. Its label is descriptive, not an authoritative NPC identity.

## Verification and release
`.github/workflows/universal-check-phase2.yml` runs Phase 1 and 2 backend/model tests, the Firestore rules emulator, dashboard and combat regression tests, lint and production React build, then commits generated `react-dist/` assets to the same branch if changes are found. The existing `Firebase and website checks` must also pass on the final head before merging to `main`.

After merge, deploy backend from Actions → **Deploy Firebase backend (manual)** using `main`, operation `deploy`, and confirmation `DEPLOY-ASTERIA-PRODUCTION`. GitHub Pages should publish the committed website files automatically; confirm its deployment completed on the merge commit before live testing.

## Live test
Open a linked NPC's check launcher and send a single skill check to a character. Repeat from a merchant's pending bargain, verify the exact player sees the source and sends a digital roll, then confirm the GM sees its result alongside the offer and that the proposed copper total stays unchanged until the existing **Approve** action is used. Test an opposed or group scene from the Gameplay tab and the check history. Ensure another player cannot view the check.
