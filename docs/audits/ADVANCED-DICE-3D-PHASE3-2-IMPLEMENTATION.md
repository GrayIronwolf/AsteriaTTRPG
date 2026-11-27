# Phase 3.2 — Twelve Core 3D Dice Designs

**Branch:** \`Website-Build-Test\`  
**Engine:** Open Dice v1.13.0 through the existing React/Vite Advanced Dice Workspace  
**Release:** test branch only. No live Firebase deployment.  
**Phase gate:** Phase 3.3 (Familiar Dice) is not started without owner approval.

## Completed work
- Twelve core dice designs: Obsidian, Forged Steel, Sapphire, Emerald, Ruby, Celestial, Infernal, Ancient Bronze, Marble, Frost Crystal, Nature, Arcane.
- Each design supports all existing die shapes: d4, d6, d8, d10, d12, d20, d100, using the engine's normal face geometry and physics.
- The Open Dice public \`registerDiceSet\` API is used for genuinely 3D Physically Based Rendering (PBR) materials, procedural painted texture maps, relief/normal maps, metal roughness/edge materials, decorative patterns and numeral styles.
- Users can select all twelve families and edit primary colour, texture/accent colour, number colour, base material, surface finish, edge trim and numeral style, with an actual rendered Three.js model preview and die-type selector.
- A separate dynamic Open Dice set registration namespace is allocated to each mounted dice workspace; custom appearances are never used to generate official roll numbers.
- Existing server-generated results, d10/d100 adaptation, roll presets, private history, replay, clear-tray, responsive canvas sizing and reduced-motion default are preserved.
- No duplicate dice engine or Firebase provider introduced.
- Eye/Cat special assets, realistic trays and functional dice towers are deferred to their approved phases. Phase 3.7 will implement cross-device saving; the Phase 3.2 appearance selection is currently workspace-local.
- 3D preview uses a non-gameplay mesh with no physics roll, so rotating or zooming it does not call Firebase or change dice history.

## Limitations and follow-up
- The current designs use Open Dice's embedded PBR procedural textures. Individually authored 4K stone/wood texture photography, special interior moving geometry, and custom external 3D models are not part of Phase 3.2.
- Engine's supported die geometry remains unchanged: no per-design probability differences.
- Physical desktop/mobile GPU acceptance testing is still separate from the headless Chromium browser QA.
- Check customisation contrast at smaller mobile sizes during Phase 3.10 visual QA.

## Verification
- [Dedicated Phase 3.2 GitHub action](https://github.com/GrayIronwolf/AsteriaTTRPG/actions/runs/45100220177) **passed** (34 dice unit tests; 10 prior browser regressions; 9 Phase 3.2 browser checks; lint; Vite build).
- The PBR browser test verified 12 selectable designs, live Three.js 3D preview, style changes, d4/d100 preview, custom-colour d20 confirmed total 25, resizable GM/player canvas window, mobile viewport, and zero uncaught browser exceptions.
- The existing Phase 1 and Phase 2 physics integration was retested and passed.
- A separate repository-wide Firebase and website CI workflow must be validated **after** the generated asset commit, on the same latest source+bundle snapshot.

## Owner review
The resulting 12 designs are ready for visual review on the test branch, pending full-site verification. Do not build Phase 3.3 until explicitly approved.
