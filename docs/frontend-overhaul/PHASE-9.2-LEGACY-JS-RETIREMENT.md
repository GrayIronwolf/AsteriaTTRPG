# Phase 9.2 — Retire redundant JavaScript controllers and duplicate routing

## Scope
This phase retires JavaScript used only by the disabled universal page template, completes shared ownership of the React route/secure-invitation lifecycle, and adds explicit protections against duplicate event handlers. **The legacy `index.html` and every currently loaded JavaScript controller remain intact until the approved Phase 10 cutover.** This avoids repeating the previous production homepage/navigation regression.

## Audit findings
- The deployed legacy HTML loads 47 distinct script URLs; `js/app.js`, `js/asteria-core-shell.js`, `js/asteria-home-guard.js`, `js/asteria-navigation.js`, `js/asteria-menu-buttons.js` remain active, sometimes sharing routing responsibilities. Removing them before switching the HTML entry would break the current website.
- The already-disabled `js/asteria-page-template.js` has **no script tag in either entry**. It creates its own DOM tab/listener behavior and references a stylesheet removed in Phase 9.1. React `PageLayout` and page components supersede it.
- The new React entry and `locationStore.mjs` each contained their own implementation of secure invitation URL sanitization. While they were not two simultaneously mounted event-listener systems, they were duplicate controller logic.
- The migrated React site already uses a **single** shared `locationStore` with one `hashchange` and one `popstate` listener irrespective of how many React consumers subscribe.

## Implemented replacement
1. Remove the dormant `js/asteria-page-template.js` altogether. Preserve its legacy account page controller and test the actual React page layout instead of running the deleted template as a fixture.
2. Provide a single pure `sanitizeIncomingLocation` function from the existing `locationStore.mjs`. React calls this **synchronously before mount/Auth** to remove incoming bearer tokens from URL history and invokes the same sanitizer when browser location changes. No second route/controller function is invented.
3. Preserve hash bookmark routing, direct-to-Home behavior, secure invitations, and unknown-route handling without adding a new router or external dependency.
4. Extend the Phase 2.5 retirement ledger and audit with both retired dormant files (CSS in 9.1; JS in 9.2); don't weaken original live-script safeguards.
5. Add `scripts/site-legacy-js-phase9-2.test.mjs` covering signed-out guest behavior, secure token redaction, repeated event handling, StrictMode-style listener cleanup/remount, script URL uniqueness and existence, and the prohibition on legacy-global route controllers in React.
6. Include Phase 9.2 in `site:check`; run complete existing site/regression checks, disabled template check, Phase 9.1 checks, lint, guest build, asset parity and real browser smoke tests in CI.

## Release boundary
No current production website HTML/CSS/JS script tag is changed; no Firebase settings, Firestore rules, backend or feature flags change. **Do not run the Firebase deployment workflow.**

## Remaining
9.3 handles obsolete HTML templates, compatibility bridges and stale compiled assets. 9.4 verifies the final import/route/style/script dependency graph. Phase 10 is the separately approved full cutover.
