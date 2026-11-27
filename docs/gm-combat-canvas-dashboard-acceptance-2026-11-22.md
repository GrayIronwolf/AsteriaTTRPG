# GM Combat Canvas & Dashboard Layout Acceptance

Date: 2026-11-22
Branch: Website-Build-Test

## Combat Command Centre
- Retains all 13 existing React combat panels and their permission-checked Firebase services.
- Existing panel placement data is normalized into an extended combat-only freeform coordinate plane.
- Drag an unlocked window by its title bar, resize from eight perimeter handles, pan by dragging empty canvas, and use zoom controls (25–250%) or Fit all.
- Panels automatically save per GM, campaign and device in the existing combat layout localStorage key; the camera position is stored separately under that key with the :camera suffix.
- Keep collision protection by default, with an explicit option to allow overlaps.
- Retain lock, hide, group, dock, prepared layouts, presets, undo/redo, and confirmation-based reset.
- Preserve stacked, readable combat windows on narrow screens.
- Layout-only operations never issue gameplay commands or alter Firestore permissions.

## GM Dashboard
- Remove the redundant global GM search launcher without changing module-level search privacy contracts or the hybrid navigation menu.
- Remove the duplicate GM Toolkit quick-access strip from the main dashboard; the existing Toolkit menu and complete GM Toolkit page remain.
- Move the existing Player Resources roster and its live resource cards to a full-width strip directly below the campaign/session header and above GM navigation.
- Cards wrap responsively while preserving existing selection and character-opening actions.

## Acceptance
- The Chromium fixture audit covers desktop and mobile layout, visual panel bounds, direct title-bar movement, reload persistence, zoom controls, presets, and full-width GM Player Resources.
- Unit tests cover extended geometry bounds, collision protection, canvas locks, camera normalization, and unchanged combat authority.
- Firebase and website checks must pass against the final compiled and committed React/Vite bundle before release to main.
- No production Firebase data or access permissions are altered by this interface-only implementation.
