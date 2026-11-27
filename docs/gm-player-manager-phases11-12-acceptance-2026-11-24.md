# GM Dashboard — Priorities 11 & 12 (test-branch acceptance)

**Target:** `Website-Build-Test` (React/Vite only). This milestone replaces the existing Player Manager presentation and roster processing in place; it does **not** add a second administration layer.

## Priority 11 — appearance, responsiveness and canvas entry point

- Existing Player Manager remains the dedicated `Campaign → Player Manager` workspace, reachable through the GM Toolkit and party quick access.
- Search is deferred without delaying text input. Presence is indexed once per live snapshot; membership reconciliation is memoized separately from presentation-only filtering.
- Search, role and status filtering now include an **online presence only** option. Presence never grants GM authority or active membership.
- Bounded 8/12/24-card pagination limits mounted cards for campaigns with large member lists. Summary figures count all verified campaign members; the page indicator distinguishes matching records from all accounts.
- Container-responsive layouts reflow at narrow desktop/tablet/mobile widths and inside canvas-sized containers. Buttons remain keyboard-focusable and touch-accessible; reduced-motion preferences are preserved.
- An optional **Player Manager Quick Access** window is available in the **GM canvas** panel picker. It opens the full Player Manager; it is hidden by default, does not replace or reset existing layouts, and never appears in the player canvas.
- The quick window uses the already subscribed campaign/membership/characters data, makes no independent Firebase subscription and exposes no direct moderation controls.

## Priority 12 — scale, authorization and release verification

- Regression suite: `npm run test:gm-player-phase11-12`, included in `npm test` and the dedicated test-branch React asset workflow.
- Covers owner and active Co-GM rights; incorrect campaign/UID, player-role, suspended/banned/outsider, stale legacy access, unknown membership version; fail-closed unloaded canonical rosters; owner deduplication; character owner/campaign matching; independent online filters; 63-row pagination boundaries; 400-member/1,500-presence record projections; GM-only optional canvas allowlist; and accessibility/release-gate source contracts.
- No production feature flags, Firebase environment variables, Firestore rules or callable implementations are changed.
- Existing build verification includes lint, main regression tests, Firebase/emulator tests, compiled React assets, and source-vs-bundle verification.

### Required live multi-account acceptance (not proven by CI)

Use separate real account sessions, not only unit-test fixtures:

1. Owner, active Co-GM, Co-GM without delegation, normal player, suspended/banned member, and outsider: test visible workspaces plus attempted direct protected callable access.
2. Switch accounts and campaigns in the same browser, including cached/offline snapshots and reconnected sessions. Confirm old membership, invitation tokens and row controls never leak.
3. Confirm owner and Co-GM permission parity with Firebase security rules, and verify denied resource adjustments/XP/character links are not persisted.
4. Exercise UCRS check requests (physical/digital), concurrent or repeated actions, notification delivery and history across two or more signed-in devices.
5. Validate resource/XP concurrency (stale `coreRevision`), inventory privacy and new member approval/moderation with server flags disabled/enabled in an authorized test environment only.
6. Mobile/browser review at 320, 360, 390, 768 and 1280+ CSS pixels, keyboard-only focus, screen reader labels, touch scrolling, browser zoom, 50%-zoom GM canvas and the optional shortcut window.
7. Compare performance with large real rosters and presence churn, including Firestore listener counts and signed-out teardown.

**Release status:** Source staged on test branch. Passing CI does not authorize production feature activation, merging to `main`, or Firebase deployment. Real multi-account acceptance and explicit user release approval remain mandatory.

## Source and compiled bundle verification

The React/Vite compilation workflow writes the tracked `react-dist` artifacts to `Website-Build-Test` and deliberately skips publishing or deploying Firebase. The full GitHub checks must be run again **after** these compiled assets have reached the branch to verify deterministic source/bundle parity. Earlier CI failures on source commits may reflect the known build/commit race and are not accepted as a passing release gate.

On any new code change, repeat the same validation. Do not enable disabled campaign member-management flags on the basis of this source-only verification.
