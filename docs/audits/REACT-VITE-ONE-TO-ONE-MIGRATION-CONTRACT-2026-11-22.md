# Asteria TTRPG — 1:1 Legacy-to-React/Vite Migration Contract

**Branch:** `Website-Build-Test` only.
**Reference:** recovered PR #280, immutable reference SHA `e3eff761f3113263c2e4da3dee30ba9acb656dbb` on `main` and `Asteria-W-Recovery`.
**Scope:** Replace the **implementation**, not the website. No redesign, feature removal, cosmetic approximation, gameplay-model rewrite, account migration or live Firebase schema change is authorised.
**Status:** Pre-migration inventory and baseline gating; **not** a completed migration or a successful parity comparison against a new React replacement.

## 1. Definition of 1:1

A replacement is accepted only if the old and new versions match in the following dimensions:

1. **Appearance:** Same original images, exact design tokens, header/logo crystal effects, colour, geometry, content order, desktop/tablet/mobile layouts, panel frames, UI sizing and hover/keyboard/focus behavior. Screenshot baselines with agreed viewport, browser, theme, account state; intentional changes require separate owner approval.
2. **Navigation:** Every existing route and deep link reaches the same feature with the same access requirements. Home is the landing page after login; original header links and back/forward/refresh navigation are preserved.
3. **Features:** All controls and actions continue to work, including conditional GM/player displays, overlays, notifications, confirmations, tooltips and error states. Disabled or unimplemented React placeholder does **not** count as a port.
4. **Gameplay:** Existing rules, resources, dice, combat, talents, inventory, commerce, quests and campaign behaviours are reused unchanged until a separately approved improvement.
5. **Data/security:** Existing Firebase project and user accounts, Firestore/Storage keys, character/campaign documents, permissions and Cloud Functions remain compatible. Validate read/write paths with **emulators/test fixtures**; never reset user data.
6. **Operational:** Build, validation, offline fallback, asset paths, GitHub Pages deployment paths and cross-device reload must match the original. No extra infrastructure introduced.
7. **Clean replacement:** Remove obsolete legacy view code and conflicting CSS only **after** its React replacement passes parity. Do not pile a new CSS/JS override layer over the original. PR/diff must identify old implementation removed, replacement and verification.

## 2. Source-based inventory (22 Nov 2026)

Source trees reviewed on `Website-Build-Test`:

- Legacy document: `index.html` (19 named `.view` elements; 89 inline `on*` handler attributes), `css/` (35 files), `js/` (46 files, including 2 vendor files).
- React/Vite: `src/main.jsx`, `src/app/mountDashboard.jsx`, `src/app/AsteriaReactRoot.jsx`, `src/dashboards/`, `src/components/`, `src/styles/`, `vite.config.mjs`; generated `react-dist/` is **not editable source**.
- Shared frontend rules and models: `src/state/` (88 model files), `src/systems/` (6 files), and some legacy↔React global adapters.
- Backend: `functions/` (62 tracked files), Firebase rules and config (separate from frontend migration).

Using editable frontend source **file sizes**, not feature coverage: **58.4% legacy HTML/CSS/JS, 29.8% React-side source and 11.8% shared rule/model modules**. This metric must not be called a percentage of migrated UI.

### Existing static view roots in `index.html`

`home`, `workspace`, `reactDashboard`, `loginPage`, `forgotPassword`, `accountCreate`, `playerHome`, `campaigns`, `player`, `map`, `crafting`, `gm`, `gmPlayer`, `quests`, `creature`, `devLog`, `asteriaFriendsPage`, `asteriaNotificationsPage`, `asteriaAccountPage`.

These are DOM view hosts, **not all independent final product pages**. Many nested states live inside `workspace` and dynamic legacy UI; enumerate them in page-specific parity checklists.

### Existing React routes

`#/react/gm/:campaignId`, `#/react/character/:campaignId/:characterId`, `#/react/owned-character/:characterId`, `#/react/presentation/:campaignId`.

Source: `src/app/asteriaRoutes.mjs`. The old shell still opens these routes via `src/app/legacyBridge.js`.

## 3. Migration ownership and parity matrix

| Existing interface | Current authority | Suggested React replacement boundary | Critical parity tests |
|---|---|---|---|
| Home + hero/carousel | `index.html`, `js/app.js`, `js/asteria-core-shell.js`, `js/asteria-aaa-upgrade.js` | React Home inside the **same site shell** | Same art and effects; login returns Home; carousel/buttons; mobile |
| Header + global navigation | `index.html`, `js/asteria-navigation.js`, `js/asteria-menu-buttons.js`, many `css/` styles | React Header and navigation | Same position/size; stars/crystal; keyboard/mobile; single-row desktop |
| Login/account/profile/friends | `index.html`, `js/firebase-auth.js`, `js/asteria-account-*.js` | React account views wrapping existing Auth API | Login/logout, username, friends, notifications, errors, access control |
| Compendium/handbook/world lore | `js/clean-compendium.js`, `js/universal-compendium-engine.js`, `data/compendium-parts/` | React compendium navigation + entries | All categories/search/links, lazy loading, bookmarks and retry |
| Character Forge | `js/asteria-gameplay-systems.js`, `js/clean-compendium.js` | React character hub, creation/editor | Every creation step, class/talent/race constraints, saved sheet, ownership |
| Campaign Forge/manager/join | `js/clean-compendium.js`, `js/asteria-core-shell.js`, `js/firebase-auth.js` | React campaign hub and manager | GM create/edit, invitations/UCN, player join/approval, artwork |
| Player Dashboard | Already React `src/dashboards/CharacterDashboard.jsx` | **Retain**, don't rebuild | Existing 21 tabs, HUD, inventory, layouts, combat and notices |
| GM Dashboard | Already React `src/dashboards/GMDashboard.jsx` | **Retain**, don't rebuild | Existing 24 tabs, GM tools, layouts, NPCs, encounters |
| Dashboard customisation | React `src/components/DashboardCustomisation.jsx`, legacy-global CSS influence | Keep React implementation, consolidate CSS safely | Drag, resize, lock, save, reload, mobile, separate GM/player |
| Combat, dice, inventory, quests, economy | React workspaces + shared rules + legacy adapters | Reuse existing React UI/models, replace remaining legacy wrappers only | Gameplay results, resource changes, permissions, persistence |
| Theme/global CSS | `css/styles.css` + 34 other legacy CSS files, and `src/styles/` | Shared tokens + component-owned CSS | Pixel parity; no broad overrides; remove old CSS only once unused |
| Firebase backend | Cloud Functions, Firestore and Storage rules | **No migration** | Emulators/permissions/regression; zero live schema resets |

## 4. Dependencies that must be made explicit

The old website uses `window.setView`, `window.AsteriaWorkspace`, `window.AsteriaGameplay`, `window.AsteriaFirebase`, `window.AsteriaReactMigration`, `window.chars`, `window.campaigns`, and global session/account state.

React is currently mounted lazily from `src/main.jsx` with `src/app/mountDashboard.jsx` and routes via `src/app/legacyBridge.js`. `vite.config.mjs` generates React chunks in `react-dist/`, loaded by the existing `index.html`.

For each migrated view:

- Record its old DOM IDs, links, inputs, events, global functions and persistence calls.
- Keep preexisting shareable URLs and deep links; choose a canonical React route and compatibility mapping.
- Replace legacy global state reads/writes with **one** owned adapter, not duplicates.
- Do not disable the old view until the new one passes side-by-side parity and rollback checks.
- Remove only legacy event handlers and CSS that are proven unused.
- Protect the main HTML shell and visual design throughout.

## 5. Mandatory pre-migration checks and current evidence

| Gate | Evidence | Result |
|---|---|---|
| Correct baseline | Three branches matched PR #280 when baseline audit began; protected branches remain at PR #280 | Verified |
| Source inventory | Static view roots, React routes and frontend source breakdown inspected | Verified |
| Existing core CI | Green run on test branch: https://github.com/GrayIronwolf/AsteriaTTRPG/actions/runs/44966170647 | Verified on historical test SHA |
| Isolated browser test | https://github.com/GrayIronwolf/AsteriaTTRPG/actions/runs/44966170627 | **Failed**: 2 home/handbook successes, 5 dashboard failures |
| Failure diagnosis | Browser logs: `subscribeRecordingNotice`, `subscribeRecordingControl`, `subscribeUniversalChecks` absent from local `src/devFixtures.js`; real Firebase interface has these methods | Fixture contract deficiency identified |
| Browser fixture fix | Added read-only defaults for six recording/check subscriptions in test fixtures, only on `Website-Build-Test` | Requires fresh run to verify |
| Full visual parity | Source snapshot is available, but accepted baseline screenshots at all required viewports and account states are not complete | **Not verified** |
| New React replacement | No legacy screen has yet been replaced in this migration attempt | **Not started** |
| Real Firebase compatibility | Existing automated rules tests pass; no real account/cross-device manual acceptance run yet | **Partially verified** |

**Important:** Browser fixture pass is not proof of live Firebase flow correctness. Run data-integrity and permissions tests in emulators, then carefully selected user-driven live acceptance if separately authorised.

## 6. Phased implementation (approval after each phase)

### Phase 0 — Lock the exact old-site contract (current)

- Run the full existing automated suite; repair test-only fixtures where incomplete.
- Capture desktop (1920/1440), tablet (768/1024) and mobile (390/430) screenshot baselines, using controlled logged-out, player and GM states.
- Capture routes, HTML landmark IDs, navigation, keyboard behavior, interactions and Firestore access contracts.
- Add automated static/source contract tests and browser screenshot checks that fail on unintended disappearance or layout drift.
- **Stop until owner approves proceeding.**

### Phase 1 — React shell replacement (lowest-risk vertical slice)

- Create a React replacement for a narrowly scoped shared shell or Home section, preserving exact DOM/control semantics and visuals.
- Put the replacement behind a test-only flag; keep original default and rollback.
- Compare the same viewport/fixture against the original, review screenshot overlays and interaction results.
- Replace the **old implementation** after acceptance rather than stacking new UI layers over old.
- **Owner approval required before any further phase.**

### Phase 2 — Global header/navigation

- Port exact logo/star/crystal effects, button sizes, menus, account controls, desktop/tablet/mobile behavior.
- Preserve hash links and event semantics.
- Delete obsolete legacy handlers/styles only after parity and smoke checks.

### Phase 3 — Authentication/account/friends/notifications

- React view replacement reusing the same Firebase Auth service and permission policies.
- Verify session lifecycle, account switching, notifications, friend privacy and no unwanted redirects.

### Phase 4 — Compendium, handbook and lore

- Port rendering/search/filtering and exact lazy content semantics to React; retain the canonical content and IDs.
- Test direct bookmarks, reload, content latency, errors and accessibility.

### Phase 5 — Character Forge

- Replace the old renderer, not gameplay rules or stored schema.
- Run end-to-end creation, ownership, editing, save/reload, campaign linking and character dashboard handoff.

### Phase 6 — Campaign Forge / campaign connections

- Replace old campaign UI, not shared rules/Cloud Functions.
- Validate invitations, approvals, UCN, GM/player permissions, artwork, party management and data persistence.

### Phase 7 — Remaining legacy wrappers and CSS consolidation

- Identify old `.view` roots and scripts still required, remove only after each verified migration.
- Reduce `css/styles.css` and global event handlers by moving styles to owned React components.
- Explicitly preserve existing React dashboards and their 21/24 tabs.

### Phase 8 — Production readiness and approved release

- Compare **all** pages and controls to the baseline, including mobile and error/empty/loading states.
- Verify existing Firebase reads/writes with emulators and controlled live acceptance; test data backup and rollback.
- All CI/browser/visual checks must pass; no skipped required checks.
- Owner explicitly approves merge to `main`; owner handles deployment. Protect `Asteria-W-Recovery` unless owner separately approves its update.

## 7. Non-negotiable stop conditions

Stop migration if: a feature is missing; UI is materially different without owner approval; login or navigation redirects incorrectly; dashboard appearance/panels regress; an account sees another user's records; Firestore/Storage schema changes without approval; an offline browser test connects to live Firebase; a test is skipped instead of diagnosed; or the test branch cannot be rolled back.

A green compilation, passing unit suite, or visible page alone is **not** proof of 1:1 parity.

## 8. Branch and deployment rules

- All implementation and test assets go into `Website-Build-Test` only.
- `main` and `Asteria-W-Recovery` must remain unchanged and protected without explicit owner approval.
- Never move GitHub Pages source or deploy Firebase as a side effect of this audit.
- No automatic progression to the next phase. Every phase ends with an owner-facing diff, evidence, failures, and explicit approval request.
