# Asteria React Migration Contract

Audit date: 22 August 2026

This document is the safety contract for modernising Asteria. The current site is a deliberate hybrid application. React is the official architecture for live dashboards; the static shell remains a compatibility host for public compendiums, authentication, and Forge routes until each route is migrated and verified.

## Recovery Checkpoint

The pre-change checkpoint is `ASTERIA-STEPS-1-3-CHECKPOINT-BEFORE-20260822.zip`.

The workspace is not a Git repository, so the ZIP is the rollback checkpoint for Steps 1-3.

## Repository Audit

| Area | Current result |
| --- | --- |
| Framework | React 18.3.1 mounted through Vite 5.4.14 |
| Language | JavaScript/JSX with JSDoc runtime contracts; no TypeScript yet |
| CSS files | 8, including the new canonical token file |
| Static JS files | 33 |
| React source files | 23 |
| Content files | 1,069 |
| Inline styles in `index.html` | 4 |
| Legacy `!important` declarations | 2,660 |
| Global `window.*` assignments | 283 |
| Direct DOM selectors in React source | 0 |

The large legacy counts are migration debt, not permission to bulk-delete. They identify the surface to reduce route by route after ownership and stored-data contracts are proven.

The Steps 7-12 consolidation removed the duplicate `js/asteria-home-fix.js` router, so the current static JavaScript count is 32. It also removed permanent theme polling and prevents static campaign listeners from competing with React live-dashboard subscriptions.

## Official Architecture

| Responsibility | Canonical owner |
| --- | --- |
| React application provider | `src/app/AsteriaAppContext.jsx` |
| React route parse/build/navigation | `src/app/asteriaRoutes.mjs` |
| Static-to-React compatibility boundary | `src/app/legacyBridge.js` |
| React route outlet | `src/app/AsteriaReactRoot.jsx` |
| Live campaign subscriptions | `src/sessions/useCampaignLiveData.js` |
| React Firebase API boundary | `src/firebase/asteriaFirebaseService.js` |
| Gameplay transformations | `src/state/liveWorkspaceModel.mjs` |
| Event de-duplication/state | `src/state/liveEventReducer.mjs` |
| Live-sync presentation state | `src/state/liveSyncState.mjs` |
| Shared runtime contracts | `src/types/asteriaContracts.mjs` |
| Shared React UI | `src/components/WorkspaceUI.jsx` |
| Canonical visual tokens | `css/asteria-design-tokens.css` |
| React workspace styling | `src/styles/asteria-react.css` |

Feature panels must not open their own Firestore listeners, create another router, write directly to legacy DOM, or create a competing account/session store. New React work goes through the owners above.

## Route Ownership

| Route/view | Owner | Status |
| --- | --- | --- |
| `#/react/gm/:campaignId` | React | Official live GM Dashboard |
| `#/react/character/:campaignId/:characterId` | React | Official live Character Dashboard |
| Home, Login, Forgot Password, Create Account | Static shell | Compatibility route |
| Public compendiums | Static unified compendium | Compatibility route |
| Character Forge and Campaign Forge | Static gameplay/workspace system | Compatibility route |
| Legacy GM tools not yet migrated | Static GM renderer via `legacyBridge.js` | Explicit adapter |

`src/app/asteriaRoutes.mjs` is the only React hash-route parser and builder. `src/app/legacyBridge.js` is the only React module allowed to activate static views or mirror compatibility globals.

## Data And Listener Ownership

- `useCampaignLiveData` owns campaign, character, session, event, presence, party, chat, inventory ecosystem, encounter, and custom-item subscriptions.
- `asteriaFirebaseService` exposes mutations and subscriptions to components. Components do not import Firebase packages or use raw Firestore calls.
- `liveWorkspaceModel.mjs` owns reusable transformations such as session expiry, resource changes, storage grids, skill progress, and talent costs.
- `liveEventReducer.mjs` owns pending/resolved event semantics so reconnects cannot replay XP, loot, or magic rewards.
- `AsteriaAppContext` exposes route and read-only account snapshots. Authentication remains owned by the established Firebase singleton during the compatibility period.

## Preserved Stored-Data Contracts

These keys are active compatibility contracts and must not be renamed or removed without a versioned migration:

| Key | Owner/purpose |
| --- | --- |
| `asteria-v1-2-12-state` | Core characters, campaigns, encounters, and initiative backup |
| `asteria-v1-3-accounts` | Legacy account compatibility |
| `asteria.phase3.gameplay.v1` | Gameplay and Forge state |
| `asteria.phase4.world.v1` | World systems state |
| `asteria-ui-theme-v1` | Current theme settings |
| `asteria-v1-7-2-3-sync-meta` | Cloud/local sync metadata |
| `asteria-v1-7-2-3-app-system-state` | Synced application systems |
| `asteriaFirebaseUsernameMap` | Firebase username lookup cache |
| `asteriaFirebaseProfiles` | Firebase profile cache |
| `asteriaPendingInviteCode` | Pending invite flow |
| `asteriaPendingCampaignJoin` | Character-to-campaign join handoff |
| `asteria-clean-creator-rolls` | Session-scoped Forge rolls |
| `asteria-session-state`, `asteria-session-events`, `asteria-archived-logs` | Legacy session log compatibility |
| `asteria-gm-encounter-workspace-v1` | Legacy encounter workspace |
| `asteriaNotificationSettingsV1` | Notification preferences |
| `asteriaTransactionPipelineV1` | Transaction compatibility |
| `asteriaCraftingPipelineV1` | Crafting compatibility |
| `asteriaMaterialSystemV1` | Materials compatibility |
| `asteria_enchantment_system_v1` | Enchantment compatibility |
| `asteria_world_economy_v1` | Economy compatibility |

## Shared Design System

`css/asteria-design-tokens.css` is loaded before all feature CSS and defines:

- surface, overlay, border, active, text, and muted colors;
- HP, SP, MP, BP, XP, status, and item-rarity colors;
- typography, spacing, radii, shadows, focus, transitions, and layout dimensions.

`src/components/WorkspaceUI.jsx` provides the reusable React layer:

- `AsteriaAppShell` and compatibility alias `WorkspaceShell`;
- `AppHeader`, `PanelHeader`, `SectionHeader`, `AsteriaPanel`, and `DashboardCard`;
- `DashboardNavigation`, `NavigationItem`, and compatibility alias `Tabs`;
- `ResourceBar`/`StatBar`, `ResourceChip`, and `CurrencyDisplay`;
- `LiveSyncStatus`, `LoadingSkeleton`, `EmptyState`, `ErrorState`, and `ReadOnlyState`;
- `Modal`, `AsteriaButton`, `IconButton`, and `StatusPill`.

Compatibility aliases are intentional and may be removed only after all current imports have migrated.

## Conflict Inventory

- The static shell and React both exist in `index.html`, but only one live dashboard is activated for a React route.
- Legacy CSS is broad and highly specific; the React workspace is scoped under `#asteriaReactRoot` and consumes central tokens.
- Static code still publishes globals used by public compendiums, Forge, progression, and content libraries.
- Theme settings update CSS variables shared by static and React UI.
- Legacy item-exchange method names remain adapters to the canonical `playerItemRequests` data model.

## Files Not Safe To Remove

- `js/app.js`: static bootstrap, content libraries, progression compatibility, and remaining GM systems.
- `js/firebase-auth.js`: Firebase singleton and established cloud contracts.
- `js/data-sync.js`: static account/campaign discovery and compatibility sync.
- `js/clean-compendium.js`: public unified compendiums and account workspace.
- `js/asteria-gameplay-systems.js`: Forge and campaign compatibility.
- `js/asteria-core-shell.js`: global navigation and Home behaviour.
- `js/asteria-inventory-workflows.js` and `js/asteria-item-ecosystem.js`: non-React GM/shop/reward routes.
- `css/styles.css`, `css/clean-compendium.css`, and related public CSS: public and Forge routes still consume them.

## Migration Order

1. Shared contracts, tokens, components, route boundary, and live-sync states. Complete in Steps 1-3.
2. Migrate authentication and global shell into the official React provider without changing Firebase contracts.
3. Migrate Character Forge and Campaign Forge route by route.
4. Migrate public compendiums onto reusable React compendium components while preserving content manifests and URLs.
5. Migrate remaining GM systems through `asteriaFirebaseService` and `useCampaignLiveData`.
6. Remove each static renderer only after no HTML, script, event, stored key, Firebase rule, or test references it.

## Steps 7-12 Result

- The design-token and compatibility layer now covers every public, Forge, authentication, Settings, compendium, and live-dashboard surface.
- `js/asteria-home-fix.js` was removed after reference checks proved the canonical Home guard and shell own its behaviour.
- Theme controls no longer use repeated polling.
- Static campaign listeners yield to the canonical React subscription owner while a React dashboard route is active.
- The live-sync model exposes reconnecting state and gives expired sessions clear precedence.
- Shared settings and modal systems now include semantic dialog state, focus trapping, Escape closing, focus restoration, and live announcements.
- Public compendium images use native lazy loading, and React dashboard routes use route-level code splitting.
- Static smoke tests pass 430/430; React integration tests pass 49/49; the production build passes; all seven required viewport checks have no normal page-level horizontal overflow.
- See `docs/ui-modernisation/STEPS-7-12-SITEWIDE-ROLLOUT.md` for the full rollout and validation record.

## Step 1-3 Result

- Repository and architecture audit completed.
- Pre-change ZIP checkpoint created.
- One official React provider, route contract, legacy boundary, Firebase API boundary, listener owner, gameplay model, event model, and live-sync presentation model established.
- One canonical token file and reusable React component library established.
- Character and GM dashboards consume the canonical shell and dashboard navigation.
- Expired and read-only sessions remain visible instead of being collapsed into an ambiguous disconnected state.
- No content data, Firebase contracts, stored keys, compendium loaders, or gameplay rules were removed.
