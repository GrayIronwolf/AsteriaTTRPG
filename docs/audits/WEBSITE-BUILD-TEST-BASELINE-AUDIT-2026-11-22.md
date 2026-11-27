# Asteria TTRPG — Website Baseline Audit (Phase 1)

**Scope:** `Website-Build-Test`, initially restored to merged PR #280.
**Audit date:** 22 November 2026 (Australia/Perth; repository evidence checked from GitHub).
**Baseline source commit:** `e3eff761f3113263c2e4da3dee30ba9acb656dbb`.
**Protected reference branches:** `main`, `Asteria-W-Recovery`.
**Status:** Repository inventory and historical CI evidence reviewed. Independent running-browser acceptance is **not yet complete**.
**Change policy:** This report and one CI trigger adjustment are committed **only** to `Website-Build-Test`; do not merge the audit branch into protected production/recovery automatically.

## 1. Source-of-truth baseline

- The test branch, `main`, and `Asteria-W-Recovery` matched commit `e3eff761f3113263c2e4da3dee30ba9acb656dbb` at audit start; compare with recovery was `identical`, ahead/behind both zero.
- This is the user-verified pre-standalone-React/Vite original website. The original already includes embedded React dashboards. Do **not** treat this as a pure HTML/JavaScript site or as the later standalone frontend.
- Existing successful baseline CI: https://github.com/GrayIronwolf/AsteriaTTRPG/actions/runs/44929331945 ; baseline Pages deploy: https://github.com/GrayIronwolf/AsteriaTTRPG/actions/runs/44930652559 .
- Source tree from GitHub: 2,373 tracked files, 981 tracked directories; untruncated inventory of 3,354 tree entries.
- HTML entry point: `index.html`. Its 82 directly referenced JS/CSS assets (after stripping query version strings) all have paths in Git. **This establishes reference presence, not successful browser loading.**
- Original website and content: `index.html`, `css/` (35 files), `js/` (46 files including two local vendor files), `content/` (936 files).
- Existing embedded React: `src/` (189 files including image assets) and generated `react-dist/` (423 files). `vite.config.mjs` explicitly builds the React bundle to `react-dist` for use by the legacy page.
- Firebase: `js/firebase-auth.js` bridges Firebase Auth/Firestore/Storage/Functions; `functions/`, `firestore.rules`, `storage.rules`, `firestore.indexes.json` are present. Existing React modules use `src/firebase/asteriaFirebaseService.js` and existing app bridge; verify authentication, permission and write paths before changing anything.

## 2. Existing UI, systems and regression inventory

**Public shell and pages**: Home carousel, Asteria Compendium/workspace, login and account screens, Character Forge, campaign management, and old shell views are in `index.html`. HTML-defined views do not by themselves prove navigation or actions work.

**Player React dashboard:** `src/dashboards/CharacterDashboard.jsx` registers 21 tabs: Dashboard; Character; Class/Talent Tree; Skills; Spells; Inventory; Crafting; Quests; News / Events / History; Journal; Party; Gallery; Battle Maps; Advanced Dice; Calendar; Weather; World Map; Campaign Library; Campaign Audio; Recording & Archives; Dashboard Settings. Campaign-only tabs are intentionally conditional for unlinked characters.

**GM React dashboard:** `src/dashboards/GMDashboard.jsx` registers 24 tabs: GM Main; GM Toolkit; NPC & Creature Library; Dashboard Settings; PC Inventory; News & Events; Quests; GM Notes; Session Library; Soundboard & Ambience; Session Recordings; Player Display; Economy; Crafting; GM Tools; Gameplay Systems; World Systems; Battle Maps; Advanced Dice; Random Tables; Encounter Generator; Asteria Calendar; Weather Generator; World Atlas.

**Dashboard layout panel registry:** `src/state/dashboardLayoutModel.mjs` declares 24 player panel types and 20 GM panel types. `src/components/DashboardCustomisation.jsx` and `src/state/dashboardGridModel.mjs` implement a 12-column editor with selection, drag/resize geometry, keyboard proposals, lock, background choices, save/reset and viewport-specific layouts. **The actual user experience must be verified in browser**.

**Gameplay and Firebase code present:** `src/dashboards/CombatPanel.jsx`, `src/state/combatRules.mjs`, `functions/combatCommands.mjs`; `src/dashboards/UniversalCheckWorkspace.jsx`, `functions/universalCheckCommands.mjs`; inventory, equipment, marketplace, rewards, crafting, quests, talents/spells, NPCs, player presentation, maps and campaign utilities. Presence means **implemented source exists**, not complete behavioural acceptance.

**Available automated regression entry points:** `npm run test:dashboard`, `test:combat`, `test:ui`, `test:navigation`, `test:ownership`, `test:compendium`, `test:firebase`, `test:smoke` and `npm run build`. `scripts/test-startup-browser.cjs` offers an optional Playwright smoke test, requiring Playwright/Chromium installation.

## 3. Automated verification and changes made

- The full `Firebase and website checks` workflow passed on the same PR #280 source SHA (21 November 2026). It runs Node 22, npm CI, audit/release/content checks, lint, comprehensive unit tests, Firebase emulators, build and committed bundle consistency tests.
- The workflow originally ran on **push to `main` only**, although it ran on pull requests generally. This left `Website-Build-Test` without automatic checks on direct pushes.
- **Audit-only CI fix on the test branch:** Changed `.github/workflows/firebase-checks.yml` push branch filter from `[main]` to `[main, Website-Build-Test]`. No test logic, production workflow, Firebase config or protected branch changed.
- This report is documentation-only. Verify the fresh test-branch GitHub Actions run completes before claiming this new trigger is fully validated.
- GitHub's baseline CI output contains Firebase emulator `PERMISSION_DENIED` messages in negative-access test logs while the overall job passed; they must not be interpreted as live-production access failures without a failing test case.

## 4. Gaps and risks discovered

| Priority | Finding | Consequence / acceptance requirement |
|---|---|---|
| High | Test-branch push verification was not enabled in baseline workflow (now adjusted only on test branch). | Confirm the new run succeeds; if it fails, fix the test branch only. |
| High | A source and passing CI do not demonstrate visual fidelity, mobile usability, actual account sessions or an interactive end-to-end game. | Perform controlled live browser checks before any new feature rollout. |
| High | Temporarily switching GitHub Pages to `Website-Build-Test` changes the public-facing website, not a private staging URL. | Only do so with owner agreement and a tested rollback back to `main`. |
| High | Client code contains production Firebase settings; Pages branch switching does not create an isolated Firebase backend. | Use disposable test accounts/records and avoid testing destructive actions on real players; prefer an emulator or true sandbox for destructive flows. |
| Medium | Numerous legacy CSS and JavaScript files coexist with React UI and generated bundles; direct asset references are present but compatibility remains browser-dependent. | Preserve the known-good look; run visual screenshot comparisons at desktop/tablet/mobile and interaction tests. |
| Medium | The historical main commit includes 34 workflow YAML files; several reference now-removed feature branches. | Audit legacy workflow triggers before deploying or modifying release infrastructure. |
| Medium | Repository includes 423 generated React assets and old test/log/image artifacts. | Inventory redundant build outputs without deleting anything during the baseline phase. |
| Medium | Browser test is opt-in, and cannot be inferred from the green core CI run. | Run Chromium-based smoke/visual checks when an appropriate runner is configured. |

## 5. Required interactive acceptance checklist (not yet executed)

- [ ] Home: logo, colour-changing crystal, header controls, image carousel, signed-in landing page, mobile navigation
- [ ] Compendium: dropdown navigation, categories, search, detail content, artwork, browser back/forward
- [ ] Account: sign-up/sign-in/out, profile and username, friend requests, notifications, access-control boundaries
- [ ] Character Forge: create, save, reload, edit, ownership isolation, link to campaign, character portrait
- [ ] Campaign Forge: create/edit campaign, GM access, player invitations, joins/approvals
- [ ] Player Dashboard: all applicable tabs (21 registered), HP/SP/MP, talents, skills, spells, inventory, quests, journal, notifications, dice
- [ ] GM Dashboard: all applicable tabs (24 registered), encounter setup, combat start/end, NPCs, checks, loot/XP, maps, player access
- [ ] Dashboard visual editor: actual panels render; rearrange/resize/lock/save/reload/reset independently on desktop/mobile
- [ ] Combat: initiative, turn order, action points, timer, physical/digital dice, damage/healing and persistence across reload
- [ ] Inventory and transactions: equipment, character storage, trades, rewards, privacy, proper revision and double-spend handling
- [ ] Performance and reliability: first load, no fatal console errors, responsive controls, network recovery and disabled-state UX
- [ ] Restore GitHub Pages to `main` following any temporary preview and verify the latest deployment completed

Each item should collect evidence: URL/branch SHA, device/viewport, action, expected result, actual result and screenshot or test log. No unsupported claims of end-to-end or manual browser verification should be made.

## 6. Phase 1 exit criteria

1. `Website-Build-Test` runs full baseline CI successfully on push.
2. Critical flows in Section 5 are manually or automatically verified against this exact branch.
3. Known UI visual reference screenshots are captured for regression testing.
4. Open issues are prioritized; no unresolved critical failures before starting feature waves.
5. Owner reviews this audit and approves subsequent work. No deployment/merge into `main` or backup update occurs without owner approval.

**Next stage:** Verify new CI outcome; then conduct the interactive acceptance pass and screenshot baseline. Only after approval should archived feature improvements be ported one by one.
