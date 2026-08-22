# Asteria UI Modernisation: Steps 7-12

## Scope

This phase applies the shared Asteria visual language to the static public shell and completes the next consolidation pass around live state, accessibility, responsive behaviour, performance, and regression testing. The React Character and GM dashboards remain the official live dashboard implementations.

## Site-Wide Design Rollout

The shared design tokens and modern UI compatibility layer now cover:

- Home, authentication, Settings, Character Forge, and Campaign Forge.
- Handbook, World, Races, Classes, Skills, Items, Creatures, Magic, and Theology.
- Shared compendium headers, search/filter bars, category navigation, card galleries, detail pages, tabs, tables, forms, notices, loading states, and dialogs.
- React Character and GM workspaces through the same token vocabulary.

Content pages keep a readable line length and quieter panel treatment. Dense dashboard and inventory workspaces retain compact controls and stronger information grouping.

## Legacy Consolidation

The following competing behaviour was removed or converted:

- Removed `js/asteria-home-fix.js`. It was a late-loading duplicate Home router that could override the canonical shell. Home compatibility is now owned by `js/asteria-home-guard.js` and `js/asteria-core-shell.js`.
- Removed repeated one-second theme-control polling from `js/asteria-ui-theme-system.js`. Theme controls now bind through the existing event-driven refresh path.
- Converted static campaign subscriptions in `js/data-sync.js` into compatibility listeners that yield while a React live dashboard is active. React live routes use `src/sessions/useCampaignLiveData.js` as their single campaign subscription owner.
- Kept the static compendium, Forge, authentication, and account discovery layers because they still own active routes and contracts. They are compatibility architecture, not alternate live dashboards.

No stored player, character, campaign, inventory, theme, or session keys were reset. No dependency was added or removed.

## Live Session Model

`src/state/liveSyncState.mjs` now represents connecting, connected, disconnected, reconnecting, expired, read-only, waiting, and error states without contradictory output. Session expiry takes precedence over transient connection labels.

`src/sessions/useCampaignLiveData.js` owns the React connection lifecycle, including online/offline transitions and cleanup. Connection state is passed through the shared dashboard information components rather than recreated by feature panels.

## Accessibility

- Added a keyboard-visible skip link to the main workspace.
- Added semantic dialog labels and modal state to Settings and legacy compatibility dialogs.
- Added focus trapping, Escape closing, and focus restoration to Settings and shared React dialogs.
- Added explicit labels for icon-only close controls.
- Added `aria-live` announcements for settings, save/reset, level-up, and shared workspace status messages.
- Added progress-bar semantics to shared HP, SP, MP, BP, and XP bars.
- Added consistent focus-visible styling and reduced-motion compatibility.
- Disabled shared controls can expose the reason through their accessible description.

## Responsive And Performance Work

- Public compendium galleries use a shared responsive card grid: six columns where space allows, then four, two, and one column at narrower widths.
- Header, global navigation, search/filter areas, category panels, article layouts, forms, tables, and dialogs share responsive constraints.
- Mobile pages remove the persistent desktop sidebar and do not create page-level horizontal scrolling.
- Non-critical compendium and gallery images use native lazy loading and asynchronous decoding.
- React live dashboard routes are loaded through route-level `React.lazy` boundaries.
- Theme binding no longer performs permanent polling.
- Static Firebase campaign listeners stand down on React live dashboard routes, preventing duplicate campaign/character/item subscriptions.

## Validation

- Static smoke tests: 430/430 passed.
- React integration tests: 49/49 passed.
- JavaScript syntax checks: passed for the modified static shell, sync, and theme modules.
- Production Vite build: passed.
- Browser console warnings/errors during QA: none.
- Responsive browser checks passed at 360x800, 390x844, 430x932, 768x1024, 1280x800, 1440x900, and 1920x1080.
- No normal page-level horizontal overflow was detected at any required viewport.
- Settings was verified to open below the header, expose correct ARIA state, close from its own control, and restore focus.
- Project lint and TypeScript checks are not configured. The project remains JavaScript/JSX; Vite compilation, `node --check`, smoke tests, and React integration tests provide the available automated parsing and regression coverage.

## Compatibility Adapters Still Required

- `src/main.jsx` and `src/app/legacyBridge.js` bridge static navigation into official React dashboard routes.
- `js/firebase-auth.js` remains the established Firebase/authentication singleton.
- `js/data-sync.js` remains responsible for static account and campaign discovery, but not active React dashboard campaign subscriptions.
- `js/clean-compendium.js`, `js/race-compendium.js`, `js/codex-compendium.js`, and the content manifests remain active public compendium renderers.
- `js/asteria-gameplay-systems.js` remains active for Forge and campaign compatibility routes.

These adapters should be removed only after their routes have been migrated and their stored-data, Firebase, and deep-link contracts are covered by replacement tests.

## Remaining Risks

- Authentication, Forge, Settings, and public compendiums still run in the static compatibility host. Their visual system is unified, but their route renderers are not yet React components.
- The legacy CSS surface still contains broad selectors and many historical `!important` declarations. The new compatibility layer is intentionally loaded last; route-by-route React migration is still the safest way to retire the older CSS.
- Firebase production behaviour depends on deployed configuration and rules documented in `FIREBASE-SETUP.md`.
