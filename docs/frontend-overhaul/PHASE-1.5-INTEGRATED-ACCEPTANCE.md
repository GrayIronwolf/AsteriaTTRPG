# Phase 1.5 — Integrated foundation acceptance

**Asteria TTRPG** | 18 November 2026 | PR #291 (Phase 1.5)

## Decision: foundation ready for subsequent migration, NOT production cutover

Phases 1.1–1.4 have created a separate, standalone React/Vite entry, one canonical router, one CSS token owner and scoped components, and a shared JavaScript/event/service boundary. Phase 1.5 adds the integrated acceptance suite and browser evidence for those foundations. The existing production website still uses the original index.html and legacy CSS/JavaScript. **Do not deploy or switch the live site at this stage.**

A recognised destination is not a migrated feature. Compendium content, Account and Friends authentication, Character/Campaign Forge, GM/Player dashboards, session controls, maps, inventory, trading and other gameplay features are **still explicitly unconverted** in the standalone React preview. Their pages show safe placeholders until each real migration and backend permission review is complete.

## Phase 1 acceptance matrix

| Foundation requirement | Automated evidence | Gate |
|---|---|---|
| React/Vite single entry and separate compiled assets | site:check, site:build, site:verify-dist | Required |
| One hash-history owner, deep-link semantics, back/forward | Phase 1.2/1.4 unit and Chromium tests | Required |
| No duplicate event listeners under StrictMode | Phase 1.4 unit and Chromium tests | Required |
| No legacy JavaScript, old global CSS or extra Firebase instance in the preview | Phase 1.3/1.4 static assertions and Chromium network guard | Required |
| Single token owner and locally scoped CSS | Phase 1.3 source and browser checks | Required |
| Header logo, crystal buttons and mobile menu at 320–1920px | Phase 1.3 responsive Chromium suite | Required |
| Keyboard skip navigation and route focus | Phase 1.2/1.3 Chromium checks | Required |
| Account, campaign and invite destinations fail closed | Phase 1.2/1.4 and integrated Chromium suites | Required |
| Existing legacy site still has its own entry, Home, navigation and bundle | Phase 1.5 source and offline browser baseline | Required |
| Guest visual evidence on both implementations | Phase 1.5 GitHub artifact screenshots | Captured for later comparison |
| Authenticated legacy/React functional and security parity | Not possible without migrated features and safe test accounts | **Deferred; production cutover blocked** |
| Real-device performance and production visual parity | Offline navigation metrics and screenshots are descriptive, not comparable production scores | **Deferred; production cutover blocked** |

## CI implementation

### Static integration

Run `npm run site:check` to execute all Phase 1.1–1.5 unit tests, including the extra isolation, route-coverage and CI-integrity assertions. Phase 1.5 source tests check that production index.html, Vite build and firebase.json still use the existing legacy entry and Firebase backend, while the preview remains isolated.

### Integrated browser and evidence

After `npm run site:build` and `npm run site:verify-dist`, `npm run site:acceptance` starts **two different local servers**:

- `http://127.0.0.1:4174/` — the separate built React/Vite preview
- `http://127.0.0.1:8123/` — the checked-in legacy static website

The browser checks the React Home logo and hero, primary links and mobile navigation, direct Compendium bookmark/refresh, protected GM and login placeholders, browser history, no preview-to-legacy/Firebase requests, and missing-resource/console errors. It captures the legacy Home and header served offline as a **guest**. Internet/Firebase requests are blocked in both test contexts.

Every GitHub CI run saves `asteria-phase-1-5-acceptance-evidence` (Actions artifact, 30 days), containing a JSON report and these 9 screenshots:

1. preview-home-desktop-1440.png
2. preview-home-mobile-390.png
3. preview-mobile-navigation-390.png
4. preview-handbook-route-1440.png
5. preview-restricted-gm-1440.png
6. preview-account-placeholder-mobile-390.png
7. preview-light-gray-1440.png
8. legacy-offline-home-desktop-1440.png
9. legacy-offline-home-mobile-390.png

The report also includes uncompressed compiled JS/CSS asset sizes, local navigation timing observations and legacy script/stylesheet counts. These are **offline CI measurements only**, not Lighthouse, real production load times, live site security proof or proof of pixel-for-pixel parity.

### GitHub gates

The dedicated `.github/workflows/site-foundation.yml` runs the Phase 1.1–1.5 suites, Vite build, asset verification, ESLint, all five Chromium suites and uploads the visual evidence. The existing repository-wide Firebase/website workflow must independently pass. Merge only after all checks are green, then leave the normal Firebase deployment workflow untouched.

## Deferred production-cutover checklist (required before replacing the live entry)

- [ ] Capture a **fresh production or emulator-backed authenticated baseline** for guest, player and GM, including restored login, profile, Friends requests and dashboard navigation.
- [ ] Migrate Compendium content, indexes, filters/search, tabs and bookmarked entries.
- [ ] Migrate secure Account, Friends, Character Forge, Campaign Forge and dashboards, with actual Firebase adapters.
- [ ] Verify GM/Player real-time permissions, inventories, maps/video, checks, notifications and state cleanup.
- [ ] Compare final desktop/mobile page appearance and improve accessibility; preserve existing Asteria design choices and header sizing.
- [ ] Compare meaningful real-world performance and asset caching after migration. Do not use offline static navigation timings as a substitute.
- [ ] Retire obsolete legacy CSS/JS and dashboard bridge from the actual production application, **rather than layering** the new architecture above them.
- [ ] Complete a controlled final single-entry cutover, smoke test on the deployed hosting and rollback plan.

## User action

**None during Phase 1.5.** The accepted work is committed to the repository but does not change live HTML, auth, security rules, Firebase deployment or the existing dashboard runtime. No GitHub Actions Firebase deployment is needed until an approved final cutover.

## Subsequent work

Continue with the feature migration phases documented in Phase 0, starting with **React site shell/Header/Home** and the Compendium, then Account and social features and Forges/dashboards. Keep the new one-owner CSS/JS architecture authoritative and remove the legacy code when its equivalent migrates, not before. The current site must remain functional throughout.
