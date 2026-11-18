# Phase 1.2 — Unified React navigation and routing

**Project:** Asteria TTRPG  
**Implementation:** 18 November 2026  
**Production status:** Isolated React/Vite preview, NOT the live website.  
**Dependency:** Phase 1.1 (PR #287).

## Implemented

One canonical route registry (frontend/src/router/siteRoutes.mjs) now determines all destinations; one location hook (frontend/src/router/useSiteRoute.js) responds to hashchange and popstate, with cleanup on StrictMode remount. The React App is the sole page outlet. The React SiteShell supplies semantic navigation using that same registry for desktop and mobile. A RoutePreviewPage honestly labels unconverted destinations; it does not load any account, campaign or private character data.

The frontend/src/styles/foundation.css file was edited in place to support a compact single-row desktop header, a mobile disclosure menu, keyboard focus and route layouts. No CSS override file was appended, no global JS router was installed, and no backend integration was changed.

## Supported URL contracts

Primary routes:

| Destination | Existing-compatible hash |
|---|---|
| Home | #home |
| Asteria Handbook | #/compendium?group=rules&category=handbook |
| Worlds & Lore | #/compendium?group=world |
| Asteria Compendium | #/compendium |
| Character Forge | #/character-forge |
| Campaign Forge | #/campaign-forge |
| Friends | #/account/friends |
| Account | #/account |

Also recognised: #/account/login, #/account/create, #/account/forgot-password, #/account/profile, #/account/settings, #/account/notifications, #/dashboard, and older account/Forge aliases. Compendium entry bookmarks (#/compendium/{domain}/{slug}?tab=...), 12-digit campaign join links (#/join/{code}), existing React dashboard links (#/react/gm/{campaignId}, #/react/character/{campaignId}/{characterId}, #/react/owned-character/{characterId}, #/react/presentation/{campaignId}) and secure invitation hashes are explicitly parsed.

An explicit route is never overwritten by a stale query invite; a query invite is considered only on a location without an explicit hash. Unknown routes render Page Not Found, not Home. Direct links, reload, browser back and forward are retained without rewriting the URL. Encoded route identifiers are decoded defensively.

## Safe migration boundary

This is Phase 1.2 routing infrastructure, not the conversion of the Compendium, Account, Forge or GM/Player dashboard features. The new route destinations are clearly labelled **previews**. Existing live account, campaign and gameplay operations remain on the old live website until they are migrated with full parity. The preview does not initialise Firebase, request credentials, redeem invites, or reveal IDs/tokens in rendered content.

Root index.html, production js/ and css/, src/main.jsx, the legacy Vite bundle, firebase.json, Firebase backend/security rules and normal website deployments remain untouched. The final design will have one React app after cutover, not two overlapping production routers.

## Interaction contract

- Desktop navigation: one visible row, including logo, with active link indicated by aria-current.
- Mobile/tablet: a native details/summary menu offers the same registry; closes after choosing a route.
- Navigation uses real hash anchors, allowing native browser traversal and refresh.
- Accessible landmarks, visible keyboard focus, a usable skip link and main-region focus after intentional page changes.
- Exactly one hashchange/popstate location subscriber; no capture-phase Home guard, window.setView or dynamic legacy DOM manipulation.

## Checks

Added pure route tests in scripts/site-routing-phase1-2.test.mjs, covering primary navigation, old bookmark formats, Compendium filters/tabs, authentication placeholders, GM/Player route shapes, invitations, unknown routes and malformed URL encodings.

Added real Chromium navigation tests in scripts/site-routing-browser.cjs: link changes, active states, history back/forward, reload, deep links, invitation token privacy, mobile menu, keyboard skip navigation, no horizontal overflow at 320, 360, 390, 430, 768, 1024, 1440 and 1920px, and one-row desktop header. Phase 1.1 tests remain enabled.

The site-foundation CI workflow runs on Ubuntu 24.04, with source checks, Vite build, generated artifacts, lint, original browser tests and new routing browser tests. Repository-wide PR checks are also mandatory before merging.

Run locally (Node 22): npm ci; npm run site:check; npm run site:build; npm run site:verify-dist; npm run site:dev; npm run site:preview. With Playwright and Chromium installed: npm run site:browser; npm run site:routing-browser.

## Exit checklist

- [x] Canonical route registry and browser-location hook implemented.
- [x] Desktop and responsive mobile navigation use the same registry.
- [x] Existing Asteria deep-link formats recognised without leaking private content.
- [x] Single outlet and placeholders for later migrated features.
- [x] Repeatable source, build and browser tests added to CI.
- [ ] Green GitHub CI and merge — report actual results before completion.

## Next: Phase 1.3

Replace the preview's temporary CSS with properly scoped tokens, shared buttons/surfaces, typography and page layout components. Do not layer this over old production CSS. Do not remove live production CSS/JS until the feature migration and final cutover pass parity tests.
