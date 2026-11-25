# Asteria TTRPG — Milestone 1 Audit Closeout

**Date:** 25 November 2026 (Australia/Perth)  
**Target:** \`GrayIronwolf/AsteriaTTRPG\` — \`Website-Build-Test\` only  
**Scope:** GM and Player Dashboard, shared canvas/window controls, GM campaign player management, second-screen maps, calendar/weather, cross-system integration, automated verification and release prerequisites.  
**Decision:** Milestone 1 is **complete as a source-and-isolated-browser audit**. It is **not** evidence of production-ready campaign feature activation or live multi-account acceptance.

## 1. Tests and actual results

- **Chromium fixture browser suite:** 14 passed, 0 failed on commit \`0386965453fb336555ff399b53aa4152a98df42a\`; GitHub Actions run [45548696966](https://github.com/GrayIronwolf/AsteriaTTRPG/actions/runs/45548696966). [Screenshot/result artifact](https://github.com/GrayIronwolf/AsteriaTTRPG/actions/runs/45548696966/artifacts/14992647687).
- Isolated browser execution used \`?reactFixture=1\`, localhost and a network-interception rule blocking all non-loopback requests. **No real campaign data or production Firebase account was used.**
- Player Main displayed **15** default windows at all six widths tested: **320, 360, 390, 768, 1280, 1920 px**. GM Main displayed **8** default windows at the same widths. Both were stacked at 320–390 px and freeform at 768 px and above; recorded document horizontal overflow was **0 px** in every tested fixture state.
- The suite additionally exercised Home/Handbook, GM and Player menus, inventory navigation, add/remove windows, undo/redo, Combat canvas drag/overlap, lock, focus, zoom, reload persistence, mobile stacking, player resource-card reorder, and legacy Player Manager read-only gates.
- Browser \`pageerror\` events and failed local resource requests: **zero** in each of the 14 scenarios. Console \`ERR_BLOCKED_BY_CLIENT\` messages are expected from deliberate non-local network blocking, not evidence of production Firebase failures.
- The earlier full [Firebase and website checks run 45545142194](https://github.com/GrayIronwolf/AsteriaTTRPG/actions/runs/45545142194) passed on prior application SHA \`af6a84ed268927339c464cec6c94d6d89fa109b4\`. **The final combined branch check after this documentation commit must be separately observed before claiming clean-head CI.**
- Cloud Workload Identity authentication and the **\`asteriaAction\` only** function deployment passed in [run 45546838408](https://github.com/GrayIronwolf/AsteriaTTRPG/actions/runs/45546838408); this did **not** deploy Firestore rules, Storage rules or other functions.

## 2. Issue discovered and fixed within the audit

**Low-zoom keyboard focus (React 18):** The shared GM/Player/Combat canvas correctly changed to low-zoom preview mode visually, but a boolean JSX \`inert\` value was not serialised as the HTML attribute in React 18. Invisible window controls could therefore remain in keyboard navigation. Updated the existing \`src/dashboards/combat/CombatCommandCentre.jsx\` component to emit the explicit empty-string \`inert\` attribute for minimised or adaptive-preview content. The new Chromium scenario verifies that preview controls become inert and return to normal when zoom increases. No duplicate window engine or gameplay code was introduced. Generated \`react-dist\` assets were rebuilt on the test branch.

## 3. Outstanding findings by priority

| Priority | Finding | Follow-on action |
|---|---|---|
| High / Milestone 2 | Eight default GM windows and 15 default Player windows plus long vertical positions create a dense workspace. Some legacy responsive CSS still targets superseded grid selectors. | Refine default sizes and presentation, migrate useful CSS rules to active canvas windows, simplify controls; retain saved layouts and existing React engine. |
| Critical / Milestone 3 | Campaign-v2 roster, invitation, moderation, role and character-link actions exist in source but remain behind disabled release flags. | Verify production prerequisites and controlled campaign membership activation; never enable flags or migrate live memberships merely for green tests. |
| High / Milestone 5 | The second screen can select characters for its Party scene, but battle-map tokens have no independent GM-controlled player visibility setting. | Add secure character/token visibility separate from membership and apply filtering to server-authorised public projections. |
| High / Milestone 5 | Existing map viewers, image/video media, authenticated Storage, display scenes, blackout and map projections are present. | Check actual browser media upload/playback, production CORS, current live rules, revocation and reconnect. |
| Medium / Milestone 6 | Calendar and weather integrate with dashboards, Atlas and display; time advancement deliberately does not award resource recovery or modify combat/gameplay. | Retain one authoritative clock; any automatic gameplay effects require separately reviewed server-side transactions. |
| High / Milestone 7 | Realtime campaign hooks and permissioned functions exist; cross-system security paths are covered by code/emulator tests but are not proved live by fixture browsing. | Validate GM invitation → player approval → character link → combat/map → projector, account isolation and weather across real devices. |

## 4. Explicit limits and release gates

**Not performed or proved:** Signed-in owner/Co-GM/player/outsider/suspended-account end-to-end UI acceptance against live Firebase; actual multi-device listener and revocation verification; production Storage bucket CORS; live Firestore/Storage Rules parity; backup-restoration evidence; controlled per-campaign v2 migration; or production feature activation. These require authorised real accounts and production read-only verification through existing trusted workflows. No anonymous/public-page rendering should be presented as those checks.

**Safe milestone exit:** The audit, issue register, fixture browser evidence and recommended remediation order are complete. Begin **Milestone 2 — Panels, Windows & Canvas Improvements** on \`Website-Build-Test\` while preserving production release gates; treat live multi-account and cloud-readiness requirements as explicit blockers for activating dependent features.

## 5. Source of truth

For the detailed component inventory and reasoning, refer to [existing baseline audit](WEBSITE-BUILD-TEST-BASELINE-AUDIT-2026-11-22.md), [GM Player Manager acceptance](../gm-player-manager-phases11-12-acceptance-2026-11-24.md), [calendar/weather milestone 4](../calendar-weather-milestone-4-2026-11-24.md), [campaign release policy](../ASTERIA-CAMPAIGN-FRIENDS-RELEASE-SOURCE-OF-TRUTH.md), and the browser suite \`scripts/phase1-2-browser-audit.cjs\`.
