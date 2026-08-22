# Asteria UI Modernisation Delivery

## Previous Architecture

Asteria entered this milestone as a deliberate hybrid application. The static shell owned authentication, public compendiums, Forge pages, global navigation, and compatibility routing. React owned live Character and GM dashboards through hash routes. Legacy scripts still provide established Firebase, content, progression, and inventory contracts to React through adapters.

## Current Architecture

- `src/app/AsteriaReactRoot.jsx` is the only live dashboard route owner.
- `src/sessions/useCampaignLiveData.js` is the only React live subscription owner.
- `src/firebase/asteriaFirebaseService.js` is the React API boundary.
- `src/state/liveWorkspaceModel.mjs` owns shared gameplay transformations.
- `src/components/WorkspaceUI.jsx` owns shared panels, tabs, modals, buttons, status, errors, and read-only UI.
- `src/components/DashboardInformation.jsx` owns the combined Campaign and Resource HUD.
- `css/asteria-modern-ui.css` owns site-wide visual tokens and responsive shell compatibility.

## Routes And Workspaces

React workspaces:

- Character Dashboard
- Character
- Class/Talent Tree
- Skills
- Spells
- Inventory
- Quest
- Journal
- Party
- Gallery
- Dashboard Settings
- GM Dashboard and its campaign tool tabs

The Character Dashboard routes were completed in Steps 4-6 with shared search/filter controls, route-specific empty states, a combined campaign/resource HUD, richer party presence, an accessible gallery lightbox, and one responsive inventory renderer.

Modern shared shell styling also covers Home, Handbook, World, Races, Classes, Skills, Items, Creatures, Magic, Theology, Settings, Character Forge, Campaign Forge, and authentication screens.

Steps 7-12 complete the site-wide compatibility rollout, accessibility pass, live-listener consolidation, responsive validation, and performance pass. Full details are in `docs/ui-modernisation/STEPS-7-12-SITEWIDE-ROLLOUT.md`.

## Shared UI

- `WorkspaceShell`
- `Panel`
- `Tabs`
- `Modal`
- `AsteriaButton`
- `IconButton`
- `ResourceBar`
- `StatusPill`
- `ConnectionBanner`
- `EmptyState`
- `ErrorState`
- `ReadOnlyState`
- `DashboardInformationRow`
- `CampaignInformationPanel`
- `CurrencyPanel`
- `SearchField`
- `FilterControl`
- `Tooltip`
- shared `AsteriaIcon` SVG routes

## Legacy Removal

Previously removed legacy files remain absent and unreferenced:

- `css/v17447-core.css`
- `css/asteria-core-v2.css`
- `css/asteria-conflict-cleanup-guard.css`
- `js/v17447-core.js`
- `js/asteria-core-v2.js`
- `js/asteria-conflict-cleanup-guard.js`
- `js/v1742-admin-editor.js`
- obsolete `app.js` backup copies

This phase also removed the unused Character Dashboard resource-sidebar component, the duplicate React inventory renderer, competing inventory-column CSS, and the late-loading `js/asteria-home-fix.js` router. Repeated theme polling was converted to event-driven binding, and static campaign listeners now yield to React on official live routes. No dependency was added or removed.

## Compatibility Adapters

- `src/main.jsx` bridges static calls to React dashboard routes.
- `src/firebase/asteriaFirebaseService.js` adapts the existing Firebase singleton.
- `js/asteria-core-shell.js` preserves Home, global navigation, and mobile drawer behaviour.
- Static public/Forge renderers remain until those routes are migrated and verified in React.

## Live State

Campaign, character, session, events, presence, encounter, party, chat, inventory ecosystem, and custom item listeners are centralised in `useCampaignLiveData`. Components consume that state and do not open independent Firebase listeners. Static account discovery remains active, but its campaign-scoped listeners stand down while React owns the route. Read-only, expired, connecting, connected, reconnecting, and error presentation is shared. Session mutations remain gated by the established ten-hour live-session rule.

## Responsive Improvements

- Campaign and resources are merged into one top HUD.
- Desktop resources remain anchored in the HUD with campaign context and Gold.
- Mobile exposes resource adjustment controls on demand while keeping current values visible.
- Global navigation becomes a full-height accessible drawer below 900px.
- Inventory uses Equipment / Inventory / Party columns on desktop and one intentional column on mobile.
- Mobile Inventory uses dedicated Equipment / Inventory / Party tabs.
- No normal page-level horizontal overflow was found at the seven required viewport sizes.

## Verification

- React tests: 49/49 passed.
- Shell/content smoke tests: 430/430 passed.
- Production build: passed.
- Console warnings and errors during visual QA: none.
- Responsive browser validation passed at all seven required viewport sizes with no normal page-level horizontal overflow.
- Linting and TypeScript checks: not configured in this JavaScript project.

## Remaining Risks

- Authentication, Forge, and public compendiums still use the static compatibility shell. Removing those scripts before route migration would break working pages.
- Firebase production behaviour still depends on the deployed rules and configuration documented in `FIREBASE-SETUP.md`.
- Large storage containers intentionally scroll inside their own grid; the page itself does not overflow.
