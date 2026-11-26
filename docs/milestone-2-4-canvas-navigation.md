# Milestone 2.4 — Canvas Navigation and Usability

Branch: `milestone-2-4-canvas-navigation`. Merge target: `Website-Build-Test` only.

Built on verified Milestone 2.3 (`5d7b643c3b7d062593a0a91c5c8ffe738ace2108`, PR #389). The user subsequently authorised implementing 2.4 and 2.5 together; their branches/PRs remain separate. Merge order remains 2.3, 2.4, 2.5 after Pages publishing is made manual. No live deployment is authorised.

## Audit and implementation

GM Main, Player Main and Combat already share one canvas, model and toolbar. Navigation previously had a duplicate opening-view toolbar button and repeated Fit All buttons, no horizontal trackpad panning or two-finger canvas pinch, and no Escape/blur cancellation. Header focus detection also processed modified/secondary clicks. Minimise CSS lost to the base window's specificity, so Fit All measured an expanded window even when its content was hidden.

Correct the existing implementation:

- Keep exactly the approved seven toolbar controls: Settings, Undo, Lock, Redo, Zoom In, Fit All, Zoom Out. Keep the 50% opening/reset action once in existing Canvas Preferences. Retain optional minimap/switcher preferences.
- Retain 50% default, 4–250% bounds, pointer-relative wheel zoom and centre-relative button zoom. Camera changes never enter layout history or gameplay persistence.
- Support horizontal trackpad and Shift+wheel panning, while preserving ordinary scrolling inside windows and excluding canvas menus/controls from canvas gestures.
- Add two-finger background pinch with centroid anchoring and seamless continuation to one-finger pan. Native touch scrolling remains available inside content; map/dice interactions keep their own handlers.
- Batch pan, wheel and pinch painting through existing animation frames, with no per-move React geometry state. Update scale-dependent hit targets while painting. Save camera state at gesture completion.
- Cancel interrupted gestures on Escape or browser blur. Block toolbar zoom/focus/Fit All during an active geometry gesture. Secondary/Space clicks on titles do not trigger focus.
- Manual camera navigation clears the focused-window state; double-click focus retains the original view for return. Fit/focus use the actual 80-world-unit minimised title footprint without modifying saved dimensions.
- Preserve existing settings, saved world geometry, owners/permissions, history and 2.2 batching. No new canvas, backend collection, dependency or gameplay authority was introduced.

## Verification

Local checks: ESLint; production build and repeat bundle comparison; full application suite (1,659 tests); Firebase Auth/Firestore/Storage emulator suite (301 tests); 45 additional dashboard/combat/data-sync regressions; release source, production dependency audit at its existing threshold, content validation, coordinated campaign audit and XP realtime sync.

The runtime harness tests seven-control order, camera-only navigation, burst batching without movement renders, pinch rebasing, active-gesture zoom isolation, all eight resize edges and prior 2.2/2.3 regressions. The model suite verifies pointer anchoring/bounds, 50% opening, fit/focus at multiple viewport sizes and minimised-window bounds.

The existing local Chromium matrix now adds all three roles at 50/75/100%: focus return, double-click focus, middle-button pan, horizontal trackpad pan, toolbar zoom/Fit All, lock/undo/redo and unchanged geometry for every window. It exercises two-finger background pinch at 50% on each role, in addition to scrollbar/content-sizing and 390/900/1280/1600px restoration checks. The separate 14-scenario baseline covers existing dashboard/Combat features and responsive layouts. These are isolated local fixtures and browser-emulated touch, not production accounts or physical-device certification.

No Firebase Functions, Firestore/Storage rules or data paths changed; no manual backend deployment is needed. GitHub Actions results are recorded on the PR. Pages publishing remains an external merge blocker because target-branch pushes currently publish the live domain automatically.
