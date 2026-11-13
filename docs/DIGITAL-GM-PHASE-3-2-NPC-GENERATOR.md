# Asteria Digital GM Toolkit — Phase 3.2: NPC Generator

## Approved scope

Add a local, editable NPC concept generator inside the Phase 3.1 GM-only
NPC & Creature Library. This is a roleplaying preparation tool, not a new
character builder, AI service, combat generator, public compendium editor,
or campaign mutation until a GM explicitly approves saving a record.

## Implemented

- Procedural NPC name suggestions, role / occupation, personality, motives,
  fears, dialogue style, and a story hook.
- Select from officially available Asteria race names via the existing
  AsteriaRaceCompendium.entries() API, never hardcoded fabricated races.
- Select faction and location only from existing campaign GM World Systems
  factions, settlements, and regions. Empty choices remain unspecified.
- Select 14 narrative occupations and five personality tones. Names and
  descriptions are explicitly marked as creative suggestions, not canon.
- Entire concepts and individual fields can be rerolled. Fields may be
  locked to preserve GM edits during rerolls.
- Fully editable preview with explicit discard or Use in NPC Editor.
  The generator itself never persists a record. The existing NPC editor
  handles confirmation and saves to the same GM-only world.npcs array.
- Extends the existing NPC library record with optional race, fears and
  dialogueStyle fields without overwriting other world sections or data.
- No HP, XP, AC, stats, Asteria IDs, religion, magic affinities, race traits,
  reputations or game mechanics are invented by the generator.
- Desktop/mobile accessibility, keyboard controls and status feedback.

## Deferred

Phase 3.3 custom character cards, generated stat blocks, NPC memory and
reputation mechanics, Obsidian connections, and any external AI service.

## Verification

npm run test:gm-phase3-2, npm run test:dashboard, npm test, lint and the
production bundle reproducibility checks must pass, alongside Firebase
emulator tests. All changes are website-only and the user handles
production website deployment after PR merge.
