# Share & Present — Improvement Phase 2: GM Presentation Studio

**Branch:** `feature/share-present-improvement-2-gm-studio` stacked on Improvement Phase 1 PR #358. **Do not merge or deploy** without owner approval and dashboard restoration reconciliation.

## Implemented
- Existing emergency-stop and local screen-capture controls stay fixed above the movable workspace.
- Five existing React/Vite presentation functions are grouped into **Scene Controls**, **Player Preview**, **Display & Status**, **Presentation Media Library**, and **Viewer Access**. No duplicate Firebase app, new database collection, third-party service or alternate presentation backend.
- GM can drag, resize, snap, lock and optionally hide panels. Undo/redo, reset and manual Save Layout are available. Scene Controls cannot be hidden, and collisions are rejected.
- Layout preferences are per verified GM UID, campaign and browser; localStorage contains only panel geometry and visibility. This phase does not claim cloud/device synchronization.
- Preview uses the existing scene renderer and distinguishes staged draft from the current published presentation. The preview never publishes a scene. Only `Present Scene` uses the existing GM-authorized `managePresentation` action.
- Existing approved media upload/publish controls, hybrid invitation management, and safe-feed refresh remain functional entry points.
- Restricted invitation count is shown with an explicit **no live device-presence telemetry** disclosure. Authorized accounts are not described as currently connected.
- Mobile/narrow screens stack panels. Dragging is intended for desktop-width screens.
- Existing blackout, emergency-stop, permissions and viewer restrictions must remain valid.

## Verification
- Run `node --test scripts/share-present-improvement-2.test.mjs scripts/share-present-improvement-1.test.mjs scripts/site-share-present-phase7-7.test.mjs`.
- Run `npx eslint src/state/presentationStudioModel.mjs frontend/src/dashboard/GMPresentationStudio.jsx frontend/src/dashboard/CampaignPresentationWorkspace.jsx frontend/src/pages/GMDashboardPage.jsx scripts/share-present-improvement-2.test.mjs`.
- Run `npm run site:check && npm run site:build && npm run site:verify-dist`.
- Use the dedicated Improvement 2 workflow and inspect the full repository's checks.
- Before approval, conduct signed-in GM/player/two-screen browser tests: draft must remain private; explicit publish updates player screen; blackout/emergency action survives bad session status; privacy permissions stay fail-closed; screen reader/keyboard and drag behavior work.
- Rebuild and commit website artifact on the improvement-2 branch with the repository's standard artifact workflow before merge. CI on a source-only commit is not release evidence.

## Known limits
- Live viewer presence/heartbeats require a future server-authorized presence mechanism.
- Saved studio layout currently uses browser-local preferences, not Firebase cross-device sync.
- Stage preview can render a local GM scene but does not simulate a second authenticated account's access.
- Fogged published source images remain subject to Phase 1's known player-byte confidentiality limits.

**Release gate:** Owner must approve Phase 2 separately. No merge, production deployment, or Phase 3 until that approval.
