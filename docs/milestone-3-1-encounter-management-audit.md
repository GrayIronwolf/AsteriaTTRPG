# Milestone 3.1 — Encounter Preparation & Management: Initial Repository Audit

Branch: `milestone-3-1-encounter-management` (PR target: `Website-Build-Test`).
Baseline: `b9c7a1f6e158980070c2e092ebc2f940e2c338d3` (Milestone 2.2).
Status: **In progress; not a completed Milestone 3.1 acceptance. No production deployment.**

## Existing code to preserve

- `src/state/preparedEncounterModel.mjs`: GM-only reusable templates, bounded enemy roster, map spawn information, waves/events.
- `src/state/preparedEncounterLibraryModel.mjs`: search, sort, archive, and duplicate prepared templates.
- `src/state/preparedEncounterLoadModel.mjs`: guarded loading into an inactive encounter; preservation of linked PCs.
- `src/dashboards/combat/PreparedEncounterLibrary.jsx`: existing prepared template editing interface.
- `src/dashboards/combat/CombatWorkspace.jsx`: current roster, combat start/end, initiative editing, combat canvas.
- `functions/combatCommands.mjs`: authoritative transactional combat command/state machine, revision checking, private schedule and combatant resources.
- `src/state/encounterCompletionModel.mjs` and `functions/encounterCompletionCommands.mjs`: private completion snapshots, reward proposal/approval and idempotent reward delivery tracking.
- `src/state/encounterWaveModel.mjs`: staged GM-only waves and events.
- `src/state/battleMapModel.mjs` and `src/state/preparedBattleMapModel.mjs`: prepared map/encounter link.
- `src/dashboards/combat/CombatCommandCentre.jsx`: shared canvas shell; preserve Milestone 2.2 performance work.

## First implemented subtask: initiative mode

- GM chooses automatic (default), manual, or mixed initiative **before** starting combat.
- Manual mode requires all combatants to have GM-set initiative.
- Mixed mode requires player initiative to be set manually; enemies without initiative are rolled by the existing server-side initiative engine.
- Existing automatic behavior stays the default for old encounter records.
- The authoritative server validates the choice and refuses an unprepared manual/mixed start.
- The GM interface displays the current initiative mode and saves it via the existing encounter revision-based service.
- Existing pre-set initiative is preserved; clearing the encounter resets the mode.
- Regression tests cover permissions, invalid choices, mode change during combat, manual prerequisites and mixed enemy rolls.

## Outstanding approved Milestone 3.1 work

1. Confirm the proper lifecycle across prepared, GM-private staged, active, paused and completed encounters. Existing public combat status only supports ready/active/ended. Avoid changing public status without compatibility/migration review.
2. Implement quick encounter creation distinct from reusable prepared templates without destructive replacement of active encounters.
3. Stage a second encounter privately while a live encounter is active; its map and participants must not leak to public presentation.
4. Support GM-driven active encounter roster changes, reinforcements and initiative changes without resetting AP or other combat state.
5. Save/recover original live encounter revisions, manual snapshots and GM audit history. Autosaving of gameplay is already transactional, but named manual snapshots are not yet verified.
6. Reopen the **same completed** encounter, preserving earlier completion revisions and preventing duplicate rewards. Existing `start` creates a new `combatId`; completion-history guards prohibit overwriting previous history.
7. Preserve the GM's **personal** canvas layout (no encounter-specific layouts).
8. Audit Firestore security rules, completion receipts, presentation visibility and connected participant access before enabling new live writes.

## Integration / release hazards

- PRs #389 (Milestone 2.3) and #390 (Milestone 2.4) are open and modify the shared canvas. Do not merge competing canvas changes blindly.
- The repository baseline audit documents that GitHub Pages can publish directly from `Website-Build-Test`. Check the active Pages source before merging; user requires no automatic production deployment.
- `.github/workflows/firebase-checks.yml` runs broad regressions, Firebase emulators, build and bundle-consistency checks. No passing CI for this Milestone 3.1 work is claimed until the actual workflow finishes.
- Firebase backend deployment is a separate explicitly authorised operation. Do not deploy it as a side effect of this PR.

## Exit gates for Milestone 3.1

- All approved 3.1 functional behaviors implemented with server-side authorization and compatibility tests.
- Manual and automated/browser tests pass; all required GitHub checks pass on reviewed head SHA.
- No newly introduced regressions to Milestone 2.2 canvas performance, current combat, reward delivery or player privacy.
- Production publishing is verified disabled or otherwise explicitly authorised before merging to `Website-Build-Test`.
- Only after these gates are satisfied is a merge eligible.
