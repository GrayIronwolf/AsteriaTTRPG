# Phase 9.4 — final import, routing, styling and script ownership audit

## Goal
Make the final **pre-cutover** React/Vite dependency and ownership check reproducible in CI. Phase 9.4 is not the production cutover: it leaves `index.html`, the live `css/` and `js/` cascade, `react-dist/` cached bundles, and Firebase hosting/backend untouched.

## Verified ownership boundaries
| Concern | Active production legacy owner | Isolated replacement owner |
| --- | --- | --- |
| HTML entry | `index.html` and `src/dev-entry.js` | `frontend/index.html` and `frontend/src/main.jsx` |
| URL events | `js/app.js`, compatibility shell and `src/app/legacyBridge.js` | `frontend/src/router/locationStore.mjs`, `siteRoutes.mjs` |
| Header and navigation | legacy DOM controllers | `SiteShell.jsx`, `NavigationMegaMenu.jsx`, `AsteriaBrand.jsx` |
| CSS | active `css/styles.css` plus ordered legacy sheets | three global token/reset/typography styles and component CSS modules |
| Firebase | current production Firebase bridge/services | `firebaseRuntime.mjs` single app plus injectable domain adapters |
| Content | existing canonical content and generated parts | filtered public-only JSON globs built by the existing generators |
| Rules | existing source-of-truth `src/state/` and `src/systems/` | same pure models imported by migrated React modules |

Both systems intentionally coexist until the Phase 10 single-entry replacement. This is **not** authorization to remove old production scripts.

## Phase 9.4 implementation
- `scripts/site-architecture-phase9-4.test.mjs` traverses the frontend source tree and the reachable source import graph from the new React entry. Local imports must exist; imports cannot escape repository boundaries.
- Each new source module's relative static imports, reexports and string-literal dynamic imports are checked for missing targets. Transitive imports into active legacy controllers, the old React entry and legacy global CSS are prohibited.
- The one **known transitional pricing dependency** is `src/systems/items/marketPricing.mjs -> js/asteria-market-pricing.js`, reached from the canonical gameplay state model. The old UMD wrapper assigns `globalThis.AsteriaMarketPricing`. It is permitted strictly as the existing shared pricing source of truth, **not** as permission to add more legacy browser-global dependencies. Phase 10 should convert it to a genuinely side-effect-free shared ESM module and preserve pricing contracts.
- Route bookmarks, deep links, legacy aliases, feature policy ownership, Home defaults and unknown-route handling are checked.
- All three allowed global frontend styles must remain distinct; component CSS files must be explicitly imported, with no `@import`, `!important` or cross-module global selector injection.
- Both legacy and new entry HTML files must reference existing, unique entry scripts and styles. Stable old compiled bundles and compatibility files remain protected, while already-retired source maps and dormant template files cannot return.
- Generated `public-index`, `public-entry-index`, `public-search-index` and `public-rules` JSON globs must have existing generated content after the normal build-time generators run; no direct raw/private Compendium imports are allowed.
- An optional audit report is written under `RUNNER_TEMP/asteria-phase-9-4-architecture-evidence/dependency-ownership-report.json`. It inventories reachable modules and non-entry modules for manual review; **unreachable does not imply safe to delete**.
- Added a dedicated GitHub Actions gate, `site:architecture-phase9-4` and inclusion in `site:check`.

## Phase 10 handoff — mandatory before removing legacy entry
1. Validate release parity with browser + authenticated multi-user emulators for Home, navigation, account/Friends, dashboards, maps/media, notifications, Compendium, forges, checks, Digital GM and economy.
2. Replace the remaining UMD global pricing adapter with one pure ESM contract **without** changing item price semantics.
3. Obtain the Phase 10 production release, cache-retention and rollback plan before removing old `react-dist` bundles or changing routing/hosting. Old sessions may still reference hashed bundles.
4. Test direct bookmarks, invite sanitization, authenticated landing, mobile/desktop design and return-to-Home behavior after replacing the production `index.html`.
5. Only after the replacement is proven may the old DOM controllers and global CSS cascade be retired. Keep a rollback version accessible until cached clients expire.

## Deployment policy
No Firebase deployment or frontend cutover is part of Phase 9.4. Merging the CI/audit changes is safe to defer until its checks pass. The user should not run a production deployment workflow for this phase.
