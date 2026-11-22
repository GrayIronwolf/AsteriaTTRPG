# Phase 7 — Share & Present atomic React/Vite integration

Repository: GrayIronwolf/AsteriaTTRPG
Branch: Website-Build-Test only
Source: archived draft PRs #350–357 (Phase 7.0–7.7).
Deployment: Not authorised for main or production Firebase.

## Integrated into current website

- The GM Player Display destination now renders the unified Campaign Presentation Controller and GM campaign media library. The original standalone presenter renderer is replaced.
- Same Firebase Auth, Firestore, Cloud Functions and Storage instance as the existing dashboard. Existing singleton Firebase bridge is extended with getReactPresentationRuntime.
- Campaign media includes existing maps, world atlas, PDF handouts, audio tracks and recording archives plus permissioned image/cinematic/handout presentation assets.
- Hybrid sessions issue per-user viewer grants with expiring epochs, invitation/approval/revocation and restricted sanitized display.
- Scenes cover blackout, titles, announcements, maps, party, combat, images, cinematic videos and PDF handouts.
- Restricted projection uses safe presentationRestricted/current, separately permissioned Storage bytes, and GM-only raw map/encounter records.
- Canonical systems/encounter and battleMaps records become GM-only. Player dashboards read combatPublic/current and battleMapsPublic while GMs retain raw views.
- Two Firebase v2 triggers synchronize safe projections when canonical documents change and a GM can backfill public snapshots.
- Projector fullscreen and browser capture preserve consent. Capture is local GM preview only, not remote live screen video broadcast.
- Phase 7 operations are registered in the existing trusted asteriaAction dispatcher.

## Verification and release boundaries

- Full npm test, Firebase emulator access tests, source lint and production Vite build are required.
- Phase 7.7 privacy tests cover player, GM, restricted viewer, outsider, anonymous, permission revocation and Storage access.
- Browser smoke testing and authenticated GM/Player tests are needed before approving production.
- No production Firebase Functions, Firestore or Storage rule deployment has been performed.
- Do not merge old Phase 7 branches over this modern React code; those contain duplicate frontend implementations.

## Compiled React asset verification

The test branch compiled the replacement Share & Present React/Vite source and committed the generated react-dist artifacts as commit 8a7076a5affe4d8ae328ecfb635e0c355f5de960. Production remains untouched. A clean CI run against this settled source-plus-bundle tree is required for the release gate.
