# Phase 7.1 — React/Vite combat, initiative, AP, resources and encounters

## Replacement boundary
Migrate the existing campaign combat UI into the isolated React/Vite GM and Player Dashboards without mounting old combat widgets or copying its CSS. The old production gameplay remains untouched until the ten-phase migration cutover. The new combat workspace is explicitly gated behind `VITE_ASTERIA_COMBAT_ENABLED=true` and is off by default.

## Canonical backend and rules
- Use the existing Firebase app, canonical Auth profile, Firestore campaign and member documents, linked character source records, and existing `asteriaAction` callable (`combatCommand`).
- Preserve `campaigns/{id}/systems/encounter` with `combat.version`, `combat.revision`, roster, initiative, current actor, rounds, AP, bonus actions, live session and combat logs. Preserve `gmWorkspace` as GM-only.
- No new Firebase collection, rules, Cloud Function, combat reducer, second Firebase app, direct client resource write, or browser-side random initiative.
- GM access is owner or valid v1 GM/v2 active co-GM; player control requires a v1/v2 active campaign member plus the linked canonical character owner and matching private character source. All initial reads use server snapshots, listener updates reject cache and pending local writes, and every mutation verifies permissions again.
- All writes are server commands with fresh idempotent request IDs and optimistic encounter revision checks. The backend still owns AP limits, combat costs, initiative randomness, effects, equipment and progression.
- Show current combatant, round, initiative order, each authorised participant's AP/bonus and HP/SP/MP, pending GM action status, and a dedicated owner-only player combat view. No private journal, GM notes or private encounter metadata is projected to the player component.

## GM scope
- Add server-verified linked campaign players, choose existing eligible GM NPC/creature sources or author a custom NPC/creature with HP, SP, MP, experience and optional initiative.
- Start, advance and end combat; manage setup roster, initiative values, and an audited GM correction for HP/SP/MP/AP; use the existing server-validated AP-spend, end-turn and death-save commands.
- Existing source-specific spell, talent, reaction and attack resolution remains in the original combat system until the later gameplay migrations. Those advanced operations are not silently reimplemented or granted directly to the browser. Pending complex actions block basic controls until the GM resolves them in the legacy engine.

## Player scope
- Only an authenticated, linked character owner may use the player combat route. Read-only GM character inspectors cannot issue owner combat commands.
- Player sees initiative, round, personal AP, personal HP/SP/MP and turn availability and can record 0-3 AP, finish a turn and roll their death save when eligible; the server retains all authoritative checks and costs.
- Changed-account, revoked membership and unlinked character snapshots remove the UI and dispose all listeners.

## Verification and deployment
- Unit coverage includes canonical projections, pending action privacy, v2 linked roster, enemy setup, exact roles, account switching and callable request contract.
- The opt-in Auth/Firestore/Functions/Storage two-account emulator browser test exercises existing Forge link approval, GM session start, combat start, AP from both clients, initiative/turn advancement, end combat and removed character denial.
- All production website, Firebase security and React build checks remain mandatory. Merge only with green CI. Production hosting and backend deployment remain deferred until the final ten-phase cutover, initiated by the user.
