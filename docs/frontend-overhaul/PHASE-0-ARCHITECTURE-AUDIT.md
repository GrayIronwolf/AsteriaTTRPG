# Phase 0 — Frontend architecture audit and replacement contract

**Project:** Asteria TTRPG  
**Repository:** GrayIronwolf/AsteriaTTRPG  
**Snapshot audited:** main at cc4e78680c7482f9e105d655c50a7cc30a339d62 (18 November 2026)  
**Workstream branch:** refactor/frontend-react-vite-css-js-overhaul-20261118  
**Scope:** Read-only architecture inventory and migration contract. This document does not authorise a live deployment, a CSS override patch, or deleting legacy files.

## 1. Executive decision

Proceed with a **single React + Vite application** and a **replacement-based CSS/JavaScript architecture**. Do **not** graft another style system onto the existing page, run two app routers indefinitely, create page-specific global overrides, or retire a legacy feature before its replacement passes parity tests.

Phase 0 is an **audit**, not the production cutover. Actual React conversion, CSS/JS removal and switching the website entry point belong to Phases 1–10, isolated on the overhaul branch. Keep the existing live site and deployment configuration unchanged until full regression acceptance.

## 2. Baseline inventory (source inspection, not network transfer measurements)

| Area | Audited baseline | Evidence |
|---|---:|---|
| HTML entry | 1 primary index.html, 72,251 bytes | repository root |
| Legacy CSS | 36 files, 625,089 source bytes | css/ |
| CSS loaded directly by index.html | 35 stylesheets | page-template CSS is currently **not linked** |
| Legacy JavaScript | 46 .js files, 1,775,068 source bytes | js/ (including vendor/qrcode.js) |
| External script tags in index.html | 47 | 45 js/ scripts, compendium index, React development entry |
| Inline script blocks | 1 | feature flags |
| Inline onclick attributes | 85 literal occurrences | index.html |
| CSS !important text occurrences | 3,962 in css/; 108 in src/styles/; 4,070 total | static lexical count, not a computed cascade |
| addEventListener call sites | 434 in js/ | static lexical count, not the number of live listeners |
| React-related source | 166 .js/.jsx/.mjs and 21 CSS files | src/ |
| React stylesheet sources | 21 files, 288,396 bytes | src/styles/ |
| React JS/JSX/MJS sources | 166 files, 1,496,259 bytes | src/ |
| Committed compiled React output | 423 files, 72,967,956 bytes | react-dist/; contains retained historical cached chunks |
| Existing scripted tests | 232 filenames containing “test” under scripts/ | repository index |
| Existing GitHub workflows | 35 | .github/workflows/ |

Numbers are checked against the listed snapshot. They describe **checked-in uncompressed source/artifact sizes**, not actual browser download, active listener totals, runtime memory or Lighthouse scores. Change detection must be rerun after main advances.

### High-risk overlap evidence

1. css/styles.css: 293,892 bytes, **2,439** !important occurrences. It is loaded near the top but later stylesheets overrule it.
2. css/asteria-aaa-upgrade.css: **316** !important occurrences; css/asteria-mobile-header-stability.css: **91**; css/asteria-menu-buttons.css: **94**; css/asteria-digital-gm-navigation.css: **87**. Header, navigation, button sizing and responsive behavior have multiple competing owners.
3. js/app.js defines the original global setView; js/asteria-core-shell.js wraps setView for home routing; src/main.jsx also wraps setView for React navigation. js/asteria-home-guard.js additionally runs capture-phase home navigation and post-auth startup protection.
4. js/asteria-navigation.js handles library hash navigation; src/app/asteriaRoutes.mjs parses React hash routes; js/clean-compendium.js and js/universal-compendium-engine.js coordinate content navigation. There is no single router for all site views.
5. The legacy page links **35** stylesheets and **47** external scripts. A separate production-mode src/dev-entry.js imports the generated react-dist/asteria-react-content-v2.js; the React mount is subordinate to legacy navigation.
6. css/asteria-page-template.css and js/asteria-page-template.js exist, but neither is loaded by index.html. The HTML explicitly says the universal page template was disabled during startup isolation. **Do not re-enable it on top of the old CSS.** Rebuild the intended template as a React component during migration.
7. src/styles/asteria-react.css is itself 198,986 bytes in the repository tree. Migrating the app without decomposing this file would recreate a second monolith.

**Interpretation:** A new page template alone did not cause all CSS/JS conflicts; it exposed a pre-existing cascade and multi-owner navigation design. The observed startup/Home-to-Forge and unresponsive-menu regressions are consistent with overlapping event/router ownership. This is an architectural risk diagnosis, **not** a proven single root cause for every past incident.

## 3. Current dependency and entry-point map

**Static boot:** index.html -> design tokens -> css/styles.css -> 33 further linked stylesheets. One early home guard runs in the head. At the bottom, index.html loads 45 JavaScript files from js/, data/compendium-index.js and src/dev-entry.js; feature flags are inserted inline.

**Legacy routing and state:**
- js/app.js: setView, main static views, large gameplay/UI monolith.
- js/asteria-home-guard.js: initial Home restoration and click capture.
- js/asteria-core-shell.js: static shell, settings, home routing wrapper and Forge actions.
- js/asteria-navigation.js: Compendium library route/filter/menu, mobile nav.
- js/asteria-aaa-upgrade.js and js/asteria-menu-buttons.js: header/mega-menu interactions and visuals.
- js/asteria-state.js, js/asteria-view-hooks.js, js/data-sync.js: game and browser state/sync.
- js/clean-compendium.js, js/universal-compendium-engine.js, js/compendium-registry.js and data/compendium-index.js: public content and deep links.

**Authentication/social:** js/firebase-auth.js (Firebase integration), js/auth-bridge.js, js/asteria-account-*.js, js/asteria-friend-*.js, js/campaign-*.js. They must not lose ownership/privacy rules during the migration.

**React dashboards:** src/main.jsx -> src/app/asteriaRoutes.mjs and src/app/legacyBridge.js -> lazy src/app/mountDashboard.jsx -> AsteriaReactRoot.jsx -> GM/Character/Owned Character/Presentation dashboards. src/firebase/asteriaFirebaseService.js currently delegates to the existing window.AsteriaFirebase singleton; it must remain functionally compatible until the canonical service layer replaces the bridge.

**Build:** vite.config.mjs uses base './', emits files into react-dist/ and preserves old chunks with emptyOutDir:false. This is **not** the final full-site Vite app. Vite must eventually become the single application entry, with deterministic chunk caching and a validated legacy-client transition; do not simply delete retained chunks.

**Backend:** firebase.json retains the asteria codebase, Node 22 functions, Firestore rules/indexes, Storage rules and Auth/Firestore/Storage emulators. No new Firebase project, database schema, permissions relaxation, or cloud service is required for the frontend rewrite. Keep GitHub deployment behavior and custom domain unchanged unless separately authorised.

## 4. Future single-owner architecture

| Concern | Future authoritative owner | Legacy sources to retire after parity |
|---|---|---|
| App boot | React/Vite index + main entry | static global boot chain and src/dev-entry shim |
| Routing/Home/history/bookmarks | One React router and route guards | setView wrappers, home capture guard, competing hash parsers |
| Header, mobile navigation and megamenu | React shell components + scoped styles | core-shell/nav/AAA/menu-button DOM handlers |
| Design system | tokens + reset + shared primitives | duplicate root tokens and global cascade overrides |
| Page layout | shared React PageLayout; explicit feature variants | disabled asteria-page-template and static page shells |
| Button sizes/crystal effects | one Button component and size variants | asteria-button-sizes and overlapping global button selectors |
| Account and social pages | React Account/Friends modules | legacy account DOM controllers after parity |
| Compendium/handbook/world content | React Compendium view + content service | direct global renderers and multiple click handlers |
| Character/Campaign Forge | feature components + validated forms | static Forge DOM navigation/controller code |
| GM/Player dashboards | existing React dashboards consolidated under one app | React-to-legacy switchback, static dashboard fallbacks |
| Inventory, crafting, trade, gameplay | reusable state/services and typed UI contracts | unrelated global windows, duplicated UI rendering |
| Firestore/Auth/Storage access | existing Firebase backend via stable frontend adapter | direct DOM-bound window singleton usages as consumers migrate |
| Notifications/realtime events | services/hooks with lifecycle cleanup | overlapping global subscriptions and event delegation |
| CSS ownership | tokens, shared shell, feature-scoped CSS modules or similarly scoped styles | global !important patches and late override layers |

Rules for every feature migration: **exactly one route owner, one DOM/component owner, one canonical data owner, one component style owner and one lifecycle-safe event/subscription owner**. Temporary adapters are permitted *inside the isolated migration branch only* and have explicit removal tickets; they are not an acceptable final overlay.

## 5. Non-negotiable parity contract

- Public Home is the initial view even for returning signed-in users; intentional navigation must never bounce back to Home. Keep existing bookmarks and invitation links including #/compendium, #/join/{code}, and React character/GM hashes.
- Preserve Asteria artwork, logo/star animation, crystal button treatment, the chosen solid #060D15 navy surfaces, user-selected appearance backgrounds, typography, full-width desktop header row and usable responsive profile/menu.
- Preserve account registration, verified login, username/profile, logout, friends, requests, blocked users, notifications, protected personal content, and guest access.
- Preserve Character Forge, Campaign Forge, Asteria Handbook, Compendium reading/search, race/class/material content, IDs, filters, user bookmarks, and lazy content loading.
- Preserve GM and player permissions, campaigns, characters, resources, XP, feats/talents, inventories, shops, loot, crafting, trading, reputation/check workflows, combat, encounter management, maps (including video-loop map work), GM tools and live session data.
- Preserve freeform dashboard positioning, snapping, resizing, locking, collision prevention, saving/reset/undo/redo, mobile behavior and per-character/per-device settings.
- Preserve Firebase project, Firestore/Storage security, real-time sync, per-user permissions and resource rules. **No data migration or destructive Firestore change in frontend overhaul.**
- Do not introduce another long-lived routing framework, styling overlay or second Firebase app.
- No partial production cutover or workflow deployment until the final architecture passes all acceptance checks.

## 6. Regression baseline and evidence gaps

Available existing automated gates: npm run test:navigation, test:react, test:dashboard, test:ui, test:compendium, test:account-profile, test:friends-notifications-website, test:smoke, test:firebase, npm run build, npm run release:check and npm run lint. GitHub's firebase-checks.yml runs broad PR validation; mobile-navigation-browser.yml checks a browser navigation flow for relevant changed paths.

**Known stale test:** scripts/test-startup-browser.cjs refers to selectors .public-hero and .map-placeholder, which do not exist in the current index.html. The test must be updated against the current UI before being used as a release blocker. This is a test/source mismatch; it is not evidence the live website is currently broken.

**Existing visual references:** qa-screenshots/ contains desktop and mobile character dashboard and inventory PNGs, class Compendium and Character Forge PNGs. Its README records prior checks at widths 360, 390, 430, 768, 1280, 1440 and 1920. These are **archive references only**, not verified screenshots of the 18 November live website.

**Static performance baseline:** checked-in uncompressed CSS, JS, React source and react-dist byte totals are recorded above. These cannot be treated as measured download/paint latency. Browser baseline snapshots, request waterfall, startup navigation and timings should be captured before changing the app shell; authenticated GM/PC flows require test accounts or local emulator fixtures. Do not invent Lighthouse or Web Vitals numbers.

**Required comparative browser cases:** guest initial Home; restored-auth initial Home; deliberate Home -> Account/Login -> Home; nav across all destinations; legacy and React deep-link refresh; mobile 320/360/390/430 and tablet 768/1024 plus desktop 1280/1440/1920; single-row desktop header; Compendium lazy load; friend request send; profile; Character Forge; Campaign Forge; GM/PC live dashboards; offline/error fallback; browser back/forward; no duplicate click responses; no unexpected page reload, overflow, missing images or uncaught JS errors.

**Phase 0 evidence status:** repository inventory, overlap audit, ownership specification, feature-parity contract and test inventory are complete. Live site measurements and fresh screenshot comparisons must be captured with a browser runner before Phase 1 changes; see the reproducible browser-baseline workflow on this branch. Do not present unrun test/screenshot outcomes as passed.

## 7. Agreed implementation roadmap (not Phase 0 changes)

1. **Phase 1:** establish a real React/Vite site entry, router, shared shell, build/deploy isolation and compatibility contracts on overhaul branch.
2. **Phase 2:** replace CSS architecture with design tokens, reset, shared primitives and properly scoped component/page styles; eliminate conflicting legacy overrides as owners migrate.
3. **Phase 3:** convert global header, Home, menus, settings and navigation to React; remove competing listeners and maintain bookmark semantics.
4. **Phase 4:** migrate Handbook/Compendium and content loading/search.
5. **Phase 5:** migrate Account, Friends, social pages, profile and security.
6. **Phase 6:** migrate Character and Campaign Forges.
7. **Phase 7:** consolidate GM/Player/Character dashboard shells and gameplay UI, eliminate static fallbacks only after parity.
8. **Phase 8:** centralise shared services, state, Firebase adapters and subscription lifecycles.
9. **Phase 9:** remove legacy JS/CSS/templates, unused compiled output and dead event handlers **rather than leaving an overlay**.
10. **Phase 10:** run full test suites, visual/performance comparisons, security review, final cutover and controlled single release.

## 8. Phase 0 exit requirements

- [x] Audited legacy entry, stylesheet/script order, React/Vite mount and Firebase deployment layout.
- [x] Quantified legacy overrides and event ownership overlaps; isolated the disabled page-template proof of concept.
- [x] Defined feature ownership and explicit migration/removal boundaries.
- [x] Documented required feature parity, deep links, security constraints and tests.
- [x] Identified existing archived desktop/mobile screenshots, visual widths and a repeatable static asset baseline.
- [x] Created isolated implementation branch; **production files on main are untouched by this audit**.
- [ ] Execute fresh authenticated browser baseline and compare with the built migration; requires browser execution/fixtures, not inferred from repository text.

**Exit decision:** static/source Phase 0 audit complete; do not start destructive replacement or deploy until fresh browser baseline is recorded. The missing runtime evidence is an explicit launch gate, not a reason to patch the existing site again.
