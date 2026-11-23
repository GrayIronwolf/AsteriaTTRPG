# Phase 3.5 — Six Realistic 3D Dice Trays

**Branch:** \`Website-Build-Test\` only. **Firebase live deployment:** not triggered.

## Owner-approved tray designs
1. **Obsidian Hexagon** — default black/gunmetal, velvet, subdued light.
2. **Walnut Octagon** — wooden frame, brass and dark green felt.
3. **Knight's Iron Tray** — forged-iron rectangle with leather.
4. **Arcane Circle** — round stone, violet edging and magical details.
5. **Royal Marble Square** — white stone, gold trim and burgundy velvet.
6. **Hunter's Leather Oval** — natural wood/leather-look with olive suede.

## Changes
- Created \`src/dice/diceTrayCatalogue.mjs\` with six approved immutable design identities and versioned strict appearance validation.
- Implemented \`diceTrayGeometry.mjs\` polygon outlines for hexagon, octagon, rectangle, circle, square and oval. Exact segments drive both Three.js rail geometry and Cannon-es static wall collisions.
- Implemented \`diceTrayScene.mjs\` inside the existing Open Dice scene. Uses MeshPhysicalMaterial, procedural textures, metal trims, interior lining, engraved borders, decorative emblems and optional rim glow. No second roller or physics world.
- Replaced the existing generic flat table with the actual selected 3D tray. Protected die spawn positions are adjusted identically in predictive and visible physics, without changing target faces or recorded results.
- Implemented \`diceTrayImpact.mjs\` with six locally synthesised impact sounds (felt, leather, wood, stone, metal, magical) plus mute and volume controls. Audio follows browser activation rules and does not depend on an additional provider.
- Added \`DiceTrayStudio.jsx\` to the existing tray panel. 6 designs; 3 sizes; 3 wall heights; 8 frame materials; 8 lining materials; 16 colours plus HEX picker for frame, lining and trim; 4 rim profiles; 8 engravings; 12 emblem choices; 4 lighting levels; 4 wear levels; 6 sounds + off; 3 volumes.
- Added camera-only orbit, zoom and top-view reset controls. Camera changes do not change physics.
- Existing authoritative Firebase rolls, history, replay, standard percentile face conventions and Watcher/Familiar custom dice remain integrated.
- Tray appearances are locally customised in the workspace; Phase 3.7 remains the separate account-level persistence phase. No extra Firebase collections or backend services introduced.
- All six visuals reuse the existing React/Vite workspaces and Open Dice rather than layering a new 3D roll implementation over the old one.

## Important physical/visual limitations
- The collision sides extend above the visible rim for throw containment. Visual rail height and physics barrier height are intentionally different, and this should be reviewed during desktop hardware acceptance testing.
- The material library uses procedural surface detail and PBR parameters, not commissioned high-resolution texture photography or GLB props.
- The current engravings/emblems are lightweight procedurally drawn decorations, not unique hand-sculpted models.
- The studio and camera are currently per-workspace; saving those choices across devices remains Phase 3.7.
- A trial roll must be performed on real desktop and mobile GPUs before live release.

## Verification
[Dedicated dice build — GitHub Actions 45108353344](https://github.com/GrayIronwolf/AsteriaTTRPG/actions/runs/45108353344): **success**.
- **73/73** dice unit tests.
- **10/10** Phase 2 responsive dice-table checks.
- **9/9** Phase 3.2 core PBR regression checks.
- **12/12** Phase 3.3 Familiar Dice regression checks.
- **14/14** Phase 3.4 Watcher Dice regression checks.
- **15/15** Phase 3.5 six-tray Chromium checks.
- Lint and production React/Vite build passed. The generated-asset commit was produced by the dedicated build.

**Final gate:** the Firebase and website-wide checks must complete on the synchronized test-branch commit after this report.
**Owner gate:** do not begin Phase 3.6 or deploy Firebase live without separate approval.
