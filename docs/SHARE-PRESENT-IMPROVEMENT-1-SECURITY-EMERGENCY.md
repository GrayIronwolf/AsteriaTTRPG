# Share & Present — Improvement Phase 1: Security & Emergency Controls

**Branch:** `feature/share-present-improvement-1-security-emergency` (stacked on Phase 7.7, not on `main`).

## Delivered

- One conspicuous, keyboard-accessible, GM-only emergency control above the regular presentation configuration. It never depends on a loading, stale or failed viewer-session listener; it immediately stops local browser capture, including any capture request still awaiting the browser prompt.
- A new `emergencyStopPresentation` callable goes through the existing Firebase Auth and campaign-only GM authorisation path; it requires no client-known revision and works when the hybrid viewer-list subscription has failed.
- The GM-only backend transaction atomically: blacks out both ordinary and restricted presentation documents, disables restricted combat, removes staged media and map source IDs, removes all current `viewerExpiries` byte grants, and closes/invalidates the hybrid session epoch. Server receipt confirms the result. Retries are idempotent in meaning; no partial state is reported as success.
- The UI clearly distinguishes **local stopped** from **remote stop confirmed**. Offline/server failures display a warning and allow the GM to retry; the browser cannot promise remote revocation while disconnected. Previously downloaded pixels cannot be deleted from another viewer's device.
- Existing Phase 7.1 browser acceptance's duplicate Blackout selector is scoped to `site-gm-presentation` and the exact button label.
- Restricted, nonmember guests cannot fetch an original battle-map image/video when the source has fog-of-war enabled: visual overlays do **not** protect secrets embedded into an original downloaded asset. These maps need a separately approved/sanitized derivative for remote guests. Existing campaign-player map sharing remains a known limitation and **must not** be considered safe for secret-bearing originals.

## Remaining security decisions and limits

1. Never place GM-only clues, secret annotations or hidden rooms into an asset that is marked publicly accessible to players. To protect a secret-bearing map, generate a redacted image/server-rendered tile stream, rather than shipping the original image behind a CSS or SVG fog overlay.
2. The current ordinary player map permission permits published originals; this phase intentionally avoids breaking existing player map workflows. The release gate must explicitly approve safe-media authoring or plan a future sanitized-assets feature.
3. Mobile browsers and projectors may have different capture/fullscreen support. The screen capture in Phase 7.6 remains **local only**, not WebRTC streaming.
4. Confirm both normal and emergency commands use the existing `asteriaAction` envelope and server-side authorisation; never trust client-side control visibility.
5. Verify production candidate rules, real Chrome/Edge two-account and invited-viewer tests, offline retries, map fog denial, and session expiry before any release.

## Required acceptance

- `node --test scripts/share-present-improvement-1.test.mjs scripts/site-share-present-phase7-6.test.mjs scripts/site-share-present-phase7-7.test.mjs`
- Firestore and Storage emulator suites for Phases 7.3, 7.4 and 7.7, each under their matching demo project ID.
- React lint, site source check, build and generated-artifact verification, plus the existing Phase 7.1 browser test.
- No merge/deployment until Codex dashboard restoration is reconciled, checks pass and the owner explicitly approves.
