# Asteria React/Vite dashboard parity gap

## Release status

**NOT READY FOR MERGE OR LIVE DEPLOYMENT.** PR #333 passed the existing integration gates but did not preserve visual and feature parity with the original dashboard. This is a migration parity defect, not a design change. The original implementations remain in `src/dashboards/`. Do not mount the legacy global runtime into the new React/Vite app or overwrite saved layouts.

## Authoritative original implementations

- Player: `src/dashboards/CharacterDashboard.jsx`, `PlayerDashboardOverview.jsx`, `CharacterWorkspaceTabs.jsx` and `src/components/DashboardInformation.jsx`.
- GM: `src/dashboards/GMDashboard.jsx`, `GMWorkspacePanels.jsx`, `DashboardCustomisation.jsx`.
- Original frame rendering: `css/asteria-freeform-dashboard.css`, `asteria-dashboard-panel-images.css`, `asteria-panel-headers.css`; exact approved assets in `assets/ui/dashboard/`.
- New React route owners: `frontend/src/pages/PlayerDashboardPage.jsx`, `GMDashboardPage.jsx`, `frontend/src/layout/DashboardLayoutWorkspace.jsx`.

## Identified defects and remediation

| Defect in deployed React | Root cause | Required result |
| --- | --- | --- |
| All HP/SP/MP bars appear green | Native progress element and inherited browser appearance | Custom accessible meters: HP pink, SP green, MP cyan, with individual max/current values and adjustable controls after backend port |
| Rectangle around crystal tabs | Old dashboard `.tabs button` panel surface overrides shared CrystalButton image | No background, rectangle border or box shadow on tab wrapper; crystal artwork is the only visible frame |
| Incorrect dashboard panel proportions | New grid used auto-height rows instead of the original square 12-column geometry | Source grid tracks use square cell ratio; all saved placements and panel sizes remain authoritative |
| Frame corners/textures are stretched | Image overlay scales whole bitmap to 100% in each dimension | Render original frame WebPs with the matching square/wide/ultrawide/tall family and sliced border; backdrop stays underneath |
| Missing Player and GM navigation | Replacement React routes use abbreviated tab arrays | Reproduce all original tabs, permissions, and actual connected content, without fake successful UI |
| Missing or inert panels | React `renderPanel` substitutes static lists, null or placeholder text | Port each live original gameplay panel with secured, existing services; no duplicate Firebase client |
| Original GM tools absent | `GMDashboardPage` exposes only the simplified subset | Port the GM toolkit, NPC library, trade/inventory, quests, notes, maps, advanced dice, time/weather, announcements, recording and presentation |

## Original Player tabs (21)

Dashboard; Character; Class/Talent Tree; Skills; Spells; Inventory; Crafting; Quests; News / Events / History; Journal; Party; Gallery; Battle Maps; Advanced Dice; Calendar; Weather; World Map; Campaign Library; Campaign Audio; Recording & Archives; Dashboard Settings.

## Original GM tabs (24)

GM Main; GM Toolkit; NPC & Creature Library; Dashboard Settings; PC Inventory; News & Events; Quests; GM Notes; Session Library; Soundboard & Ambience; Session Recordings; Player Display; Economy; Crafting; GM Tools; Gameplay Systems; World Systems; Battle Maps; Advanced Dice; Random Tables; Encounter Generator; Asteria Calendar; Weather Generator; World Atlas.

## Parity requirements before release

1. Produce comparable **real browser screenshots** for authenticated Player and GM at matching widths against original reference screenshots (do not pass based solely on string assertions).
2. Reconnect original equipment slots and icons, spells/talents/skills, condition management, effects, damage and rest panels; eliminate all 'later gameplay migration' placeholder bodies.
3. Preserve existing saved dashboard arrangement, sizing, images, panel backgrounds, resize/snap/lock controls and GM visibility settings, with no migrations that discard user settings.
4. Verify all original Player and GM navigation destinations provide equivalent functionality, subject to original permissions; any unported destination is a **release blocker** rather than a silently removed option.
5. Test genuine health/stamina/mana colours and server-backed resource adjustment, active session, physical/digital dice, notifications, access controls, campaign events, GM control panels and mobile layout.
6. Require successful build, lint, browser tests, security tests and visual comparison; do not merge or deploy while missing parity remains.

## Phase 3.6 — release verification (20 November 2026)

- PR #334 implements Player and GM React/Vite dashboard restoration waves 1.1–3.5. On previous head `76bb4a43e5e17dc58840eb2ed11a42c9888df6df`, **31/31 GitHub Actions workflows passed**. That is not verification on later commits or evidence of full old-vs-new parity.
- Phase 3.6 audit found a legacy migration placeholder and empty Player views when authenticated campaign services were unavailable. The React route now renders explicit no-campaign/unavailable states, prevents unassigned characters from entering campaign map/atlas APIs, and keeps original tab order. A two-account browser regression covers these states.
- The screenshot gate `scripts/site-dashboard-approved-screenshot-parity.cjs` now requires **Player, GM and GM read-only** genuine approved reference images at both desktop and mobile widths. It checks authenticated routes and compares actual screenshot pixels; synthetic references made from the new React UI are not permitted.
- **Remaining release blocker:** no approved legacy screenshot manifest and matched pre-migration PNGs have been verified in this PR, and no successful approved original-versus-React pixel comparison on this final branch exists yet. Existing source, emulator and current-rendered-style checks do not replace this evidence.
- **Release decision: BLOCKED.** PR #334 remains draft, unmerged and undeployed until authenticated cross-role old-vs-new screenshot parity and final feature audit pass on the final head. The user alone triggers deployment after merge.
