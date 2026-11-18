# Phase 1.4 — JavaScript consolidation and lifecycle ownership

Asteria TTRPG website overhaul | 18 November 2026

**Implemented scope:** Future standalone React/Vite frontend only. Existing live website and backend are not altered.

## Replacement rather than an overlay

This phase consolidates the **new frontend JavaScript** into explicit and testable owners. It does not run replacement code alongside legacy global controllers in the same document. It does not add a new router framework, backend, Firebase project, or global event bus.

The previous React preview hook installed one hashchange/popstate listener pair per hook instance and stored parsed route objects in component state. The Phase 1.4 implementation replaces that code with one shared browser location source based on useSyncExternalStore and a stable primitive URL snapshot. The hook now parses the shared snapshot without owning browser event handlers. Subscribers share one hashchange/popstate pair, and listeners are removed when the final consumer unmounts; React StrictMode remounts do not leak duplicate handlers.

App-wide document-title changes and focus management are now owned by one useRouteEffects hook, rather than living in the page outlet. The App becomes a small composition of route, capability gate, and one React page outlet.

## Single-owner module map

| Area | New owner | What it replaces in the preview |
|---|---|---|
| Route parsing and deep links | frontend/src/router/siteRoutes.mjs | existing canonical pure parser retained |
| Browser history/location updates | frontend/src/router/locationStore.mjs | per-hook hashchange/popstate subscriptions in useSiteRoute.js |
| Route consumption | frontend/src/router/useSiteRoute.js | hook-local state and direct event wiring |
| Page title, focus, scroll | frontend/src/router/useRouteEffects.js | App.jsx global navigation effect |
| Event and realtime subscription lifetime | frontend/src/runtime/disposableScope.mjs | ad-hoc listeners without a single cleanup owner |
| Feature activation and permission prerequisites | frontend/src/app/featureRegistry.mjs | implicit assumption that any recognised route is enabled |
| Data/backend service boundaries | frontend/src/services/appServices.mjs and AppServices.jsx | implicit global Firebase and cross-feature coupling; **no backend instantiated in preview** |
| React root and page outlet | frontend/src/main.jsx and App.jsx | prior single route/page composition, now fail-closed |
| Styles | existing Phase 1.3 CSS Modules/tokens | **unchanged** |

## Legacy production dependency and retirement map

These are currently live owners that must be retired **only after** later migrations pass feature parity. Phase 1.4 does not delete them or run replacement controllers on top:

| Current production file | Existing responsibilities | Future owner |
|---|---|---|
| js/app.js | static views, setView and gameplay logic | React route components + feature services |
| js/asteria-core-shell.js | Home/Forge click handlers, DOM shell and setView wrapper | React SiteShell, route store and feature pages |
| js/asteria-home-guard.js | Home startup and click capture | one React router; initial Home is stable |
| js/asteria-navigation.js | Compendium/filter/mobile DOM navigation | React Compendium UI + canonical router |
| js/asteria-state.js | global mutable state | feature-scoped state/store with explicit ownership |
| js/asteria-view-hooks.js | per-view navigation refresh hooks | lifecycle-safe React hooks |
| js/firebase-auth.js, js/auth-bridge.js | Firebase auth and identity plumbing | a single authenticated auth adapter |
| src/app/legacyBridge.js | switching React/dashboard back into static views | removed after full site cutover |
| src/firebase/asteriaFirebaseService.js | calls through window.AsteriaFirebase | direct single-app service interface when migrated |
| js/asteria-friend-*.js and js/asteria-account-*.js | global friend/profile/account controllers | migrated Account/Friends React features |
| js/clean-compendium.js, js/universal-compendium-engine.js | Compendium rendering/content selection | migrated content service + components |

The **production** static scripts, legacy CSS, existing dashboards, Firestore/Storage rules, functions and Firebase hosting configuration remain untouched. The new preview has no Firebase client, credentials, personal account records, friend records, campaign data or runtime access. A URL matching GM/Player/account does not grant access.

## App services and feature gates

Domain service keys: auth, compendium, campaigns, characters, friends, notifications and gameplay. A service can only be explicitly injected by an actual migrated feature; there is no fallback to window.AsteriaFirebase and no new Firebase app creation. An unavailable service fails with ServiceUnavailableError, never an unvalidated partial result. The isolated preview deliberately supplies an empty immutable registry.

All known routes have an explicit owner/status in featureRegistry.mjs. **Only Home is active** in the preview. All other routes remain preview-only even if a mock service is provided. Future authenticated feature activation requires a real adapter, working UI and the existing backend security/access checks; flipping a route status must never replace those checks.

## Regression and acceptance

Added scripts/site-js-phase1-4.test.mjs covering listener deduplication, StrictMode-style subscribe/unsubscribe/remount, popstate/hashchange snapshots, disposal on errors, immutable service injection, fail-closed route registry and forbidden legacy imports.

Added scripts/site-js-browser.cjs, testing the Vite preview in Chromium: one net browser listener pair after StrictMode mount and repeated navigation, no global legacy state, no legacy/Firebase network requests, browser back/forward, bookmarked Compendium, protected GM invitation/account placeholders and no credential forms.

The existing Phase 1.2 routing test is updated to assert the actual new central subscriber rather than a removed hook-local event listener implementation. All Phase 1.1–1.3 source/build/visual browser tests remain enabled. The dedicated GitHub CI workflow plus repository-wide build/Firebase tests must pass before merge.

## What Phase 1.4 does NOT do

- It does not delete or rewrite working live website JavaScript. This occurs only with real feature migrations and final cutover.
- It does not declare Account, Compendium, GM/Player dashboards, Forges, social features, notifications or gameplay converted. These remain secure preview placeholders.
- It does not connect an additional Firebase app or modify production data/security rules.
- It does not claim visual parity with production. The next stage includes integrated verification.

## Next: Phase 1.5

Integrated acceptance gate: React/Vite build, JS/CSS ownership, desktop/mobile visual review, accessibility, route/legacy-deep-link consistency, fail-closed service boundaries, current production bundle parity and deployment isolation. No Firebase deployment needed during this isolated phase.
