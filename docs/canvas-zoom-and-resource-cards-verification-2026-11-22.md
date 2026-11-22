# Canvas zoom and GM resource cards

Date: 2026-11-22
Branch: Website-Build-Test

The low-zoom overview rule previously hid all window contents below 36 percent zoom. It has been removed in the shared Combat, GM and Player canvas. Only intentionally minimised windows are hidden.

GM embedded Player Resources cards now use a narrower, taller layout. The two management buttons were removed from embedded cards, while remaining in other management contexts. A pointer-captured preview of the full card follows the drag and animated reordering updates the existing saved card order.

Regression tests: scripts/combat-command-centre-replacement.test.mjs, scripts/canvas-resource-card-zoom.test.mjs, scripts/test-react-live-session.mjs. The earlier tests expected deleted overview-grid and HTML5 drag behaviour and have been updated to assert the current canvas design.

Acceptance still requires a live browser check: zoom below 36 percent, drag and reorder on desktop, the narrow-screen layout, and account-scoped data persistence. Production main is unchanged.
