# Milestone 2.3 — Window Management and Responsive Sizing

Branch: `milestone-2-3-window-responsiveness`. Target: `Website-Build-Test` only.

Implementation and local verification are complete. Merge is gated by the existing Pages configuration: pushes to the target publish https://asteriattrpg.com/ automatically. The task explicitly prohibits live deployment, so that publishing configuration must be made manual before merging. Milestones 2.4 and 2.5 must follow the verified 2.3 merge.

## Audit and changes

All three canvases already share `CombatCommandCentre` and its layout model. Milestone 2.2's animation-frame batching, transform-based moves, direct guide painting and single save/history operation per completed gesture remain in place. Existing Content Size percentages, saved world coordinates, visibility preferences and default 50% camera are preserved.

Corrected existing code rather than adding another canvas or persistence layer:

- A north/west resize now anchors the opposite edge when minimum or maximum size is reached.
- Window-type resize bounds prevent unusably small edits. Loading an existing layout does not change its saved dimensions or position. Older larger custom sizes remain valid.
- Corner grips retain approximately 22 screen pixels across 50%, 75% and 100% zoom; coarse pointer styles provide larger targets. Grips extend mainly outside the bezel so they do not cover title controls. As with overlapping windows, select the intended window before using adjacent outer grips.
- A named canvas container query fixes a bug where a narrow window incorrectly activated the mobile overflow rules on desktop. Window content now scrolls within its proper bounds, including on small screens.
- Responsive content reflows grids, wraps labels and table cells, constrains inputs and resource tracks, and wraps action rows.
- Competing gesture starts and wheel input cannot change the interaction's coordinate space mid-drag/resize. A viewport-width change cancels an active geometry gesture, clears queued work and restores its original geometry.
- Magnetic alignment excludes companions in the same moving group, preventing self-snapping.

## The three content-layout options

These are layout behaviours, separate from the existing font/control Content Size percentages and the canvas camera zoom.

| Option | Behaviour |
| --- | --- |
| Responsive — reflow content | Default. Reflow columns and wrap controls at the available width; scroll remaining content. |
| Proportional — scale to fit | Preserve the content's design width and scale it to the window's available width. Remaining vertical content scrolls. Suitable for maps and dice tools. |
| Fixed size — scroll content | Keep the design width and selected content size; use the window as a scrolling viewport. |

Canvas Preferences supplies the default. Each existing window options menu can inherit it or choose one of the three behaviours. No duplicate percentage sizing control was added. A single canvas-level ResizeObserver updates design-width/fit variables through animation-frame batching without React state updates and disconnects/cancels pending work on cleanup.

Resize bounds are expressed in the existing world units:

| Window family | Minimum width × height | Maximum width × height |
| --- | --- | --- |
| Maps, world context and dice | 280 × 220 | 1800 × 2000 |
| GM resources and player management | 280 × 240 | 1800 × 2000 |
| Timer, quick notes and session overview | 200 × 140 | 1400 × 1800 |
| Other Player windows | 220 × 180 | 1400 × 2000 |
| Other GM/Combat windows | 200 × 180 | 1400 × 2000 |

## Verification

| Check | Result |
| --- | --- |
| Clean locked dependency install | Passed |
| ESLint | Passed |
| React/Vite production build | Passed; generated entry, stylesheet and referenced chunks committed |
| Application suite | 1,645 passed |
| Firebase emulator suite | 301 passed |
| Additional dashboard/combat/data-sync regressions | 52 passed |
| Existing browser acceptance | 14 scenarios passed |
| New sizing browser matrix | All 9 role/zoom combinations passed |
| Physical dice browser acceptance | Passed; camera assertions await the rendered React effect |
| Release source, production dependency audit, content validation and coordinated campaign audit | Passed at existing configured thresholds |
| XP realtime sync | Passed |

The runtime/model tests cover all eight resize edges in GM, Player and Combat canvases at 50%, 75% and 100%, frame coalescing, no geometry-triggered React commits during movement, one save at release, undo, content preference persistence, legacy geometry compatibility, limits, anchoring and group snapping.

The new Chromium matrix covers each role at all three zoom levels, southeast/northwest pointer resizing, content-layout modes, 390/900/1280/1600px viewport changes, unchanged saved world geometry, correct grip hit targets, settings accessibility, cancellation during viewport resize and Combat refresh restoration. The existing baseline additionally covers 320/360/390/768/1280/1920px viewports, overlapping moves, persistence, focus, window libraries, menus and resource cards. External requests are blocked; these are local fixtures, not production accounts or physical touchscreen tests.

The added emulator test writes and reloads the real normalized content preferences/geometry through the existing private dashboard and owned-character mirror paths, verifies another account cannot access the private layout, and checks HP/ownership remain unchanged.

The first PR verification exposed an existing timing race in the physical dice browser test: it read the camera immediately after a middle-button gesture, before the camera effect ran. The check now waits for camera mode and the observable camera change, retaining the assertions that the camera moves and dice remain unchanged. No dice implementation or required check was bypassed.

No Firebase Functions, Firestore/Storage rules or collection paths changed. No Firebase backend deployment or data migration is required. Live frontend publication is explicitly deferred to the user.
