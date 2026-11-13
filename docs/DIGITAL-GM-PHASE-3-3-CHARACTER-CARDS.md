# Asteria Digital GM Toolkit — Phase 3.3: Custom Character Cards

## Scope

The existing Phase 3.1 NPC & Creature Library now supports GM-only character
cards for saved campaign NPCs and creatures. The feature reads the existing
campaign records without duplicating the Character Forge, official Compendium,
reputation system or combat statistics.

## Features

- Three configurable card layouts: **Portrait**, **Dossier** and **Tactical**.
- Three finishes: **Obsidian Stone**, **Stone Slate** and **Ashen Parchment**.
- Editable subtitle, optional linked portrait image URL, and visible fields
  chosen and ordered by the GM.
- Card gallery alongside the existing details view; cards are generated from
  the existing records and their optional card settings.
- A live Character Card Studio preview. Nothing changes in campaign storage
  until the GM explicitly selects **Save Character Card**.
- Persists only bounded card metadata in the original private NPC or creature
  record through the existing GM workspace saveSection service.
- Official bestiary entries are view-only and never edited or copied.
- Private notes are hidden by default and can only be included in the
  authenticated GM view; player-facing sharing is not part of this phase.
- Portraits use HTTPS or safe existing local asset paths; no new uploads.
- Accessibility labels, keyboard controls, and narrow-screen presentation.

## Compatibility

- Versioned, allowlisted card metadata. Old records without card settings
  use a default design.
- Existing library edits retain saved card preferences.
- No new Firebase collections, rules, functions or cloud services, and no
  changes to creature XP, encounter calculations or Asteria Index codes.
- No Obsidian integration or reputation mechanics.

## Verification and publication

Run focused card tests, the dashboard suite, full Node tests, lint,
Firebase emulators and production bundle reproducibility checks.
Generate and commit tracked React assets, then remove the temporary
branch build workflow. GitHub Pages automatically publishes merged main.
No manual Firebase backend workflow is required.
