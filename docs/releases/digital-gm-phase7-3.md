# Digital GM Toolkit — Phase 7.3: Encounter & Reward Generator

## Functionality

Phase 7.3 adds an Encounter Generator tab to the GM Dashboard and shortcut in the Toolkit.

- Select Threat Tier 1–20, tier tolerance (exact or ±1/±2), 1–8 creatures, official or campaign source and optional biome.
- Select only eligible entries from the official Asteria creature Compendium or saved campaign NPC/creature library, preserving source HP, AC, SP and MP.
- Do not invent missing XP values. Campaign creatures without configured XP are excluded. Official creatures without XP show an explicit missing-XP warning.
- Optionally roll an active, matching encounter-category Random Table for narrative prompts and an active GM Loot Table for 1–10 server-side reward rolls.
- Save GM-private proposals with snapshots and revision checks. Review, approve or archive independently of combat.
- Approval stages only GM-hidden party-loot drafts, never delivered items or currency. No player XP is awarded.
- Approved proposals can explicitly populate the existing ready combat encounter through the established Combat Command API, without starting combat. Repeating the same operation will not duplicate generated enemy IDs.
- Existing GM treasure review, party loot and XP tools remain the sole approval/delivery systems.

## Security and release

- The encounterPlans Firestore collection is GM-only for reads, with no browser writes. The authenticated Firebase action verifies campaign GM membership.
- Creature records are loaded on the backend from saved official and GM-private campaign data; clients cannot provide forged creature stats.
- All random selection uses Node crypto randomInt. Loot tables and random tables must exist and remain active.
- Feature tests, emulator rules tests, previous digital GM regressions, lint, production build and tracked frontend bundle parity must pass before merge.

## Deployment

After merging, run Deploy Firebase backend (manual) from main using operation deploy and confirmation DEPLOY-ASTERIA-PRODUCTION. GitHub Pages publishes the verified frontend separately.

Test: generate a Tier 1 encounter; approve treasure and confirm hidden GM loot drafts; explicitly add approved creatures to a ready encounter; verify active combat cannot be overwritten and players cannot see private plans.

Next: Phase 8.1, Asteria Calendar integration.
