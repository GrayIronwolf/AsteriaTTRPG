# Asteria UI Modernisation: Steps 4-6

Delivery date: 22 August 2026

## Scope

Steps 4-6 modernise the official React Character Dashboard and its player workspaces. Public compendiums, Forge routes, Firebase collections, stored-data keys, gameplay rules, and the GM dashboard remain compatible with the existing hybrid architecture.

## Step 4: Player Shell And HUD

- The persistent Asteria header keeps the logo, Character Forge, Campaign Forge, authentication action, and menu access.
- The character workspace uses one combined Campaign and Resource HUD instead of disconnected summary panels.
- Campaign identity and session context appear on the left, character progression and HP/SP/MP/BP appear in the centre, and currency plus live-sync state appear on the right.
- Resource adjustment controls use the existing session mutation boundary and become unavailable when the workspace is read-only.
- Mobile navigation remains an accessible drawer with Escape handling, focus return, and account-aware routes.
- Shared SVG icons replace text-symbol navigation where a familiar icon is available.

## Step 5: Player Routes

The official Character Dashboard now provides deliberate route content for:

- Dashboard: current quests, recent journal activity, party presence, character summary, and resource overview.
- Character: identity, progression, defences, equipment summary, characteristics, and racial traits.
- Class/Talent Tree: tier navigation, locked/unlocked/purchased states, prerequisites, costs, and read-only gating.
- Skills: live search, category filtering, rank information, progress, and technique details.
- Spells: live search, element filtering, rank/cost information, and cast controls that respect session state.
- Quest: search and active/completed/all state filters.
- Journal: search and personal/campaign/all filters with empty states.
- Party: richer member cards with portrait, presence, class/race, level, resources, and live status.
- Gallery: accessible image lightbox using the shared modal system.
- Dashboard Settings: established settings controls with read-only protection.

Search fields, filter controls, tooltips, empty states, error states, modals, navigation items, and status presentation are shared React primitives rather than route-specific copies.

## Step 6: Inventory

- `InventoryWorkspace.jsx` is the only React inventory renderer.
- Desktop uses Equipment / Inventory & Storage / Party columns.
- Mobile uses Equipment / Inventory / Party tabs so only one dense area is visible at a time.
- Equipment slots show selection and drag/drop focus without changing the established inventory mutations.
- Storage uses real row/column grids, capacity, recorded weight, encumbrance, search, sorting, grid/list views, quantities, and rarity styling.
- Empty storage slots remain visible and usable rather than collapsing the grid.
- Inventory cards single-click to select and double-click for item details.
- Party portraits remain available beside inventory for player actions without dominating the layout.
- Duplicate legacy React inventory markup and its competing CSS definitions were removed. Static inventory adapters remain because non-React routes still use them.

## Architecture

Canonical owners after this phase:

| Responsibility | Owner |
| --- | --- |
| React route outlet | `src/app/AsteriaReactRoot.jsx` |
| Character workspace shell | `src/dashboards/CharacterDashboard.jsx` |
| Combined HUD | `src/components/DashboardInformation.jsx` |
| Shared UI controls | `src/components/WorkspaceUI.jsx` |
| Shared icons | `src/components/AsteriaIcons.jsx` |
| Player route panels | `src/dashboards/CharacterWorkspaceTabs.jsx` |
| Gallery and settings | `src/dashboards/CharacterGallerySettings.jsx` |
| Inventory renderer | `src/dashboards/InventoryWorkspace.jsx` |
| Live subscriptions | `src/sessions/useCampaignLiveData.js` |
| Firebase mutations | `src/firebase/asteriaFirebaseService.js` |

No new router, listener owner, Firebase client, inventory data model, or page viewer was created.

## Removed Duplication

- Removed the unused second React `InventoryTab` implementation from `CharacterWorkspaceTabs.jsx`.
- Removed the competing legacy inventory-column definitions from `css/asteria-modern-ui.css`.
- Retained `legacyBridge.js`, the static shell, and public renderer files because Forge, authentication, compendiums, and compatibility routes still depend on them.
- No content files, account records, campaign data, Firebase rules, or stored-data keys were removed.

## Responsive QA

- Normal page-level horizontal overflow was not found at the tested desktop, tablet, and mobile widths.
- The mobile global drawer opens, closes with Escape, and returns focus to its menu button.
- Mobile Inventory switches cleanly between Equipment, Inventory, and Party.
- Fixed-format tabs, cards, equipment slots, and storage grids use stable responsive constraints.
- Large storage containers scroll inside their own display region instead of widening the page.

Representative production screenshots:

- `docs/ui-modernisation/screenshots/step-4-desktop-player-dashboard.png`
- `docs/ui-modernisation/screenshots/step-6-desktop-inventory.png`

## Verification

- `npm.cmd run test:react`: 42/42 passed.
- `npm.cmd run build`: passed; 43 modules transformed.
- `node scripts/smoke-test.js`: 427/427 passed.
- Production browser console: no warnings or errors during dashboard and inventory QA.
- Lint and TypeScript checks are not configured in this JavaScript project.

## Compatibility Risks

- The website remains intentionally hybrid while public, Forge, and authentication routes are still static. Those compatibility scripts must remain until their React replacements are complete and verified.
- Production live behaviour still depends on the deployed Firebase configuration and rules documented in `FIREBASE-SETUP.md`.
- Drag/drop, resource updates, spell casts, and progression purchases remain session-gated; they correctly become read-only when the GM session is inactive or expired.

