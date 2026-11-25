# Milestone 2.2 — Canvas Interaction Performance

PR #387 targets `Website-Build-Test` from `milestone-2-2-canvas-performance`.

## Corrections

Actions run #2340 (45644460489) failed at **Verify committed website bundle matches source**. The build itself, lint, application tests and Firebase checks had passed. The PR changed the shared canvas JSX and CSS without committing the resulting React/Vite assets.

The shared GM, Player and Combat canvas now:

- Coalesces pointer proposals, alignment calculation and geometry painting into one animation frame.
- Updates the two persistent alignment guide elements directly, avoiding React renders while moving windows.
- Finds the nearest alignment candidate in one pass instead of collecting and sorting candidates; existing snap thresholds and stable tie choices are preserved.
- Uses a smaller drag shadow and hides inactive guides.
- Cancels queued work, clears guides and restores geometry when pointer capture is lost or the gesture is cancelled.
- Flushes final release coordinates and commits one layout/history change per completed drag.

Generated entry, stylesheet and referenced chunks were rebuilt. Existing committed chunks remain available for cached clients under the existing Vite configuration. An immediate second build produced no differences in `react-dist` or generated compendium files.

## Automated verification

| Check | Result |
| --- | --- |
| `npm ci` | Passed |
| `npm run build` and repeated build comparison | Passed, reproducible bundle |
| `npm run lint` | Passed |
| `npm test` | 1,560 tests passed |
| `npm run test:firebase` | 300 tests passed |
| Additional Milestone 2/2.1, combat replacement, GM foundations and data-sync regressions | 52 tests passed |
| XP realtime sync regression | Passed |
| Production dependency audit | Passed at configured moderate threshold; one existing low-severity advisory |
| Release source, coordinated campaign and content checks | Passed; 891 canonical content entries |
| Source whitespace check (excluding generated vendor shader strings) | Passed |

The seven runtime regressions in `scripts/milestone2-2-canvas-performance.test.mjs` execute the actual JSX handlers with a controlled animation-frame queue and host nodes. They cover all three canvas roles, 120-event bursts, zero React commits during movement, one save at release, final-coordinate flushing, undo, resize, cancellation, lost pointer capture, guide positioning and magnetic snapping. A broad comparison against the previous alignment algorithm verifies edge/centre/tie behaviour at all three snap strengths. These tests run through `npm run test:dashboard` and `npm test` in CI.

The local Firebase CLI's HTTP proxy setting incorrectly sent its Storage-to-Firestore emulator lookups through the external proxy despite `NO_PROXY`. Running the same demo-project emulator suite with the four HTTP proxy variables unset resolved the local failures. No Firebase application code, rules or assertions were relaxed.

## Browser verification

Tested the rebuilt bundle in Chromium 158 at 1440 × 1000 with loopback-only `?reactFixture=1` accounts and the default 50% canvas zoom. External requests were blocked; no production account or backend was used.

| Canvas | Pointer events per burst | Geometry paints per burst | Event dispatch time |
| --- | ---: | ---: | ---: |
| GM | 120 | 1 | 5.6 ms |
| Player | 120 | 1 | 7.0 ms |
| Combat | 120 | 1 | 3.4 ms |

All three passed visible drag displacement, final release-coordinate accuracy, transform cleanup, guide cleanup, undo restoration, middle-button panning and wheel zoom. No browser runtime errors occurred. These are synthetic headless event-dispatch measurements, not an end-user frame-rate guarantee.

No live deployment, production data change, recovery/archive branch change or merge into `main` is part of this milestone.

## Post-merge browser audit correction

The additional test-branch-only browser baseline exposed stale expectations from before the combined Armour/Weapons window, current optional Combat tools and interactive low-zoom content. Its older assertions expected 15 legacy Player windows, 14 initially mounted Combat windows and inert low-zoom controls. The current migrated fixture correctly contains 14 Player windows (including the combined equipment window); Combat opens eight approved windows and exposes optional tools through its library.

The existing audit now asserts the exact expected window IDs, exercises opening/hiding/restoring the optional Encounter Setup window, measures unscaled window bounds, grabs the actual centre of scaled title bars and checks that low-zoom content remains interactive. All 14 browser scenarios pass locally, including 320/360/390/768/1280/1920px viewport matrices and persistent overlap geometry. The same browser workflow now also runs on relevant PRs targeting `Website-Build-Test`, before merge.

This correction changes only verification code, its workflow trigger and this evidence document. It does not change application defaults or layout behaviour. The repository's separately triggered GitHub Pages deployment returned HTTP 500; no deployment retry was requested because live deployment is outside this task.
