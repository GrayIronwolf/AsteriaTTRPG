# Phase 1.1 — Standalone React/Vite foundation

**Implementation:** 18 November 2026.  
**Production status:** Not active. This is an isolated preview app, not a replacement of the live site yet.

## What has been implemented

- Created `frontend/index.html` as the **future application HTML entry**, without the 35 legacy linked stylesheets, 47 legacy external scripts or the disabled universal-page-template code.
- Created `frontend/src/main.jsx` with a single React root and `App.jsx` as its owner.
- Introduced `SiteShell` with a keyboard-accessible skip link, a semantic header/main/footer and an actual Home link. Other navigation destinations are plain text, deliberately **not inert buttons or fake links**. Phase 1.2 supplies the real router and destination pages.
- Introduced `HomePage` using imported existing Asteria artwork. The preview explicitly states that account, Compendium, Forge and dashboard features have **not** been migrated yet.
- Introduced a minimal, **isolated** `foundation.css` with scoped site class names, no legacy imports and no !important. Full shared design tokens and UI components are scheduled for Phase 1.3.
- Created `vite.site.config.mjs` for a reproducible standalone SPA build into ignored `frontend-dist/`, separate from the current `react-dist/` dashboard bundle.
- Added source/architecture, artifact, lint and eight-width Chromium regression checks in the new `site-foundation.yml` workflow.
- Extended existing ESLint coverage to the new `frontend/src` code without changing backend or Firebase behavior.

## Architecture isolation

**Existing website:** root `index.html` -> legacy boot scripts -> current React dashboard bundle. Its `npm run dev`, `npm run build`, Firebase services, domain and deployment workflows remain unchanged.

**New preview:** `frontend/index.html` -> `frontend/src/main.jsx` -> `App.jsx` -> `SiteShell` + `HomePage` -> `frontend-dist/` via `vite.site.config.mjs`. No `window.setView`, legacy script tags, global event wrappers or backend connection is installed.

This is an **isolated build target** during migration, not a second app grafted onto the live page. The old root entry and `react-dist` are retired only at the final cutover after feature parity. Both apps must not remain long-term in production.

## Local commands (Node 22)

```bash
npm ci
npm run site:check
npm run site:dev
npm run site:build
npm run site:verify-dist
npm run site:preview
```

For the optional full browser check after `npm run site:build`, install Playwright and Chromium and run `npm run site:browser`. GitHub Actions does this automatically.

## Phase 1.1 acceptance

- React renders from a clean entry; no duplicate root, legacy JS controller or CSS override layer.
- The preview uses real site artwork, has a semantic shell, an accessible Home link and an explicit not-yet-migrated message.
- Build outputs are isolated from legacy site files; normal `npm run build` and Firebase deployment remain unchanged.
- Lint and source tests pass; CI builds the site and checks compiled assets.
- Chromium verifies Home and image loading and absence of horizontal overflow at 320, 360, 390, 430, 768, 1024, 1440 and 1920px.
- All user-facing flows on the existing production site remain owned by the current implementation until they are individually migrated.

## Not part of Phase 1.1

- No replacement of the current live index or deployment.
- No new routing for Handbook, Compendium, Account, Friends, Character Forge, Campaign Forge or dashboards (Phase 1.2 onward).
- No removal of old CSS/JS and no new CSS system installed over it.
- No Firestore/Storage rules, account data, permissions, live gameplay or server-side changes.

## Next

**Phase 1.2:** A unified route definition, history/deep-link behavior and real page mounting within the new site shell, including a clear contract for features still pending migration. Only fully migrated route owners should be activated at cutover.
