# Digital GM Phase 10.3 — Final Integration, Security & Release Readiness

## Scope

This is the final integration pass for Asteria Digital GM Phases 1–10, particularly the combined player presentation and unified toolkit search delivered in Phases 10.1 and 10.2. Phase 10.3 does not add a new backend service or data migration and does not trigger production deployment.

### Fixes

- **Selected character search result:** Opening a linked character result now selects that character in the GM roster before entering Inventory. Stale character results are rejected instead of opening the wrong player.
- **Search responsiveness:** The index now receives raw live character records rather than derived per-second character system calculations, reducing unnecessary rebuilds while the GM's search is open.
- **Search navigation isolation:** The last search destination is discarded when the GM changes dashboard tabs, opens normal toolkit navigation, switches campaign or changes account.
- **Projected world atlas:** A selected location's detail panel is cleared when the presentation switches to another map, avoiding stale location content across scenes.
- **Title/announcement presentation:** GM-provided title and caption are displayed once instead of repeating in the screen header and central card.
- **Mobile/touch screens:** Presentation controls stay visible on touch devices, with larger touch targets and responsive presentation maps, cards and headings.

### Test coverage

The dedicated `Digital GM Phase 10.3 — Final Integration and Verification` workflow verifies:

1. Integration of GM and Player Dashboard routes, presentation route, campaign and account identity scoping.
2. Search index schema, resource classification, keyword matching, deep-link target, lazy subscription behavior and secret field minimization.
3. Server-authorized GM presentation controls, player-safe scene projection, blackout and role-based permissions.
4. Integration regressions across Digital GM Phases 5.1–10.3, including notes, PDFs, audio, recordings, world maps, environments, rewards, battle maps and live presentation.
5. Firestore and Storage emulator permissions for presentation, recordings, notes, PDFs, audio, maps, encounters and other GM resources.
6. Lint, GM/Player Dashboard regressions, character ownership, responsive UI and performance, stability and deployment configuration.
7. Production frontend build and commit of generated website assets to the PR branch.

Firebase emulator suites execute **sequentially** to ensure each test's fixture cleanup cannot erase another test's records.

### Security design

- Search remains a **GM-only, in-memory, read-only** feature. It does not create a globally readable search document or grant extra Firestore access.
- The projector only receives the approved `presentationShared` document. Browser-side users cannot write shared or private presentation records.
- Published maps remain permission checked through the existing player-visible battle map and world atlas subscriptions; the projector does not show an unrelated map when the selected one is unpublished.
- No private GM notes, raw encounter NPC data or undiscovered map markers are sent to the public presentation projection.
- The project remains on React + Firebase and the existing manually approved deployment workflow. No additional hosting, external service or secrets are required.

### Manual production acceptance

Only after the user runs the combined Phase 10 production deployment and website hosting publication:

1. Sign in as a GM, open two campaigns in separate tabs and verify search records stay within the active campaign.
2. Use Ctrl+K/Cmd+K, search an NPC, character, quest, shop, random table, battle map and world atlas, then follow each result to the correct workspace.
3. Start a live session and change presentation scenes on a different browser/screen signed into the campaign. Confirm title, announcement, blackout, party cards and combat round update.
4. Publish an image and animated-video battle map, present each, unpublish one and confirm the player display no longer renders it.
5. Switch between two shared world atlases and confirm stale location cards disappear. Confirm private markers remain unavailable to players.
6. Open the display on phone, tablet, desktop or a second monitor and test fullscreen and touch controls.
7. Confirm ordinary player accounts cannot access GM search or control a presentation; revoked campaign members cannot read presentation records.
8. Review Firebase functions, Firestore and Storage deployment statuses and website hosting publication separately.
9. If a production issue is detected, stop new operations, inspect the GitHub workflow logs and follow the existing release/rollback procedure rather than modifying live campaign data.

### Deployment steps after Phase 10.3 has merged

- Confirm Phases 10.1, 10.2 and 10.3 are all in `main`.
- Run GitHub Actions → **Deploy Firebase backend (manual)** on branch `main`; operation `deploy`; confirmation `DEPLOY-ASTERIA-PRODUCTION`.
- Await approved Firebase production environment checks, unit/security regression suite and Firebase Functions + Firestore + Storage deployment.
- Publish/verify website hosting with the repository's existing website publication process **if that is separate from the Firebase backend workflow**. The backend-only workflow does not automatically deploy website hosting.
- Carry out the manual live acceptance checklist above. CI and successful deployment do not by themselves establish live end-to-end user acceptance.
