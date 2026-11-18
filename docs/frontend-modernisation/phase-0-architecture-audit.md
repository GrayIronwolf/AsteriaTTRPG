# Asteria TTRPG — Phase 0 Frontend Architecture Audit

**Snapshot:** 2026-11-18 · `main` commit `cc4e78680c7482f9e105d655c50a7cc30a339d62`  
**Project objective:** Replace the existing hybrid frontend with **one React/Vite application, one router, a shared design system, scoped page/dashboard styles and clearly owned frontend services**. This is a replacement programme, **not a new CSS/JS layer over the legacy site**.  
**Audit status:** Source inventory and static architectural review completed. The live authenticated visual/performance baseline and production hosting configuration remain **unverified**; these are Phase 0 exit blockers before frontend cutover.  
**Change scope:** Documentation/inventory only. No runtime code, Firebase rules, hosting or deployment changes.

## 1. Source inventory and the real application boundary

See [pinned machine-readable file inventory](phase-0-file-inventory.json) for every indexed frontend source path, indexed file size, all stylesheet/script tags, data assets and the test list.

| Measure (pinned Git tree) | Finding |
| --- | ---: |
| Legacy `css/` files | **36** (35 stylesheet links in `index.html`) |
| React `src/styles/` CSS files | **21**, in addition to legacy CSS |
| Legacy `js/` files, including vendor | **47** |
| External script references in `index.html` | **47**, classic and module mixed |
| Frontend `src/` files (including images) | **189** |
| React dashboard components in `src/dashboards/` | **48** |
| React state modules in `src/state/` | **88** |
| Indexed automated test files | **224** |
| Tracked generated `react-dist/` assets | **423 files / 72,967,956 bytes** |
| Static `index.html` | **666 lines**, **19 initial `.view` IDs**, **89 inline DOM event attributes** |
| Tracked game `content/` files | **936** (preserve; not frontend rewrite scope) |
| Tracked `functions/` files | **62** (backend preservation boundary) |

These counts are **Git-tree/source counts**, not performance metrics or the number of files downloaded on each page visit. Script tags include one content index and the React entry. Individual source files may be present but not loaded.

The current topology is a **legacy static HTML shell** loading 35 legacy stylesheets and a large classic-script graph. A separate `src/dev-entry.js` imports the prebuilt Vite entry under `react-dist/`; that entry lazily loads React dashboard components. Pages outside those dashboards still rely heavily on direct DOM manipulation and global `window` APIs.

Core evidence:
- [`index.html`](https://github.com/GrayIronwolf/AsteriaTTRPG/blob/cc4e78680c7482f9e105d655c50a7cc30a339d62/index.html) — page markup, CSS link sequence, many script tags and inline event handlers.
- [`src/dev-entry.js`](https://github.com/GrayIronwolf/AsteriaTTRPG/blob/cc4e78680c7482f9e105d655c50a7cc30a339d62/src/dev-entry.js) — development vs. production React entry and manual CSS fallback.
- [`vite.config.mjs`](https://github.com/GrayIronwolf/AsteriaTTRPG/blob/cc4e78680c7482f9e105d655c50a7cc30a339d62/vite.config.mjs) — Vite builds into `react-dist/` with `emptyOutDir: false` and a fixed entry filename.
- [`src/main.jsx`](https://github.com/GrayIronwolf/AsteriaTTRPG/blob/cc4e78680c7482f9e105d655c50a7cc30a339d62/src/main.jsx) — dashboard-only React startup plus global `window.AsteriaReactMigration`.
- [`src/app/legacyBridge.js`](https://github.com/GrayIronwolf/AsteriaTTRPG/blob/cc4e78680c7482f9e105d655c50a7cc30a339d62/src/app/legacyBridge.js) — explicit compatibility boundary between legacy pages and React.
- [`src/app/AsteriaReactRoot.jsx`](https://github.com/GrayIronwolf/AsteriaTTRPG/blob/cc4e78680c7482f9e105d655c50a7cc30a339d62/src/app/AsteriaReactRoot.jsx) — existing lazily loaded React dashboards and error boundaries.

## 2. CSS audit — conflicting ownership, not a need for one giant CSS file

Legacy CSS is approximately **625 KB of source** (unminified Git-tree sizes) and the React `src/styles/` directory is separate. The legacy stylesheets contain approximately **3,962 occurrences of `!important`** by source-text counting, including:
- `css/styles.css`: **293,892 bytes / 4,344 lines / 2,439 `!important` occurrences**
- `css/asteria-aaa-upgrade.css`: **32,759 bytes / 316 `!important` occurrences**
- `css/asteria-modern-ui.css`: **25,564 bytes / 125 occurrences**
- `css/asteria-account-pages.css`: **12,699 bytes / 104 occurrences**
- `css/asteria-mobile-header-stability.css`: **4,575 bytes / 91 occurrences**

The React `src/styles/` directory has another **21 stylesheets**; `src/styles/asteria-react.css` alone is ~199 KB and 4,148 lines.

**Confirmed architectural overlap:** global, header, menu, account, button and panel styles are declared across multiple separately loaded stylesheets. The later-loaded `css/asteria-solid-navy-surfaces.css` deliberately overrides earlier header/panel colours with `!important`, for example. The disabled Phase 1 `css/asteria-page-template.css` still exists in the tree, but is **not currently linked** from `index.html`. Multiple stylesheets are not intrinsically a bug; overlapping selectors/ownership and cascade uncertainty are the risk. Static occurrence counts are **not** a measured number of actual collisions.

**Replacement policy:** one canonical token file, shared primitive/component styles, CSS Modules or similarly isolated page styles, explicit responsive rules and a single owner for each visual component. As each component is replaced, remove its old selectors and obsolete CSS reference **in the same tested cutover**. Retain approved aesthetic: `#060D15` menu/header/panel base, silver/blue crystal controls, logo, artwork, card exceptions, dashboard panel artwork and user appearance options.

## 3. JavaScript audit — overlapping routing and globals

In the **45 non-vendor `js/` files** scanned, simple source-text matches found approximately **434 `addEventListener(` call sites**, **256 assignments to `window.*`** and **224 assignments to `innerHTML`**. These are **static call sites**, not a runtime count of installed listeners or evidence of exploitation.

Heavy legacy owners:
- [`js/app.js`](https://github.com/GrayIronwolf/AsteriaTTRPG/blob/cc4e78680c7482f9e105d655c50a7cc30a339d62/js/app.js): 562,395 bytes; 4,663 lines, broad game/DOM functions and startup listeners.
- [`js/firebase-auth.js`](https://github.com/GrayIronwolf/AsteriaTTRPG/blob/cc4e78680c7482f9e105d655c50a7cc30a339d62/js/firebase-auth.js): 224,673 bytes; combines substantial frontend auth-related APIs.
- [`js/asteria-gameplay-systems.js`](https://github.com/GrayIronwolf/AsteriaTTRPG/blob/cc4e78680c7482f9e105d655c50a7cc30a339d62/js/asteria-gameplay-systems.js): 196,001 bytes; gameplay and Forge UI.
- [`js/clean-compendium.js`](https://github.com/GrayIronwolf/AsteriaTTRPG/blob/cc4e78680c7482f9e105d655c50a7cc30a339d62/js/clean-compendium.js): 136,603 bytes; content pages plus account/campaign workspaces.
- [`js/asteria-item-ecosystem.js`](https://github.com/GrayIronwolf/AsteriaTTRPG/blob/cc4e78680c7482f9e105d655c50a7cc30a339d62/js/asteria-item-ecosystem.js): 92,303 bytes; item-related interface logic.

**Confirmed overlapping routing responsibilities:**
- `js/app.js` defines the legacy `setView` and binds DOM controls.
- `js/asteria-core-shell.js` wraps `window.setView` to intercept Home.
- `src/main.jsx` also wraps `window.setView` to enter React character dashboards.
- `js/asteria-home-guard.js` captures Home clicks and normalises startup hashes.
- `js/asteria-navigation.js` owns library-route state and directly toggles `.view.show`.
- `js/clean-compendium.js` also changes legacy view visibility and creates workspace shells.

These components may coordinate in the working site, but **there is not one authoritative page/navigation owner**. They are a likely source of fragile cross-feature regressions. For instance, the Home Guard intentionally clears many non-invite hashes at startup while other modules use hash URLs as deep links; migration must preserve supported bookmarked routes without restoring unwanted sessions.

**Replacement policy:** a single React router, one event/action owner per control, React state for UI state, explicit services for data and authentication, no page-wide DOM mutation from unrelated features. Do not directly remove legacy globals until **every consumer is mapped and tested**.

## 4. React/Vite migration boundary

The repository already contains real React functionality and game logic. Do **not** rewrite healthy components or rules engines solely to move files.

| Existing module family | Migration treatment |
| --- | --- |
| `src/dashboards/` (48 files) | Keep working React components; audit dependencies, consolidate state and styling |
| `src/state/` (88 files) | Preserve game rules/calculations; retain pure modules unless correctness tests require change |
| `src/components/` (9 files) | Reuse or consolidate shared React controls |
| `src/styles/` (21 files) | Scope and modularise; preserve dashboard artwork and customisation |
| `src/app/asteriaRoutes.mjs` | Replace split legacy/React routing with one router while preserving external URLs |
| `src/app/legacyBridge.js` | Remove only after all listed callers and global data mutations are migrated |
| `src/firebase/asteriaFirebaseService.js` | Replace `window.AsteriaFirebase` delegation only after service-contract parity is proven |
| `src/dev-entry.js` | Eliminate dual entry mechanism in the final Vite app |
| `vite.config.mjs` and `react-dist/` | Define reproducible clean build, hashed assets, cache strategy and deployment layout |

The existing `AsteriaReactRoot.jsx` uses lazy loading and an error boundary; carry these good practices into the unified app. The build's `emptyOutDir: false` and accumulated tracked historical chunks require special handling to prevent stale bundles and excessively large deployments. A clean output folder must be introduced **without deleting assets still referenced by active clients** until a versioned, rollback-safe cutover is established.

## 5. Current page and module ownership map

| Area | Current primary UI sources | Intended React ownership / migration phase |
| --- | --- | --- |
| Home, header, dropdowns, carousel | `index.html`, `js/asteria-aaa-upgrade.js`, `js/asteria-home-guard.js`, `js/asteria-core-shell.js`, header CSS | `app/` and `components/` — Phases 1 and 3 |
| Account login/profile/settings/security | `js/firebase-auth.js`, `js/auth-bridge.js`, `js/asteria-account-*.js`, `index.html` | Auth service + `pages/account/` — Phases 5 and 8 |
| Friends and notifications | `js/asteria-friend-*.js`, `js/asteria-friends-workspace.js`, notification scripts | `pages/friends/`, `pages/notifications/` — Phases 5 and 8 |
| Handbook, Worlds & Lore, Compendium | `js/asteria-navigation.js`, `js/clean-compendium.js`, `js/universal-compendium-engine.js`, `js/compendium-registry.js`, `data/compendium-index.js` | `pages/{handbook,world-lore,compendium}/` — Phase 4 |
| Character Forge, character gallery | `js/asteria-gameplay-systems.js`, `js/clean-compendium.js`, `js/app.js` and React character modules | `forge/character/` — Phase 6 |
| Campaign Forge, joining, membership | `js/clean-compendium.js`, `js/app.js`, invite/roster scripts, React campaign modules | `forge/campaign/` — Phase 6 |
| Player/GM dashboards | `src/dashboards/`, `src/state/`, `src/styles/`, legacy player/GM views | `dashboards/` + shared state/services — Phases 7 and 8 |
| Gameplay, inventory, trading, checks, maps | `js/app.js`, `js/asteria-gameplay-systems.js`, `js/asteria-inventory-*.js`, `js/asteria-item-ecosystem.js` and React equivalents | Maintain domain models; migrate UI owners — Phases 7 and 8 |
| Theme, typography, layout presets | CSS tokens, appearance scripts and account settings | Design system + account preferences — Phases 2, 3 and 5 |

See [feature-parity and replacement checklist](phase-0-feature-parity.md) for individual acceptance tasks and old-code retirement gates. This table identifies **primary owners**, not an exhaustive transitive import graph.

## 6. Firebase/backend and content preservation boundaries

- `firebase.json` specifies Firestore, Storage, Cloud Functions and emulator settings, but **no Firebase Hosting section**. **Do not** assume the Firebase backend workflow deploys the website.
- `CNAME` names `asteriattrpg.com`, but the exact site publisher, build artefact location and CDN/cache rules must be verified before the final cutover.
- Preserve **one existing Firebase project** and all collections, storage paths, functions, Firestore rules, storage rules and authorised subscription behaviour unless separately approved.
- Treat `src/firebase/asteriaFirebaseService.js` and the legacy `window.AsteriaFirebase` API as a contract until all React clients migrate. Validate privilege boundaries in backend rules, not merely hidden UI.
- Preserve the Compendium `content/` tree, `data/` indexes, Asteria ID index scheme, user campaigns, characters, dashboard layouts, trade history and friends/notifications state.
- Plan a rollback using a pinned Git commit, reproducible built assets and any necessary hosting rollback mechanism, **without data rollback** for a frontend-only release.

## 7. Testing baseline and gaps

Present source-side coverage:
- **224** `scripts/*.test.*` files indexed by the pinned tree, including backend emulator, gameplay, inventory and UI/source checks.
- Existing `scripts/test-mobile-navigation-browser.cjs` exercises mobile guest Login → Home → drawer → Handbook/Rules; this passed during the previous navigation-recovery PR. It does **not** represent authenticated GM/Player coverage.
- Other browser scripts include `scripts/test-startup-browser.cjs` and `scripts/phase7-tablet-desktop-browser.cjs`.
- `.github/workflows/mobile-navigation-browser.yml` is currently path-filtered to `index.html`, `js/**`, `css/**` and its own script/workflow. **Changes only in `src/**`, `vite.config.mjs` or generated React assets may miss that test.** Fix the coverage in the migration branch.
- Existing source/test/build success has **not** prevented live-phone regressions. Do not accept source-only assertions as release sign-off.

**Required new gates:** a real browser matrix for guest, registered Player and GM; Android/iOS-width/desktop navigation; auth/session refresh/logout; direct links/back/forward; content and favourites; both Forges; dashboard editor, combat, universal checks, trading and live sync; permission failure/retry; slow-network/failed-chunk recovery; screenshots at agreed widths; accessibility focus/keyboard; bundle and page-load budgets; clean-build/redeployment and rollback test.

## 8. Risk register

| ID | Severity | Grounded finding | Phase / required mitigation |
| --- | --- | --- | --- |
| R01 | Critical | Multiple legacy/React route owners and wrappers | 1,3: one router; migrate each route without losing deep links |
| R02 | High | Broad legacy CSS and ~3,962 `!important` occurrences | 2,9: scoped design system; remove old rules at ownership cutover |
| R03 | High | React starts through legacy page and `legacyBridge` | 1,7,9: single Vite entry and retire bridge after consumer map |
| R04 | High | `react-dist` accumulates old builds; stable entry name; manual asset URLs | 1,10: hashed clean build, cache contract, compatible rollback |
| R05 | High | Browser CI covers only part of changed frontend paths and guest flows | 0,10: comprehensive real-browser tests and triggers |
| R06 | High | Authentication/state exposed via multiple global wrappers | 5,8: one auth context and service contract; backend rule tests |
| R07 | High | Production hosting and cache behaviour not verified by repository audit | 0,10: confirm publisher, deployment steps and header policy |
| R08 | Medium | Static HTML has 89 inline event attributes and many direct DOM IDs | 3–7: replace with owned React component actions |
| R09 | Medium | Compendium/library/workspace code changes view state directly | 4,6: route-driven pages and single visibility owner |
| R10 | Medium | Large monolithic JS/React CSS may hinder maintainability/performance | 2,7,8: module boundaries; measure rather than guess |
| R11 | Medium | Content indexes and security-bound collections have compatibility contracts | 4,8: preserve IDs, schema, permissions and exports |
| R12 | Medium | CSS and JavaScript load order depends on ~82 separate asset tags | 1,2,3: Vite import ownership and deterministic entry |

Severity reflects **migration/regression risk**, not a claim that each line currently causes a production bug. In particular, the November navigation incident was fixed by an asset refresh, but a specific root cause was not conclusively demonstrated.

## 9. Phase 0 exit criteria

- [x] Pin the Git revision and inventory all tracked frontend source paths/sizes.
- [x] Identify legacy CSS/JS, React styles, current entry/build route and backend boundary.
- [x] Identify primary module owners and the most consequential duplicated controls.
- [x] Record feature parity and no-loss acceptance contracts.
- [x] Record existing automated browser coverage and missing checks.
- [ ] Confirm live website hosting/build publication and asset-cache configuration.
- [ ] Capture **authenticated** Player and GM baselines for features, permissions and live updates.
- [ ] Capture mobile/desktop screenshots, current route behaviour and real-user performance/network baselines.
- [ ] Validate migration inventory with actual owner/role smoke testing before destructive removals.

The unchecked items are **explicitly outstanding**, not silently treated as completed. No cutover or deletion of old code is authorised by this audit alone.

## 10. Migration rules agreed for all subsequent phases

1. Keep production `main` on the currently functioning website while a dedicated overhaul branch replaces the frontend.
2. The overhaul may be assembled incrementally **inside the development branch**, but the released application must not contain two active implementations of the same feature.
3. For each feature, build a React replacement, run parity tests, migrate data/state/route consumers, then remove its old handler/CSS/global dependency **in the same verified module cutover**.
4. Retain working React game logic; converting old JS to React does not mean moving pure rules calculations into JSX.
5. Avoid new backend infrastructure; keep Firebase and existing hosted content until separate approval.
6. No legacy CSS overlay layers, `window.setView` wrapper chains, untracked CSS exceptions, or indefinite compatibility shims in the final release.
7. Final production change must include a testable static artefact, cache/version strategy, end-to-end acceptance evidence and rollback procedure.

**Next build after satisfying Phase 0 blockers:** Phase 1, the authoritative React/Vite entry and routing foundation, on an isolated overhaul branch. Do not restart the previously failed page-layout Phase 2 in the legacy application.
