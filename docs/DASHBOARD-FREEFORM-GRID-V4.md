# Asteria Dashboard — Freeform Grid v4

## Grid behavior

Player and GM dashboards use a 12-column square grid. The editor starts at 30 rows and extends vertically as needed. Each visible panel stores `{x,y,w,h}` (zero-indexed origin; width and height in square cells). Panel order, hidden state, appearance, backgrounds and pinned positions remain in the account/character dashboard preference record.

## Approved restrictions

Each Player and GM panel has its own minimum, default and maximum width/height in `src/state/dashboardGridModel.mjs`. Compact shortcuts are locked at 2×2. Equipment/Armour supports a 3×6 portrait exception. The resource banner, main navigation and GM sidebar are excluded from the movable grid.

## Editor

Inside Dashboard Settings, open **Visual Grid Editor**. Drag panels, drag the lower-right resize grip, or use column/row and width/height number fields. Hold Alt with arrow keys while a panel is focused to nudge it. **Lock Position** freezes movement and resizing; **Auto Arrange** compacts unlocked panels around locked positions. Overlaps or out-of-bounds moves are rejected. **Apply Layout to Settings** updates the draft; the existing **Save Dashboard Settings** action persists it.

## Material fidelity

Existing exact approved WebP frames remain the artwork source. Frame corners are rendered with CSS nine-slice `border-image`, instead of stretching a whole frame. The nearest aspect-ratio source (square, wide, very wide or tall) is selected automatically. Obsidian, slate, and arcane backdrops retain per-panel override support.

## Responsive behavior

Desktop preserves the 12-column square geometry. Medium and mobile sizes reflow the same panel content into full-width stacked panels, prioritizing readability and avoiding content clipping. The visual editor uses a scrollable square grid on narrow screens.

## Compatibility

Saved v3 layouts and their preset dimensions are migrated. Unrecognized panel IDs, out-of-range positions, collisions and invalid dimensions are normalized safely. Tests: `npm run test:dashboard`, `npm run lint`, `npm run test:firebase`, `npm run build`.
