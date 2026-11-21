# Asteria dashboard restoration baselines

The original reference is [`cc4e78680c7482f9e105d655c50a7cc30a339d62`](https://github.com/GrayIronwolf/AsteriaTTRPG/tree/cc4e78680c7482f9e105d655c50a7cc30a339d62). Phase 1 audited [`20c4bac7511496d259600d7321c301217e30c276`](https://github.com/GrayIronwolf/AsteriaTTRPG/tree/20c4bac7511496d259600d7321c301217e30c276), which is the base of Phase 2. The Phase 1 audit remains the feature inventory and restoration plan. The trackable Compendium oracle is [the repository's 891-entry fixture](../../scripts/fixtures/site-restoration-compendium-routes.tsv).

## Reproduce the comparison

Use a checkout with the original Git object, Node 22, Java 21, the locked npm dependencies and Playwright 1.57 with Chromium. Linux captures use the installed Chromium and fonts. Record the browser build and OS font set when reviewing a visual change. The tool uses loopback ports 8129 and 4174 and the repository's disposable Auth, Firestore, Functions and Storage emulators at 9099, 8080, 5001 and 9199. Start with a fresh `demo-asteria` emulator instance. The repo's Firebase CLI configuration loads the checked-in rules and Functions. [Browser settings](../../scripts/site-restoration-browser-settings.cjs) · [Capture runner](../../scripts/site-restoration-dashboard-browser.cjs) · [Seed](../../scripts/fixtures/restoration-dashboard.cjs)

```sh
git cat-file -e cc4e78680c7482f9e105d655c50a7cc30a339d62^{commit}
npm ci
npm install --no-save --package-lock=false playwright@1.57.0
npx playwright install chromium

npm run site:check
npm run site:restoration-build -- combined
ASTERIA_RESTORATION_OUTPUT=/tmp/asteria-dashboard-evidence \
  npx firebase emulators:exec --project demo-asteria --only auth,firestore,functions,storage \
  'npm run site:restoration-dashboard-browser && npm run site:cutover-security-phase10-2'
```

The runner serves an archive of the pinned original tree using its static server and original compiled dashboard. It copies the corrected loopback-only `src/devFixtures.js` into the temporary archive. The browser waits for the original launcher on Home before opening the GM or character dashboard through its original API. The original Home guard handles cold hashes before fixture initialization. Original dashboard navigation, components, CSS, and bundled artwork all come from the archive. The current site loads the combined React/Vite build. The React fixture uses loopback portrait URLs on the archive server to give both apps the same source artwork. Browser traffic stays on the two site origins and the required emulator origins. Remote fonts blocked by the runner use browser fallbacks. The JSON metrics include computed typography and the report records blocked hosts. [Original launcher](https://github.com/GrayIronwolf/AsteriaTTRPG/blob/cc4e7868/src/main.jsx) · [Original fixture](../../src/devFixtures.js) · [Metric capture](../../scripts/site-restoration-dashboard-capture.cjs)

The original fixture supplies the synthetic campaign, Kael and Lyra, active session, portraits, resource pairs, equipment, skills and journal. The React seed projects the same inputs to the current document shapes. Campaign v1 uses shared and private character IDs that match. V2 uses a distinct linked source ID, an active membership document and the owner’s source-to-link map. The GM read-only character case uses an authenticated GM account viewing Kael. A separate outsider exercises denied routes. The original and React browsers use fixed time, en-US, UTC, reduced motion and DPR 1. Viewports are 1440 × 900 and 390 × 844 CSS pixels.

`dashboard-baselines.json` records the original revision, fixture blob, React checkout revision and served Vite manifest hash, browser version, both sets of tabs, per-role network observations, panel IDs and interaction outcomes. The six original and six React dashboard captures are full page. Editors and representative workspaces have paired captures. The associated JSON files give document and panel geometry, live resource values, fill gradients, navigation affordances, typography, button symbols, border styles, frame layers and image load status. Panel geometry uses page coordinates. Original default-mode panels identified by heading or region label may have no configurable panel ID in their default markup. The editor canvas and panel registry provide the matching IDs. Editor captures show the original modal viewport and the React inline editor.

## Screenshot provenance and approval

The earlier strict reference set contained zero approved originals. The public PR, workflow run and job artifacts were checked and did not contain that set. Historical tracked Player images have incomplete role coverage and no approval provenance. [Owner review on PR #334](https://github.com/GrayIronwolf/AsteriaTTRPG/pull/334#issuecomment-7035853787) · [Historical comparison job](https://github.com/GrayIronwolf/AsteriaTTRPG/actions/runs/44707995164/job/136192277693)

The new `candidate-references.json` contains the six pinned original screenshots, their viewport dimensions and their SHA-256 hashes. The preflight checks each PNG and leaves the status blocked until the owner explicitly approves the references. Approval confirms which file and hash belong to each role and viewport. Pixel/geometry comparison is a separate gate. The repository command uses the specified screenshot dimensions and the existing threshold.

```sh
ASTERIA_PARITY_CASES=/tmp/asteria-dashboard-evidence/candidate-references.json \
  npm run site:dashboard-reference-audit -- --require-ready
```

After the owner approves the references, rerun the capture with `ASTERIA_RESTORATION_APPROVED_CASES` pointing to the approved manifest and a fresh `ASTERIA_RESTORATION_OUTPUT` directory. That path runs the strict comparison against the seeded preview using temporary per-role emulator sessions. The standalone comparison also accepts `ASTERIA_PARITY_AUTH_DIR` with separate `player.json`, `gm.json`, and `readonly.json` states. The optional `ASTERIA_RESTORATION_AUTH_DIR` exports them to a private directory outside screenshot artifacts. Existing single-session callers can still use `ASTERIA_PARITY_AUTH_STATE`. [Approved screenshot comparison](../../scripts/site-dashboard-approved-screenshot-parity.cjs) · [Preflight](../../scripts/site-dashboard-reference-preflight.cjs)

## Dashboard functionality inventory

The tables record observed and source-verified behavior at the Phase 2 baseline. Browser navigation tests exercise tab selection at both viewport sizes, original and React editor tests check all 44 library controls, and captures and emulator flows cover representative actions. A reachable tab can have incomplete actions. Detailed Phase 1 findings still apply. [Original Player tab mounts](https://github.com/GrayIronwolf/AsteriaTTRPG/blob/cc4e7868/src/dashboards/CharacterDashboard.jsx) · [React Player](../../frontend/src/pages/PlayerDashboardPage.jsx) · [Original GM tab mounts](https://github.com/GrayIronwolf/AsteriaTTRPG/blob/cc4e7868/src/dashboards/GMDashboard.jsx) · [React GM](../../frontend/src/pages/GMDashboardPage.jsx)

### Player navigation

| Original tab | Phase 2 baseline and remaining parity |
| --- | --- |
| Dashboard | Partial. Fixed resources and configurable panels render. Activity Log, full combat overlay, framed HUD and contextual actions differ. |
| Character | Partial. Identity, resource and stat summaries render. Parchment stat cards, personal details, race modal and inline CP workflow differ. |
| Class/Talent Tree | Partial. Progression list and actions have reduced tree, filtering and movement. |
| Skills | Partial. Progress and training are available. Original modifiers, rank/technique interaction and check workflows need parity. |
| Spells | Partial. Search, elements and casting are available. Art, detail and alternative resource input differ. |
| Inventory | Partial. List/economy and equipment views render. Original storage packing, identification and comparison workflows differ. |
| Crafting | Partial. Economy entry works. Recipe, enhancement and artisan/service workflows differ. |
| Quests | Partial. Character quests and guarded updates work. Shared quest merge and detail differ. |
| News / Events / History | Partial. Player information renders. Filters, shared timeline and visibility behavior differ. |
| Journal | Partial. Owner-only access and current rows render. Sparse-record edit/delete was flagged in Phase 1. |
| Party | Partial. Party data is available. Original chat, presence and party workflows differ. |
| Gallery | Partial. Gallery is owner-only in React. Original presentation/source fallback differs. |
| Battle Maps | Partial. Published map entry works. Original tools and combat binding differ. |
| Advanced Dice | Partial. Dice workspace renders. Presets, interaction and roll parity remain. |
| Calendar | Partial. Calendar reader renders. Original calendar details and workflows differ. |
| Weather | Partial. Published weather renders. Original region and history affordances differ. |
| World Map | Partial. Published atlas renders. Original exploration and map overlay behavior differ. |
| Campaign Library | Partial. Current reader renders. Original categories, file handling and assignment workflows differ. |
| Campaign Audio | Partial. Current audio area renders. Original controls and playback behavior differ. |
| Recording & Archives | Partial. Local fixture provides idle notice and archives. Full participant consent, withdrawal and original archive interaction remain restoration work. |
| Dashboard Settings | Partial and visually different. Panel library, settings, saves and per-width layouts exist. Original modal, focus, geometry and controls differ. |

The modern GM read-only character route omits Journal, Gallery and Dashboard Settings and disables resource mutation. Original navigation still exposes the same labels in read-only mode. The owner route includes all 21 original labels plus Combat, Progression, Check History, Inventory & Trading, and Campaign World & Session when the test flags and scope permit them.

### GM navigation

| Original tab | Phase 2 baseline and remaining parity |
| --- | --- |
| GM Main | Partial and visually different. Current party, session controls and adjustable grid render. Original inline encounter, XP, Soul Damage and fixed action shell differ. |
| GM Toolkit | Partial. Shortcut directory exists. Global search, detail destinations, runbook and richer party tools differ. |
| NPC & Creature Library | Partial. Library, generator and check composer render. Original detail and hand-offs differ. |
| Dashboard Settings | Partial and visually different. Scoped saves, undo/redo, presets and layout controls exist. Original modal and grid operation differ. |
| PC Inventory | Partial. Economy inventory and audit render. Original target operations, loot and rewards differ. |
| News & Events | Partial. News records are editable. Original event and history coordination differs. |
| Quests | Partial. Campaign quest/list tools exist. Original templates, state, detail and assignment flows differ. |
| GM Notes | Partial. Current notes management is reachable. Connected records and combined search destinations differ. |
| Session Library | Partial. Archive area opens. Original PDFs, notes, filters and shortcuts differ. |
| Soundboard & Ambience | Partial. Audio area opens. Original library and playback controls differ. |
| Session Recordings | Partial. Current recordings area and original idle fixture open. Original consent/privacy and archive behavior remain to be compared separately. |
| Player Display | Partial. Publish and blackout work in the Combat journey. Original presentation workflow and display options differ. |
| Economy | Partial. Economy workspace exists. Original merchant, trade, party loot and receipt behavior differ. |
| Crafting | Partial. Crafting entry exists. Original stations, enhancement and service operations differ. |
| GM Tools | Partial. Campaign management and generic tools exist. Original precise grants, inspections and player tools differ. |
| Gameplay Systems | Partial. Combat and Progression mount together with one region each. Original scene context, templates, planning tools and advanced Combat are separate gaps. |
| World Systems | Partial. Records and generators render. Original chained edits, flags, events and visibility behavior differ. |
| Battle Maps | Partial. Upload and publication work in the Combat journey. Original overlay, markers, tokens and combat integration differ. |
| Advanced Dice | Partial. Current dice area exists. Original saved sets, tools and visual treatment differ. |
| Random Tables | Partial. Current generator route exists. Phase 1 flagged replacement of weighted rows during save. |
| Encounter Generator | Partial. Routes into the shared Digital GM area. Original encounter generation, outcomes, reward tables and hand-off differ. |
| Asteria Calendar | Partial. Calendar area exists. Original editing and event behavior differ. |
| Weather Generator | Partial. Weather area exists. Original zone, environment and history behavior differ. |
| World Atlas | Partial. Atlas route exists. Original authoring controls remain a gap. |

### Configurable panels

These are all 44 IDs exercised through their labelled panel library controls. The table tracks the original content/actions that should be checked when restoring each panel. [Original registry](https://github.com/GrayIronwolf/AsteriaTTRPG/blob/cc4e7868/src/state/dashboardLayoutModel.mjs) · [Original Player panel switch](https://github.com/GrayIronwolf/AsteriaTTRPG/blob/cc4e7868/src/dashboards/PlayerDashboardOverview.jsx) · [Original GM panel switch](https://github.com/GrayIronwolf/AsteriaTTRPG/blob/cc4e7868/src/dashboards/GMDashboard.jsx) · [React Player panels](../../frontend/src/player/PlayerOverviewPanels.jsx) · [React GM panels](../../frontend/src/dashboard/GMOverviewPanels.jsx)

| Role | Panel IDs | Baseline |
| --- | --- | --- |
| Player | `armour`, `weapons`, `quick` | Partial. Equipment/weapon stats and quick actions appear. Original AC inspection, paired slots, details and item use remain to compare. |
| Player | `talents`, `spells`, `skills` | Partial. Names and actions appear. Original filters, ranks, details and combat interactions differ. |
| Player | `conditions`, `effects`, `specialDamage`, `rest` | Partial. Basic status and rest panel exist. Original durations, stacked effects, Soul Damage and full rest options differ. |
| Player | `currency`, `quests`, `journal`, `party` | Partial. Current panel summaries exist. Original denominations, quest scope, journal state and party/chat actions differ. |
| Player | `shortcutInventory`, `shortcutQuest`, `shortcutCharacter`, `shortcutSpells`, `shortcutGallery`, `shortcutSettings` | Destination entry available to the owner. Document exact tab scope and visual shape in screenshots. |
| Player | `combatOverview`, `explorationOverview`, `questTracker`, `inventoryOverview` | Partial. Shortcut or summary replaces richer original focus content and controls. |
| GM | `restRequests`, `encounter`, `xp`, `specialDamage` | Partial. Approve/deny and current encounter/progression entry exist. Original inline controls, recovery amount and apply/recover actions differ. |
| GM | `loot`, `magicRewards`, `acInspector`, `playerManagement` | Original targeted grant, composer, AC inspection and title/storage controls are missing from these panels. React presents general shortcuts. |
| GM | `partySummary` | Partial. Party rows survive. Original selection and inspection links differ. |
| GM | `shortcutInventory`, `shortcutQuests`, `shortcutNotes`, `shortcutEconomy`, `shortcutCrafting`, `shortcutTools`, `shortcutWorld` | Destination entry available. Supporting copy and downstream action coverage differ. |
| GM | `combatOverview`, `explorationOverview`, `questTracker`, `inventoryOverview` | Partial. Original contextual turn, exploration, quest and inventory previews differ. |

The recurring layout differences are framed versus inline resources, GM sidebar and summary placement, default tile geometry, horizontal navigation, original tab icons and keyboard roving focus, and the original modal editor versus the inline React editor. The captures record the implemented colors, geometry and typography even when rendering differs from the original. [Original UI primitives](https://github.com/GrayIronwolf/AsteriaTTRPG/blob/cc4e7868/src/components/WorkspaceUI.jsx) · [Original dashboard CSS](https://github.com/GrayIronwolf/AsteriaTTRPG/blob/cc4e7868/src/styles/asteria-react.css) · [React Player CSS](../../frontend/src/pages/PlayerDashboardPage.module.css) · [React GM CSS](../../frontend/src/pages/GMDashboardPage.module.css)

The 1440 px desktop run measured the original Player navigation at 1360 px and the React navigation at 1280 px. The first armour panel measured about 449 × 449 px in the original and 423 × 423 px in React. The GM encounter panel measured about 523 × 435 px and 469 × 390 px, respectively. The original first tab uses a symbol, `role="tab"`, and roving focus. The React first tab has a text label and button semantics. The original HUD computes Source Serif 4 with Georgia/serif fallbacks and the GM heading uses Cinzel with Georgia/serif fallbacks. The React display stack starts with Georgia. These are measured CSS values in the supplied offline browser configuration.

The original resource fills in both dashboards are HP `#a92842`, SP `#2dbd72` and MP `#2777d9`. React uses separate glossy gradient fills. The metrics capture the actual gradient stops, original reserved Soul Damage layer, borders and title styling. Original full-page images have the viewport height because their dashboard scrolls in a nested container. React uses a taller document. The representative workspace captures and per-panel rectangle measurements supplement the six full-document views.

## Combat and Compendium regression gates

The duplicate GM Combat badges were stale rendered state caused by Combat and Progression children sharing a React key at the same level. Player Combat and the persistent check workspace also shared a key. Distinct key prefixes preserve each workspace's account/campaign/character scope. The browser suite tests single regions and badge sets, exact initiative/AP values, live turn advance, region unmount/reentry and role isolation. Run the same suite against both builds with the same demo invitation, membership and link flags. The existing Combat acceptance workflow defines those flags and its disposable signing key. [Combat browser test](../../scripts/site-combat-phase7-1-browser.cjs) · [Combat acceptance workflow](../../.github/workflows/frontend-phase7-1-acceptance.yml)

```sh
npm run site:restoration-build -- dedicated
npx firebase emulators:exec --project demo-asteria --only auth,firestore,functions,storage \
  'npm run site:combat-browser'
npm run site:restoration-build -- combined
ASTERIA_EXPECT_COMBINED_COMBAT=1 \
  npx firebase emulators:exec --project demo-asteria --only auth,firestore,functions,storage \
  'npm run site:combat-browser'

ASTERIA_COMPENDIUM_REPORT=/tmp/asteria-compendium-routes.json npm run site:restoration-compendium
npm run site:restoration-build -- production
npm run site:verify-dist
```

The Compendium test exercises the actual public route parser and Vite public entry loader. It compares identity for all 891 original bookmarks. The baseline is 665 same-ID successes and 226 known missing class-qualified Talent routes. It rejects missing previously good pages, wrong destinations or definition IDs, and ambiguous resolution. It accepts a correct resolution of a known gap. Set `ASTERIA_COMPENDIUM_REPORT` to record each current outcome. The compact fixture generator can verify and regenerate against the complete Phase 1 TSV and pinned original Git content. [Verification suite](../../scripts/site-restoration-compendium.test.mjs) · [Oracle generator](../../scripts/site-restoration-compendium-baseline.mjs)

The Phase 1 linked Forge route, old affinity records, sparse Journal update and weighted random table findings remain open. Dashboard baselines establish the shape of the current experience and the original target. Full restoration requires the later feature and visual acceptance phases.
