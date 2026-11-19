# Phase 9.3 — HTML templates, compatibility bridges and compiled assets

## Repository audit: retire only proven unused artifacts

The repository has **four HTML documents**: `index.html` (production legacy entry), `frontend/index.html` (new isolated React/Vite entry), `scripts/fixtures/talent-preview.html` (browser test fixture) and `tools/weapon-crafting.html` (standalone reference). Each remains needed for its intended workflow, so **none is deleted before Phase 10**.

The legacy React bridge `src/app/legacyBridge.js` is still imported by the original React application and has owner-scoped compatibility functions; `js/auth-bridge.js` is still used by production. The new appearance compatibility module `frontend/src/auth/accountAppearanceBridge.mjs` maps current account preference schemas without relying on a legacy browser singleton. None can be safely removed without first completing cutover or changing persisted data. There is no new bridge.

## Stale compiled asset audit

The tracked legacy `react-dist` tree contains **424 entries** and approximately **73 MB** of historical React output. Existing `src/dev-entry.js` imports `react-dist/asteria-react-content-v2.js`, and stable chunks import and preload other versioned files. `vite.config.mjs` intentionally uses `emptyOutDir:false` so earlier browser sessions can resolve cached imports. **All executable JS, CSS and image files remain intact**, including the older `content-v1` bundle and hashed chunks, until the rollback/cache plan is approved during Phase 10.

Four historical source maps are development/debug artifacts, not executable runtime dependencies:
- `react-dist/asteria-react.js.map`
- `react-dist/asteria-react-GMDashboard.js.map`
- `react-dist/asteria-react-CharacterDashboard.js.map`
- `react-dist/asteria-react-questRewardModel.js.map`

These are retired in 9.3. Three compiled JS files contained `sourceMappingURL` comments pointing at the retired maps; only those comments were removed. No executable compiled statements were changed. The original React bundle entries and CSS are preserved.

## Acceptance and protections

- All four original HTML files and both website entry points are verified present and remain distinct.
- All active compatibility bridges remain available, including legacy dashboard and account flows.
- All six stable compiled JavaScript bundle names and the legacy CSS asset remain present.
- A regression test verifies the known static/preload dependencies of stable entry bundles resolve within `react-dist`.
- A regression test rejects reintroduction of the four obsolete development source maps or broken source-map comments.
- The new Vite build remains independently compiled into ignored `frontend-dist`; it does not overwrite `react-dist`.
- Phase 9.1/9.2 retirement tests, complete `site:check`, lint, build and GitHub integration checks must pass.

## Deliberate deferrals

- **Production entry HTML**, old dynamic HTML view markup and active legacy compatibility scripts: retain until Phase 10 cutover and rollback acceptance.
- **Hashed executable chunks, CSS and images**: retain while clients can hold cached module URLs.
- **Bulk legacy artifact deletion**: do not attempt it before the Phase 9.4 import/routing audit and final Phase 10 deployment strategy.

No Firebase deployment, runtime configuration changes or backend migration is part of this phase.
