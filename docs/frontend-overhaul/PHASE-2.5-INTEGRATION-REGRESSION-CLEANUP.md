# Phase 2.5 — Integration, regression testing and cleanup

**Asteria TTRPG** · React/Vite site migration · 18 November 2026

## Scope

Integrate Phase 2.1 Header/wordmark, Phase 2.2 mega navigation, Phase 2.3 Home carousel/Forge cards and Phase 2.4 Appearance/account-header boundary into one **isolated** React/Vite acceptance. This phase **does not** replace the live `index.html`, legacy CSS/JS, Firebase services, or GM/Player dashboard.

## Integration fixes

1. The Account mega-menu's **Appearance** card now routes directly to the migrated public `#/appearance` page, instead of sending visitors to an unmigrated `#/account/settings?tab=appearance` placeholder. Account Settings and Security remain protected previews.
2. Account header dropdown shortcuts close their own disclosure when activated, without installing another global event listener or wrapping `setView`.
3. `App` can accept a **presentational**, verified-header identity prop from a future trusted integration, keeping the normal preview entry guest-only. Tests exercise a synthetic identity in an ephemeral local-only fixture; this **does not** authenticate a real user or activate any protected routes.

## Acceptance and evidence

The Phase 2.5 workflow runs existing source, build, lint and browser suites, plus:
- `site:integration-browser`: a single-session Playwright integration of Home → menus → Appearance → Home → Forge/Compendium deep links, theme persistence, browser history, viewport coverage, artwork, reduced-motion behavior, and event-listener ownership.
- An **ephemeral** Playwright fixture, created and destroyed inside the test runner, which checks the verified-header presentation and Home startup without simulating real Auth or enabling Firebase.
- `site:retirement-audit`: machine-readable mapping of legacy files to React owners, direct-use checks against the live HTML, and prohibition on removing or re-enabling disabled template code.
- `site:check`: code and routing contracts, protected-route fail-closed tests, integration wiring, and no accidental legacy overlay.
- Screenshots and JSON metrics in a 30-day GitHub Actions artifact `asteria-phase-2-5-integration-evidence`.

**The authenticated test only verifies a signed-in header rendering contract. It is not a live login, Friends, notifications or gameplay acceptance.** Authenticated functional parity requires a later Firebase-backed or production-safe test setup.

## Cleanup / deferred removal

See `PHASE-2.5-RETIREMENT-LEDGER.json`. The legacy website currently loads the old home guard, competing navigation and account controllers, and the large CSS cascade. These are **retirement candidates, not removable assets yet**. No production files are deleted here. The disabled `asteria-page-template.css` and `asteria-page-template.js` remain disabled; re-enabling them would create another overlay.

Removing any legacy owner requires:
- The replacement feature to be fully implemented, including protected Firebase data and permissions;
- Navigation/visual parity on desktop, tablet and phone for guest, player and GM;
- A verified rollout and rollback process during final Phase 9/10 single-entry cutover.

## Operational boundaries

- The existing Firebase project, deployment workflow, hosting behavior, security rules, and root production bundle are unchanged.
- The new React/Vite preview keeps one router, one event/scroll owner per concern, one token source and CSS Modules rather than additional global CSS layers.
- **User action:** no Firebase deployment is needed after this isolated code merge. Continue with the next full feature migration phase before any production cutover.
