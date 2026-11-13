# Universal Check Requests — Phase 1 repository audit and implementation gates

Status: development branch; **not ready for deployment or merge**.

## Existing code to reuse
- `src/state/combatRules.mjs`: d20 roll, natural 1/20, skill checks and DC resolution.
- `src/state/effectsEngine.mjs`: effective characteristics and character effects.
- `src/state/conditionModel.mjs`: active conditions.
- `functions/handler.mjs`: authenticated campaign membership, character ownership, Firestore transaction and request-id receipts.
- `functions/characterPermissions.mjs`: campaign GM and linked-character verification.
- `src/dashboards/GMDashboard.jsx`, `src/dashboards/CharacterDashboard.jsx`: existing GM and player dashboards.
- `js/firebase-auth.js` and `src/firebase/asteriaFirebaseService.js`: existing callable and real-time subscription bridge.
- `firestore.rules`: campaign-scoped access and server-owned records.

## Rule discrepancy — do not silently change combat
- `src/state/liveWorkspaceModel.mjs` has seven ranks: Novice, Initiate, Apprentice, Journeyman, Adept, Master, Grandmaster.
- `src/state/combatRules.mjs` currently calculates skill modifier as numeric rank minus three.
- Approved eight-rank check table is Untrained -2, Novice -1, Apprentice 0, Journeyman +1, Adept +2, Expert +3, Master +4, Grandmaster +5.
- New universal checks must use an explicit approved-rank mapping. Legacy numeric rank values require a deliberate migration or context-specific conversion before they can be trusted; do not reinterpret existing saved ranks globally.

## Security and workflow
- Only Cloud Functions may create, mutate and adjudicate check records.
- GM can request checks for linked campaign characters; player can submit only their own pending request.
- Trusted backend rolls digital dice, validates frozen modifier breakdown and checks ownership.
- Firestore reads must not reveal GM-only request data or other players' requests.
- Transactions must enforce pending -> submitted -> acknowledged/cancelled and GM-approved rerolls.
- Offline/reconnect uses durable Firestore records and real-time subscriptions.
- Physical dice are player-reported and must be distinguished from server-generated results.
- Group and opposed checks need multi-participant or linked requests and explicit resolution rules.

## Release gate
Do not merge until GM composer, player modal, results/history, backend actions,
secure rules, tests, production bundle and existing dashboard regressions pass.
Then merge one Phase 1 PR, deploy backend through existing manual workflow and
publish the frontend, and obtain live verification before Phase 2.
