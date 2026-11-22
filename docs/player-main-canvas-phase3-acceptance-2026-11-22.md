# Player Main Dashboard Canvas — Phase 3 acceptance

Date: 2026-11-22
Branch: `Website-Build-Test` (the existing GitHub branch, with capital B)

## Scope delivered

- Replace the main Player dashboard's mounted 12-column grid renderer with the same React/Vite CanvasWorkspace used by GM and Combat. Do not stack a second visual editor over the old grid.
- Preserve all 14 standard Player panels and the Action / Resource Log as 15 default windows. Keep the other 10 allowlisted Player shortcuts and overview panels available from the Player Window Library.
- Move, resize, focus, minimise, dock, group, hide, lock, undo/redo, zoom and fit windows, with responsive stacked windows on narrow viewports. The upper-left + opens the **Player** category, not the GM category.
- Keep player layout and camera scoped to the signed-in user, campaign and character. Save canvas geometry with the existing owner-verified dashboard-preferences Firebase flow; store only camera position locally.
- Preserve previously saved Player grid hide/show, position and lock choices during first layout conversion. Continue using the original gameplay components, combat selectors, action handlers, resource values and Player Information settings.
- Do not show GM-only dashboard panels in the Player canvas; hide currency when its Player Information visibility setting requires it. A combat selection may temporarily reveal the relevant talent, spell or skill window without permanently changing its visibility.
- Remove obsolete `.react-player-overview-grid` selectors rather than introducing a parallel grid styling layer.

## Automated acceptance

Run `node --test scripts/player-main-canvas-phase3.test.mjs` and the existing Firebase/website GitHub Actions verification at the **final** branch head. The Phase 3 tests cover complete panel registration, separate GM/Player allowlists, migration and persistence payloads, ownership and UI integration, and the first-category + regression.

## Manual acceptance remaining

Verify with an authenticated Player and a non-owner/GM read-only view on desktop and mobile: window movement and edge resize, account/character switching, save/reload, session-disabled gameplay controls, the Player Window Library, hidden currency, visibility during combat selectors, and touch scrolling. Automated checks are not proof of visual or live Firebase end-to-end parity.

This phase is confined to the test branch. It does not merge into `main`, alter Firebase rules, or trigger a production Firebase deployment.
