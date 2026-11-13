# Digital GM Toolkit — Phase 5.1: Merchant templates and linked world records

Phase 4 remains deferred. This release extends existing shops without changing bargaining,
trading, restocking, reputation or travel mechanics.

## Included
- Sixteen standard merchant types, matching the older item ecosystem.
- Built-in empty templates and account-private reusable templates, including identified stock.
- GM-only new shop instantiation through the existing authenticated shop transaction.
- Optional links to campaign World Systems NPCs and settlements/regions.
- Existing region filtering remains available; GM can set the market region manually.
- Player shop screen displays the linked proprietor and location by name.

## Limitations
- The link selector uses NPCs and locations already present in campaign World Systems.
  External Obsidian records are not imported or automatically synchronized.
- NPC relationship scores, recognition and player-facing NPC notes remain in deferred Phase 4.
- Templates intentionally exclude current shop funds, visitor access, location and NPC links.
- Generated random inventories are Phase 5.2, not Phase 5.1.
- Templates live in users/{uid}/merchantTemplates and are owner-private under existing
  Firestore user subcollection rules. The existing campaign shops collection remains authoritative.

## Verification
- Run `node --test scripts/digital-gm-phase5-1.test.mjs`.
- GitHub Actions rebuilds the tracked React bundle on this feature branch.
- The existing full Firebase and website checks must pass before merging.
- Test in a linked campaign: save a merchant template, instantiate a second closed shop,
  confirm inventory is copied once, select an existing NPC and location, refresh and verify.
- Confirm an existing merchant still buys/sells, restocks and bargains normally.
- No automatic Firebase deployment is performed by this branch's build workflow.
