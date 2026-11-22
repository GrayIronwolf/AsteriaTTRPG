# GM & Player Dashboard — Hybrid React/Vite Navigation and Combat Workspace
**Scope:** `Website-Build-Test` only. **Owner approval:** phases 1–6 navigation redesign approved 22 Nov 2026; no approval for merge to `main` or Firebase production deployment.
**Status:** Implementation on test branch; CI and authenticated GM/Player acceptance must pass before release.
## Replacement policy
- Replace the two original 25/21-option flat dashboard tab strips with one **React/Vite** shared `DashboardNavigation` component and `dashboardMenuModel.mjs` as the single page registry. The generic `Tabs` control remains for legitimate within-page sub-navigation.
- Remove obsolete top-level dashboard tab CSS rather than adding layout overrides; preserve existing GM and Player page IDs, Firebase ownership rules, browser-state restoration and campaign links.
- Use **7 categories each**. GM: Main, Combat, Campaign, World, Session, GM Tools, Settings. Player: Dashboard, Character, Inventory, Adventures, World, Session, Settings.
- Dropdowns must resemble the header menu **cards**, use the existing Asteria palette, support search, favourite shortcuts, mouse/keyboard/touch and narrow viewports. No hover-only navigation.
- All original 25 GM and 21 Player destinations must remain accessible, including campaign restrictions for unassigned characters.
## Combat Command Centre — one workspace
- The sidebar is a **tool launcher**, not a page router or copy of combat state. Categories: Overview, Encounter Builder, Prepared Encounters, Live Combat, Battle Maps, Rewards & History, Workspace Layouts.
- Each of 13 panels can be independently shown/hidden and, where supported, moved, resized, grouped, locked, docked and saved; prepared encounters are **inside** the freeform window canvas, not underneath it.
- Preserve older per-GM/per-campaign layout positions; auto-arrange never reintroduces window collisions, hidden windows do not lose gameplay state.
- Reuse the one authenticated combat command backend, current encounter, prepared encounter collection and GM action queue. Advanced adjudication is consolidated into one GM queue rather than the old duplicated simple review flow.
- Preserve canonical Firebase checks, approval, action AP costs, reactions, conditions, prepared encounters, maps, completion, GM rewards, player parity. No extra collections or services solely for this navigation change.
## Tests and acceptance
- `scripts/hybrid-dashboard-navigation.test.mjs`: counts/IDs/permission filtering, category integrity, React-only replacement, 13 panel registry, no overlap, old-layout migration, saved presets.
- `scripts/combat-command-centre-replacement.test.mjs`: no legacy GM renderer duplication, player preservation, backend integration.
- `scripts/phase1-2-browser-audit.cjs`: real browser against isolated fixtures for GM/Player desktop and mobile, card-to-page navigation, combat sidebar and workspace customisation.
- Run `npm run lint`, `npm test`, `npm run test:firebase` and `npm run build` in GitHub CI. Verify generated React assets are committed and browser audit runs on that compiled head.
- **Additional required before live release**: authenticated GM & Player account smoke tests for encounter loading, initiative, action queue, conditions, maps, rewards and permissions; desktop, tablet and mobile screenshots.
## Explicit limitations
- Building/test branch code does **not** mean it is available on the live website.
- No modifications to `main`, production Firestore rules or Cloud Functions deployment were approved in this batch.
- Header dropdown remains in its original implementation; the React dashboard reuses the approved *visual language*, not the old static menu code or a new static layer.
