# Phase 9.1 — Remove obsolete CSS and conflicting overrides

## Planned replacement, not a new CSS layer
This phase is **before** the Phase 10 production React/Vite cutover. The actual live site continues to use `index.html` plus its original JavaScript, CSS and old React dashboard bootstrap. The isolated replacement uses `frontend/index.html`, three shared global files (`tokens.css`, `reset.css`, `typography.css`), and feature-scoped `.module.css` imports. **No extra global sheet, stylesheet shim, or broad override is introduced.**

## Dependency audit
- `css/styles.css` (approximately 294 KB) and 34 other CSS files are referenced by the current legacy entry, including the game dashboards, account and friends, Compendium, mobile navigation, inventory and campaign maps. They are **active and cannot be removed from the still-live HTML** without its replacement. Phase 10 is responsible for the controlled entry switch, after parity and rollback tests.
- The old large CSS cascade contains many `!important` overrides, especially the monolithic global sheet, navigation, menus and mobile header. These do not enter the replacement React bundle. Removing them from the old entry prior to cutover would reintroduce navigation/header styling regressions.
- `css/asteria-page-template.css` had no active HTML link or CSS import. Its universal page template was explicitly disabled after startup/navigation regressions. It is retired here. The dormant JavaScript template is deferred to Phase 9.2; existing tests still cover its fallback behavior.
- `css/asteria-header-wordmark.css` contained an earlier conflicting `background:#192838!important` for the header, now overridden by subsequent approved header/background rules. That obsolete colour declaration has been removed **in its existing owner**, retaining logo dimensions and all active header navigation behavior.

## Phase 9.1 changes
1. Delete the unused `css/asteria-page-template.css`, rather than putting another CSS system on top.
2. Remove the outdated wordmark header background override while retaining the approved AAA header and final solid navy surface rules.
3. Update the Phase 2.5 retirement ledger with **one explicitly retired file**, rather than weakening protections for any actively loaded asset.
4. Update the source and retirement audit tests to distinguish the removed dormant CSS from the existing disabled JavaScript template.
5. Add a strict Phase 9.1 regression to guard against missing or duplicate live CSS URLs, reintroduction of universal template CSS, legacy imports into React, and illegal `!important` or `@import` in new React CSS.
6. Add a dedicated GitHub workflow running the focused legacy stylesheet/template checks, full React site regressions, lint, isolated Vite build and output verification.

## Release constraint
**Do not run the Firebase deployment workflow.** No existing website entry or Firebase configuration is changed. Legacy styles are removed in bulk only as part of the separate approved Phase 10 cutover, with corresponding retired controllers/templates handled in Phases 9.2–9.4.

## Remaining Phase 9
- **9.2:** Remove redundant legacy controllers, duplicate routing and event listeners from the code branch without disrupting the current deployed site.
- **9.3:** Retire old HTML templates, compatibility bridges and compiled assets after verified route parity.
- **9.4:** Full dependency/import/route/style/script audit to ensure single-owner frontend architecture.
