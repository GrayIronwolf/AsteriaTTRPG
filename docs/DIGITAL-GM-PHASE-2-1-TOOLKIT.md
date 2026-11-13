# Digital GM Toolkit Phase 2.1 — Unified GM Toolkit

Scope: a GM-only **presentation/navigation hub** for existing campaign workspaces.
Do not interpret this as a new NPC generator, maps, audio, calendar, Focus preset,
data schema, permission, or inventory system.

## Implemented

- Adds the **GM Toolkit** tab to the existing GM Dashboard menu, alongside
  unchanged GM Main, inventory, notes, economy, world and other workspaces.
- Provides category and text-search navigation for the existing GM tools:
  campaign encounters, GM character controls, session logs, information,
  quests, party inventory, campaign manager, rewards, gameplay, merchants,
  loot tables, party stashes, inventory audit, economy, crafting, world and
  dashboard settings.
- Adds a compact **GM Toolkit quick access** bar above GM Main without changing
  its editable 12-column layout, saved panels, presets or action ownership.
- Uses the *same* internal tab switching and real DOM anchors already used
  by the GM Trade & Loot quick-access hub. No duplicate Firebase documents,
  parallel systems, new permissions, or public GM data.
- Displays a bounded read-only snapshot of session status, linked characters,
  open quests, shops and unrevealed treasure counts. It does not expose
  notes or unrevealed contents to a player route.
- Keeps the existing campaign-specific access gate
  (`window.AsteriaCharacterAccess.isGM`) ahead of rendering the toolkit.
- Includes search, filter, empty states, focus states and responsive layouts.

## Explicitly deferred

- Phase 2.2: named/saved Combat, Exploration, Roleplaying and Encounter Focus modes.
- Phase 2.3: further party-management and layout backup/restore tools.
- NPC generation and reputation, maps, procedural shops, world tools, session
  recording, Obsidian connection and other later roadmap phases.

## Verification and deployment

`npm run test:gm-toolkit`, `npm run test:dashboard`, the full `npm test`
suite, lint, Firebase emulator tests and bundle-reproducibility check must pass.
Compile and commit production `react-dist` assets in the branch before merging.
No Firebase backend deployment is needed. Owner handles website deployment.
