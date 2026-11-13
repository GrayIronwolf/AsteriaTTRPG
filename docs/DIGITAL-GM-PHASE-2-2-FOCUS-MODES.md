# Asteria Digital GM Toolkit — Phase 2.2: Saved GM Focus Modes

Scope: named, persistable GM dashboard panel configurations. No new gameplay
system, Firebase collection, rule, Cloud Function, Player Dashboard feature,
Obsidian connection, map builder, or Phase 2.3 backup/export feature.

## Existing systems extended

- Reuses built-in Combat, Exploration, Roleplaying and Encounter layouts from
  `DASHBOARD_LAYOUT_PRESETS.gm`. Never recreates the GM combat or quest engines.
- Adds a **GM Focus Modes** toolbar to GM Main, after the Phase 2.1 Toolkit
  quick-access row and before the existing editable panel grid.
- GMs switch preset layouts immediately with optimistic UI updates, while
  persisting the result via the existing owner-scoped
  `users/{uid}/dashboardLayouts/gm-{campaignId}` document and authorized
  `saveUserDashboardLayout` service. Errors roll the view back.
- Preserves the **normal dashboard** automatically on first entry into a Focus.
  “Normal dashboard” restores its original arrangement without overwriting
  the existing named Focus library.
- Supports up to **8 named Focuses**, each holding the exact approved dashboard
  panel configuration (positions, sizes, visibility, background, locks and all
  viewport-specific variants). Names are 1–48 characters; IDs and panel
  definitions are validated by the existing dashboard normalizer.
- Switching between named or built-in Focus modes does not change encounter,
  characters, NPCs, quests, resources, inventory or other campaign state.
- “Update saved” is explicit. Merely moving/resizing panels never overwrites
  a named snapshot.
- Provides explicit confirmation before deletion, screen-reader status updates,
  keyboard-focus indicators, disabled states and mobile-responsive controls.

## Safety & compatibility

- The existing GM access check runs before rendering. The private per-account
  dashboard service also verifies current campaign GM authorization before
  writing. No new backend access paths.
- Old GM and Player saved layouts normalize unchanged, and Player layouts
  discard GM Focus metadata. New Focus metadata is capped and contains only
  allowlisted panel IDs and layouts.
- Switching resets on campaign/account change and prevents a stale asynchronous
  response from updating another user's dashboard.
- Existing dashboard editor and preset APIs remain supported. Viewport edits
  preserve the named library and normal-layout restore point.

## Checks & deployment

`npm run test:gm-focus`, `npm run test:dashboard`, complete `npm test`,
lint, Firestore emulator checks, and production Vite bundle reproducibility
must succeed. Compile and commit the tracked React bundle on the feature
branch, then remove the temporary build workflow before merge. Deployment
remains manual with the project owner after merge.

**Not included:** Phase 2.3 party management and layout backup/export.
