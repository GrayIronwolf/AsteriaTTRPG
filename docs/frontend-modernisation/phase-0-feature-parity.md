# Phase 0 — Frontend Feature-Parity and Retirement Checklist

**Status:** Source-code owner map established; **live functional acceptance not yet performed**. This checklist is the no-feature-loss contract for the React/Vite replacement. A checked box means a verified test exists and has passed against the **new implementation**. Unchecked means **not yet proven**, not that the current production feature is absent.

See [Phase 0 architecture audit](phase-0-architecture-audit.md) and [pinned file inventory](phase-0-file-inventory.json). In each module PR, attach test evidence, identify the old source being retired, and update the items below. Preserve existing behaviour, data and approved artwork unless a separate product decision explicitly changes it.

## A. Application shell, routing, header and Home — Phases 1 and 3
- [ ] A single Vite-managed React entry loads all published frontend modules, with no dependency on `src/dev-entry.js` or direct classic-script tag order.
- [ ] One router owns Home, public pages, account pages, dashboard pages and navigation history.
- [ ] Existing `#home`, `#/compendium?...`, definition links, React dashboard links and secure-campaign invitations continue to resolve or redirect deliberately.
- [ ] Visiting the website while authenticated defaults to Home, without unexpectedly resuming Character Forge or another prior page.
- [ ] Back, Forward, reload, pasted URL and deep links work without returning unexpectedly to Home.
- [ ] Header logo, single-row desktop navigation, profile image, signed-in/signed-out controls and compact mobile drawer display correctly.
- [ ] Dropdowns open, keyboard focus returns correctly, Escape closes, and a card opens its destination.
- [ ] Homepage four-image carousel retains manual arrows, dots, automatic timer line, reduced-motion behaviour and mobile touch areas.
- [ ] Carousel navigation controls remain visually transparent, without unintended boxes.
- [ ] Approved menu/cards artwork (including Forge A Campaign book) displays without unwanted borders or frames.
- [ ] Every click has one event owner; no click is swallowed by a second legacy handler.
- [ ] Loading, error, offline and retry states are visible, recoverable and do not indefinitely disable navigation.

## B. Visual design and responsive templates — Phases 2 and 3
- [ ] Central design tokens are authoritative for `#060D15` menu/header/panel surfaces, text, accent colours, spacing and focus.
- [ ] Existing card surfaces and images keep their separate treatment; changing panels does not recolour cards.
- [ ] AAA crystal button geometry, bevels, +/− controls, silver styling, borders and hover feedback are preserved where used.
- [ ] Shared page header, section navigation and main content follow the approved Account-style layout.
- [ ] Pages use scoped CSS or CSS Modules; no old stylesheet is still responsible for rendering a migrated component.
- [ ] There is one responsive breakpoint strategy for desktop, tablet and narrow mobile devices.
- [ ] Appearance/background and typography user preferences remain functional.
- [ ] Text remains readable, overlays have appropriate z-order, and mobile tap targets remain usable.
- [ ] Reduced-motion, focus-visible, tab order, screen reader labels and contrast checks pass.
- [ ] Screenshot comparisons confirm page geometry, menu size and dashboard controls.

## C. Handbook, Worlds & Lore and Compendium — Phase 4
- [ ] Asteria Players Guide and GM Guide categories, Rules, Systems, Quests and Campaigns remain navigable.
- [ ] Worlds, Realms, Planes, Theology, NPCs, Lore, Languages and Factions remain navigable.
- [ ] Races, Classes, Magic/Elements, Resources, Blueprints, Recipes, Schematics, Patterns, Formulas and Designs remain navigable.
- [ ] Search handles titles, current data and the Asteria ID index without changing established identifiers.
- [ ] Group/category filters, sorting, saved-only selections and load-more continue to work.
- [ ] Definition entry pages open from cards, category lists and direct links.
- [ ] Breadcrumbs and Back navigation retain logical entry context.
- [ ] Favourites and recently visited entries persist correctly per account.
- [ ] GM-only information is hidden or accessible under the same permissions as the existing system.
- [ ] Markdown/media content, images and page metadata are preserved from the current `content/` and `data/` sources.
- [ ] Both library view and individual detail view use one shared React page shell without an old companion renderer.

## D. Authentication, Account and appearance — Phases 5 and 8
- [ ] Registration, login, logout, password reset and verification flows work.
- [ ] Sessions restore correctly without exposing another user's data or forcing the wrong page.
- [ ] Profile display, editing, username and account settings retain existing validation.
- [ ] Profile/Settings/Appearance/Password & Security tab actions have one navigation owner.
- [ ] Role-based Player/GM permissions come from server-approved claims/data and Firestore rules, not UI visibility alone.
- [ ] Account security actions, friend privacy settings, and blocking controls remain available.
- [ ] Appearance settings (fonts, background choices, panel styles) persist across allowed sessions/devices.
- [ ] Auth readiness and Firebase errors have clear recovery states rather than trapping the app on a loading page.
- [ ] Logout disposes subscriptions and clears account-scoped dashboard/notification state.
- [ ] Emulator and authorised account tests confirm normal and denied operations.

## E. Friends, chats and notifications — Phase 5
- [ ] Friends directory/profile view remains accessible to the authorised account.
- [ ] Sending, receiving, accepting, declining and cancelling friend requests works.
- [ ] Block/unblock actions and visibility restrictions work.
- [ ] Distinct Friends, Requests and Blocked views remain available.
- [ ] Existing campaign chat/conversation entry points retain their implemented capabilities; do not invent unavailable chat features.
- [ ] Notification counts, unread/read filters, read/unread transitions and history operate correctly.
- [ ] Notifications open the correct linked destinations without losing context.
- [ ] Cross-account permission and live-update rules are checked with two separate test users.
- [ ] Visual badges and menu behaviour remain consistent on mobile and desktop.

## F. Character Forge — Phase 6
- [ ] My Characters lists only characters the user can access.
- [ ] Create character starts the current wizard, including validation and required selections.
- [ ] Race, class, attributes, skills, talents and other existing creation steps retain current rules.
- [ ] Character portrait/background artwork and resource information display correctly.
- [ ] Save, edit, resume and reopen preserve character records and IDs.
- [ ] Character selection opens the correct character dashboard.
- [ ] Linked campaign membership and shared-character permissions are preserved.
- [ ] Direct navigation, Back, cancel and session restoration work.
- [ ] A previous failed save/retry cannot corrupt data or create uncontrolled duplicates.

## G. Campaign Forge — Phase 6
- [ ] Forge A Campaign, My Campaigns and Join A Campaign work from all current menu entry points.
- [ ] Creating/editing campaign preserves name, image, permissions and existing fields.
- [ ] Joining using current invitation/UCN workflows honours membership and validity checks.
- [ ] GM/Player role visibility and invite permissions remain enforced.
- [ ] Existing campaign list, participant roster and character links work.
- [ ] Campaign images and media uploads remain available where currently supported.
- [ ] Campaign workspace navigation no longer competes with general page routing.
- [ ] Error, loading and retry states preserve submitted details without unintended duplicate actions.

## H. Player dashboard and game systems — Phases 7 and 8
- [ ] Player dashboard and character route load the correct campaign/character.
- [ ] HP, SP, MP, XP, NAC, characteristic and progression views remain correct.
- [ ] Character inventory, containers, equipment and trading retain current actions and permissions.
- [ ] Magic/spells, talents, character advancement and actions retain existing rules calculations.
- [ ] Initiative, combat conditions, actions, turns, resources and logs stay functional.
- [ ] Dice rolling and universal checks support current digital and physical flows.
- [ ] Quest journal, crafting blueprints/recipes and current gameplay tabs remain available.
- [ ] Dashboard drag/snap/resizing, lock, save/reset/undo/redo and mobile layouts retain their behaviours.
- [ ] Player notifications and real-time GM interactions arrive without duplicate subscriptions.
- [ ] A network disconnect and reconnect do not corrupt or duplicate actions.

## I. GM dashboard and live toolkits — Phases 7 and 8
- [ ] GM dashboard opens only campaigns the current GM can access.
- [ ] Party roster, NPC/creature management, character links and encounter management work.
- [ ] GM universal check requests, opposed/group checks, digital/physical dice and history work.
- [ ] Inventory grants, loot tables, rewards, trading and shop interactions retain permission checks.
- [ ] GM maps, fog/visibility, uploaded assets and looped video maps work wherever currently implemented.
- [ ] Live sessions, calendar, weather, world atlas, recordings, soundboard and presentation controls retain present functionality.
- [ ] Campaign notes, journals, session assets and other current uploads use the expected Firebase paths.
- [ ] Dashboard customisation and shared vs per-device locks remain intact.
- [ ] Realtime events, role filters and account switching never expose another campaign's data.
- [ ] GM and Player can interact in the same test session without duplicate updates or stale states.

## J. Backend/data contracts and release gates — Phases 8–10
- [ ] Preserve Firebase project, Firestore/Storage collection/path contracts and Cloud Functions endpoints.
- [ ] Use a single frontend authentication context with correct account-switch cleanup.
- [ ] Read/write authorisation is validated against Firestore and Storage rules with emulator accounts.
- [ ] Replacing `window.AsteriaFirebase` wrappers does not remove any caller until contract parity is tested.
- [ ] Preserve the source Compendium/Obsidian-content ingestion format and Asteria ID index.
- [ ] The production hosting provider, publish source, cache headers and SPA fallback are verified.
- [ ] Vite build is reproducible from a clean checkout, with correctly versioned CSS/JS/assets and no manually maintained stale bundle entry.
- [ ] Automated mobile browser checks trigger for `src/**`, shared styles, routes, build config, and package changes.
- [ ] Desktop/mobile guest, Player and GM browser journeys pass; links and authentication history work.
- [ ] Loading performance, bundle size and memory are measured against actual pre-migration baselines.
- [ ] Visual snapshots pass for Home, all menu pages, both Forges and both dashboards.
- [ ] The migration is deployable with a documented production rollback and no unintended Firebase database rollback.
- [ ] No duplicate active router, DOM handler, legacy `window.setView` wrapper or outdated stylesheet remains in the published frontend.
- [ ] Obsolete `js/`, `css/`, `react-dist/` and `legacyBridge` dependencies have been removed **only after** consumers are proven migrated.
- [ ] The user approves live visual and role-based acceptance before production cutover.

## Baseline collection still required before Phase 1 implementation

| Evidence | Status | Responsible verification |
| --- | --- | --- |
| Pinned source inventory and ownership/risk map | **Captured** | Repository audit |
| Existing guest mobile browser route test | **Available** | GitHub Actions (limited guest path) |
| Mobile Home/header/menu screenshots | **Pending** | Real devices, including Android |
| Desktop Account/Compendium/Forge screenshots | **Pending** | Real browsers |
| Authenticated Player and GM feature walkthroughs | **Pending** | Test accounts / emulator |
| Network, asset cache and hosting publication details | **Pending** | Hosting provider/configuration |
| Initial load, large dashboard, memory and bundle baseline | **Pending** | Browser performance tooling |
| Confirmation of future-only features vs current parity | **Pending** | Separate product approval if unclear |

**Exit rule:** The original frontend is not retired, and old-code deletion is not approved, merely because the new website builds or passes guest navigation tests. Every affected module requires functional parity and an explicit verified retirement step.
