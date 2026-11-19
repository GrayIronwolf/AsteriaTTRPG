# Phase 10.3 - Responsive, accessible and measured React/Vite release evidence

## Objective and isolation
Verify the isolated React/Vite guest, GM and player experience before any production entry swap. The legacy index.html, CSS/JavaScript, Firebase project, Hosting configuration, Firestore rules, functions and deployment actions remain unchanged. All signed-in test data uses synthetic accounts in demo-asteria Auth/Firestore/Functions/Storage emulators. External browser requests are blocked.

## Automated acceptance
- Capture 16 React role/viewport snapshots at 1440x900, 390x844, 320x740 and 768x1024 (Home, campaign/character Forge and role dashboards), plus two navigation-dialog screenshots.
- Enforce no horizontal overflow, one main landmark, no unnamed visible interactive controls, no unlabelled images, no duplicate IDs, no visibly broken images, 40px or larger header targets, and correct desktop/mobile navigation visibility.
- Exercise skip-to-main, keyboard-only mobile and desktop menu controls, reverse-Tab modal focus trapping, Escape focus return, and reduced-motion styles.
- Run axe-core WCAG 2.1 A/AA scans on guest Home and GM/player dashboards at desktop and mobile sizes; fail on serious or critical violations, and report minor/moderate violations for follow-up.
- Record DOM readiness, fetched resources and JS transfer sizes without private text or user identifiers. Reject DOM readiness over 16,000ms as a coarse CI stability regression, not a real-world performance benchmark. Run existing browser/UI, security and production-build gates.
- Store JSON metrics and screenshots only as short-lived GitHub Actions artifacts (30 days), separate from production data.

## Repeatable commands
- npm run site:cutover-visual-phase10-3:unit
- Build emulator-enabled preview with site:build and site:verify-dist.
- Run npm run site:cutover-visual-phase10-3 under demo-asteria Firebase emulators with ASTERIA_PHASE_10_3_AUDIT=1 and locally installed Playwright/axe-core test-only dependencies.
- npm run site:cutover-visual-phase10-3:report

## Cutover blockers
Phase 10.1 authenticated *legacy production* GM and player images were not available for a safe comparison. This automated audit cannot establish pixel parity with those pages, and does not authorize a production cutover. Phase 10.4 must obtain authorized/redacted legacy evidence, approve entry point and cache safety, and document rollback. Phase 10.5 is the user-controlled Firebase workflow/hosting deployment. No deployment is required after this PR.
