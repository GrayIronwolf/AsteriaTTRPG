# Phase 6.4 — React/Vite Campaign Media & Player Presentation

## Source of truth
The existing Digital GM battle map records, world atlas projections, and player presentation callables remain canonical. The React/Vite site uses the same Firebase Auth, Firestore, Functions and Storage project instance; it does not mount legacy dashboard components or append a global stylesheet.

## Delivered
- Authenticated GM battle map manager: images (8 MB), looping muted MP4/WebM (48 MB), private-by-default upload, publish/unpublish, update, delete, saved grid and fog.
- Player-only published battle map and shared world atlas views, with authenticated private Storage blobs and URL cleanup.
- A GM scene controller and player presentation route using the existing revision-checked server-only `managePlayerPresentation` action; supports blackout, title, announcement, shared maps, combat status and selected party.
- All access is bound to a canonical user profile and current membership with live revocation handling. GM-only pins and documents are not exposed to player screens.
- `VITE_ASTERIA_CAMPAIGN_MEDIA_ENABLED` is opt-in and **off by default**; Phase 6.1/6.2 dashboard and Phase 6.3 editor flags remain separate.

## Boundaries
This migration does not recreate the combat engine, move authoritative combatants, reveal private GM world atlas notes, or change Firebase security rules. Advanced combat map interactions remain in the later gameplay migration. Existing campaigns and map documents are not automatically rewritten.

## Validation
Run `npm run site:check`, `npx eslint frontend/src`, `npm run site:build`, Firebase security integration checks and the Phase 6.4 authenticated emulator browser acceptance. No production workflow/deployment until the planned 10-phase cutover.
