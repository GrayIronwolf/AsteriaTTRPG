# Digital GM Toolkit Phase 5.3 — Merchant integration

## Scope
- Reviewed generated inventory can append, combining identical variants without resetting existing stock policies.
- Explicit replace mode warns the GM and requires confirmation before replacing all stock.
- Preserve merchant funds, visitor permissions, NPC and location links, reputation and travel.
- Trusted GM shop transaction validates quantities, stock line count and record size.
- Regression tests cover variants, duplicate prevention, replace and existing shop state.

## Deployment
- Website assets are rebuilt by the branch workflow and included in the PR.
- Backend source changes to functions/itemStoreCommands.mjs require the manual
  **Deploy Firebase backend (manual)** workflow after merge:
  branch main, operation deploy, confirmation DEPLOY-ASTERIA-PRODUCTION.
- This workflow deploys functions, Firestore and Storage, not the website frontend.
- The website must also publish the latest main frontend bundle through its existing host.
- Verify a GM generates, previews, appends and explicitly replaces inventory,
  and a player can still purchase and sell normally.
