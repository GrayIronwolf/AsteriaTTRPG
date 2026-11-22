# GM Combat Command Centre — Atomic Replacement

**Branch:** Website-Build-Test only
**Base:** recovered PR #280
**Source:** Asteria-Development-Archive `frontend/src/combat`, adapted to the current hybrid React dashboard and Firebase application.

## Replacement and removals (in the same commit)

- A dedicated **Combat Command Centre** GM tab replaces the old embedded `CampaignEncounter` widget. Existing GM Dashboard layout panel `encounter` becomes a navigation shortcut to the new Combat page so saved layouts do not lose their registered panel.
- The previous `GMCombatPanel`, `GMParticipant`, and old encounter-specific React renderer are deleted from their original files. Advanced GM adjudication, reactions, ambushes and conditions are **moved into the new Command Centre module**, retaining the existing authoritative command API.
- All Player Dashboard combat components, hooks and buttons stay untouched.
- The archived freeform Combat Command Centre, private prepared encounter library, waves, live GM controls, encounter completion/history and map preview are ported into the existing `src/dashboards/combat/` tree, **not** the old `frontend/` tree. No second application shell is added.
- The combat UI uses the existing Auth/Firestore/Functions instances published by `js/firebase-auth.js` rather than instantiating a second Firebase app.
- The archived `functions/combatCommands.mjs` replaces the older command handler, reusing the existing authoritative `asteriaAction` callable and `campaigns/{id}/systems/encounter` source. New server operations cover prepared loads, waves, map preparation and live timer.
- Encounter completion commands are integrated into the same `functions/commands.mjs` dispatch; approved reward delivery retains user ownership checks. An isolated pure XP progression module copies the canonical existing XP table and rules so server processing does not call `window.AsteriaProgression`.
- Firestore adds **GM-only** access to `campaigns/{id}/encounterHistory` and permits writes to those records exclusively through trusted server code. Prepared plans stay in the existing private `gmWorkspace` document.
- Existing map documents and Storage paths are reused, with no second map database or storage bucket.
- Local `reactFixture=1` browser tests receive an isolated in-memory combat provider, never installed on live hosting.

## No-deployment conditions

The above is **repository implementation only**. Adding new Firestore rules and Cloud Functions files to `Website-Build-Test` does **not** deploy them to Firebase. Real use of the new operations requires a separate tested, approved deployment of functions/rules alongside an approved frontend release.

## Acceptance requirements

- `npm run lint`, `npm test`, Firebase emulator integration, `npm run build`, and the new atomic replacement test must all pass.
- GM can start/advance/end, prepare/save/load/preview an encounter, view waves/history, save freeform layouts, and use the existing advanced adjudication flow.
- Two-account emulator checks must verify GM-only encounter template/history access, role revocation and player safety.
- No active duplicate old GM encounter controls and no missing Player Dashboard functionality.
- Visual browser acceptance and existing GM/player dashboard screenshots must be compared at desktop/tablet/mobile.
- **Owner approval is required** before any changes to `main`, `Asteria-W-Recovery` or production Firebase.

## Notes and limitations

The archived new Combat Command Centre uses the same underlying campaign encounter and preexisting Firebase project. GM history and completion use an extended model. This implementation must not be called production-ready until the full CI, emulator, and manual acceptance tests pass.
