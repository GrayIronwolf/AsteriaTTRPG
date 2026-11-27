# Player Dashboard Milestone 6 — Conditions, Effects and Character Synchronization

## Scope and source of truth
Existing React/Vite and Firebase character systems. No new parallel gameplay engine, Firebase project, Firestore or Storage rules. Work lands directly on `Website-Build-Test`.

## Audit findings addressed
- Encounter-scoped effects previously remained eligible when the encounter was absent; now the effect evaluator requires a matching active encounter.
- Condition expiry after time passes lacked a reliable one-shot refresh trigger. Character synchronization now evaluates expiry deadlines and refreshes canonical character state only when transitions are due.
- Resource regeneration could be overdue without a relevant encounter change; the synchronization model schedules its next applicable regeneration boundary.
- Failed refresh requests were suppressed for a whole session; retry now clears the failed decision and retries after a delay without unbounded per-second writes.
- GM and player condition/rest controls did not consistently respect live offline state; write actions are disabled when synchronization is unavailable.
- Rest approval validates the entered Soul recovery amount before submission, and the effects summary identifies the global skill-effect component rather than claiming it is a complete skill-check modifier.

## Behavioral regression coverage
`scripts/player-conditions-sync-m6.test.mjs` checks encounter effect boundaries, short/long/permanent rest duration, timed expiry convergence, regeneration gating, and offline/retry UI wiring. The full `npm test` and `npm run test:firebase` suites run before building the generated website assets.

## Deployment
Website assets are regenerated on `Website-Build-Test`. Production/backend activation is separate: `asteriaAction` must be redeployed from the approved branch to pick up changed shared effect and condition modules. Reuse the existing targeted deployment workflow after explicit authorization. No Firestore or Storage security rules are changed.

## Acceptance
Automated test success does not substitute for GM/player live testing. Verify condition application/removal, timed expiry, short/long rests, regeneration and offline/reconnect behavior with a real campaign.
