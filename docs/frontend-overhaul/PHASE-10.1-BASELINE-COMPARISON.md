# Phase 10.1 — Capture and compare guest, player and GM baselines

## Purpose and production boundary
Capture a reproducible screenshot + semantic baseline of the current checked-in legacy website and the new isolated React/Vite implementation **before changing Firebase Hosting or the production entry point**. The captured local legacy site is a **guest/offline** representation: it blocks external Firebase/CDN calls. React guest, GM, and player captures use the isolated Vite preview; authenticated accounts are created only in disposable `demo-asteria` Firebase emulators.

**Important limitation:** the local legacy website cannot provide an authenticated GM or player baseline without connecting its production auth environment or an explicitly prepared, safe equivalent. The Phase 10.1 report therefore marks `legacyAuthenticated: not-captured` and `cutoverApproved: false`. This is not a complete role-by-role production visual comparison.

## Implemented
- Dedicated browser runner: `scripts/site-cutover-phase10-1-browser.cjs`.
- Twelve evidence screenshots across guest, GM and player, desktop 1440×900 and mobile 390×844.
- Legacy offline guest Home compared with React guest Home: main/header landmarks, viewport overflow, image loads, resource counts, and navigation timing.
- React signed-in GM: Home, Campaign Forge, created Campaign and GM Dashboard; desktop/mobile dashboard; owner-only access denial tested with a separate player.
- React signed-in player: Home, Character Forge, a created character and owned Player Dashboard; desktop/mobile dashboard; owner-only access denial tested with a separate GM.
- A machine-readable `phase-10-1-baselines.json` comparison report, with missing legacy authenticated evidence clearly distinguished from passing checks.
- Schema/evidence assertions: `scripts/site-cutover-phase10-1.test.mjs`, run after capture.
- CI workflow: `.github/workflows/frontend-phase10-1-acceptance.yml`, reusing the existing site build generators, real Firebase Auth/Firestore/Functions/Storage emulator fixtures and Playwright Chromium.
- Dedicated script: `npm run site:cutover-baseline-phase10-1`.

### Image inventory

| Role | Current legacy site | Isolated React/Vite |
|---|---|---|
| Guest | Home desktop + mobile (offline only) | Home desktop + mobile |
| GM | **Not captured authenticated** | Signed-in Home desktop, Campaign Forge desktop, GM dashboard desktop + mobile |
| Player | **Not captured authenticated** | Signed-in Home desktop, Character Forge desktop, Player dashboard desktop + mobile |

All images and JSON metrics are uploaded to the CI artifact `asteria-phase-10-1-role-baselines`, retained for 30 days. Screenshots may show synthetic fixture usernames/character names but must never include live user data, credentials, or bearer invitation links. Reports contain only synthetic scenario labels and numerical measurements.

## Acceptance and outstanding gaps
1. Guest cross-entry metrics captured and noted as different execution environments, not asserted visually identical.
2. React GM/Player authenticated flows must load real Firebase emulator documents and deny a second account's private dashboard.
3. CSS overflow must be absent in migrated desktop/mobile captures; no production application or Firebase config is modified.
4. **Blocking for final production approval:** obtain authorized, redacted screenshots and representative workflow recordings from the *current production* logged-in GM and player experiences. Compare equivalent pages and states to the React evidence. Do not copy production user identifiers, private messages, campaign maps or journals into CI artifacts.
5. Complete Phase 10.2 end-to-end and Firebase security testing, Phase 10.3 mobile/accessibility/visual/performance verification and Phase 10.4 rollback/cutover preparation before Phase 10.5 deployment.

## Running and deployment
CI builds an emulator-only React preview with features enabled, executes the screenshot runner under `firebase emulators:exec`, runs the evidence validator, uploads artifacts and rebuilds the guest-only isolated preview. **No Firebase deployment is required for Phase 10.1.**

The production `index.html`, legacy scripts/styles, compiled `react-dist`, Firebase Hosting config, security rules and functions are unchanged.
