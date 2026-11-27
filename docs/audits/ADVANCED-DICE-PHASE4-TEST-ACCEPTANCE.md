# Asteria 3D Dice — Phase 4.1–4.4 Test Branch Acceptance

Branch: `Website-Build-Test` only. No `main` merge or production Firebase deployment.

## Included
- Phase 4.1: Replaced the old stacked dice workspace with a full-window 3D stage, left dice selection drawer, right private history drawer, unified settings, floating result, and existing private presets.
- Phase 4.2: Single-click server-confirmed die rolls, grab/reposition settled dice, flick-to-roll, camera pointer and touchscreen gestures.
- Phase 4.3: Orbit, pan, zoom, pinch-to-zoom, classic/top-down/cinematic presets, resize observer, polygon-bound repositioning, and existing Cannon tray physics.
- Phase 4.4: Optional immersive fullscreen, six opt-in experimental tower families, quick presets, manual GM result sharing via clipboard, device-local performance controls, reduced-motion settings.

## Release safety
- The existing `asteriaAdvancedDice` callable remains the sole authoritative source of results. Physics and local gestures never author or overwrite server roll values.
- GM summary sharing is **manual**: it copies a confirmed result for pasting into the existing campaign chat. It does not create new shared Firestore writes.
- Six towers remain experimental and disabled by default.
- The Phase 3.7 appearance persistence backend is present on the test branch only. It has not been deployed to production Firebase.
- Browser/device acceptance remains necessary for realistic dice interactions and experimental towers.

## Verification
- `npm run test:advanced-dice` including `scripts/dice-engine-phase4.test.mjs`
- `npm run lint`
- `npm run build`
- Full Firebase and website workflow
- Manual desktop, mobile, zoomed dashboard, reduced-motion, touch and camera acceptance
