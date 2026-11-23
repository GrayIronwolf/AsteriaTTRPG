# Phase 3.6 — Unified Dice Customisation Studio

**Target branch:** \`Website-Build-Test\`. **Firebase production deployment:** not requested or performed.

## Implementation
- One React/Vite dice studio drives the existing 3D PBR dice picker and six physical 3D trays.
- Basic and Advanced modes; switch between Dice and Tray targets without losing changes.
- Four curated paired looks: Obsidian & Steel, Royal Court, Arcane Study, Woodland Hunt.
- Appearance matching updates actual tray frame, lining and metal-trim colours from the dice palette.
- Undo/Redo track the last thirty validated changes across both editors, including tray size changes in the renderer toolbar. Restore design and Restore both are undoable.
- Basic exposes design choice, family-compatible colours and physical tray dimensions/colours.
- Advanced retains Familiar/Watcher controls, PBR materials/finishes, numeral style, pattern, glow, wear, per-die colour overrides, six tray families, collision shape and impact sound choices.
- Shared camera interactions: pointer drag, keyboard arrow orbit, zoom and reset on dice; 3D tray camera orbit/zoom/reset remains in place.
- The actual scene is shared with Phase 3.5, with protected wall collisions and server-authored roll results.
- Explicitly reserve towers for 3.8–3.9; no pretend tower selector. Accounts and cross-device saved collections remain Phase 3.7.
- No added Firebase collection, callable or external service. Previews and studio preset selection never request official rolls.
- Retain standalone legacy DiceTrayStudio mode for isolated regression checks, while the dashboard uses the one unified controlled studio.

## QA criteria
1. \`npm run test:advanced-dice\`: 3.1–3.6 unit and integration tests.
2. \`npm run lint\` + \`npm run build\` including generated website bundle.
3. Existing browser Phase 2/3.2/3.3/3.4/3.5 regressions.
4. New Phase 3.6 Chromium: Basic/Advanced/looks/Undo/Redo/matching/keyboard/touch responsive and official result integrity.
5. The Firebase and website-wide checks on the final synchronized branch head.

**Release gates:** owner approval before 3.7 and before any live Firebase deployment. Desktop/mobile GPU acceptance still recommended.
