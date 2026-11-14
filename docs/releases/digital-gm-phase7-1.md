# Digital GM Toolkit — Phase 7.1: Advanced Dice Roller

## Completed functionality

- A new **Advanced Dice** tab is available on GM and Player Dashboards, and a searchable **Advanced Dice Roller** tool appears in the GM Toolkit.
- Roll standard tabletop dice `d4`, `d6`, `d8`, `d10`, `d12`, `d20`, and `d100`.
- Combine up to eight groups of different dice, with at most 40 total dice in a single roll. Add a signed whole modifier from -999 through +999 and an optional label.
- Review every face, group subtotal, modifier, and total; natural 1 and 20 indicators apply only to a single unmodified die type of d20 (indicator independent of the modifier).
- Save up to 24 personally named dice presets, update a preset with the same name, load or remove presets, and clear roll history separately with confirmation.
- A signed-in user's 80 most recent digital rolls are synchronized between their devices, with timestamps and full dice breakdowns; other accounts cannot read the records.
- A dedicated Firebase Cloud Function uses Node's cryptographically secure `randomInt` to roll dice **on the server**, validates all arguments, and writes the result and history atomically. Client-supplied faces, totals, timestamps and owner IDs are rejected.
- Roll request IDs are idempotent while present in saved history. The backend enforces a 250 ms minimum interval between distinct rolls to limit duplicate submissions.
- Firestore explicitly denies direct browser creation, update, and deletion of dice records, including via pre-existing recursive user account permissions.
- Phase 7.1 is independent of the Universal Check Request System and combat AP/resources: free-form dice results are **not** authoritative checks or automatic combat resolution.

## Security and privacy

Data is stored under `users/{ownerUid}/diceWorkspace/current` and can be read only by that authenticated account. The Cloud Function derives the owner UID from the authenticated caller and rejects identity overrides. The browser receives the full history but may never set or forge it. The existing campaign check, NPC interaction, and combat command backends remain unchanged.

## Verification

- `node --test scripts/digital-gm-phase7-1.test.mjs`: dice pool boundaries, roll arithmetic, natural 1/20, private presets, history retention, action schema, idempotency and application links.
- Firestore emulator test `scripts/digital-gm-phase7-1-emulator.test.mjs`: owner-only reads; reject forged digital results, timestamp changes, deletion, clearing, and cross-user writes; preserve unrelated user settings.
- Dedicated Phase 7.1 GitHub workflow also runs Phase 6.1–6.3 regressions, lint, dashboard and combat tests, the production React build, and publishes committed website assets only after verification.
- Final merge gate: full Firebase and website checks (including the emulator suite and checked-in production frontend bundle), Phase 6 regressions, both Universal Check workflows, and Phase 7.1 checks must be green at the final commit.

## Deployment after merge

The user runs the existing GitHub **Deploy Firebase backend (manual)** workflow on branch `main`, operation `deploy`, confirmation `DEPLOY-ASTERIA-PRODUCTION`. Verify the **Approved Firebase production deployment** job succeeds. GitHub Pages publishes website assets separately from the merged commit.

## Live test checklist

1. Open the GM Dashboard or Player Dashboard **Advanced Dice** tab. Create 2d6 + 1d20 + 4 and confirm each face and total.
2. Test d4, d8, d10, d12, d20 and d100, including a natural 20 and natural 1.
3. Save a preset, leave the page, return, load it, and confirm the roll expression is restored.
4. Sign into the same account on another device and verify private presets and history synchronize.
5. Confirm a different account cannot view the first account's history or alter its totals through Firestore.
6. Confirm a free dice roll does not automatically complete a Universal Check, change an initiative roll, or consume combat AP.
7. Clear dice history; verify saved presets remain.

## Next phases

Phase 7.2 is the Random Table Builder. Phase 7.3 is the Encounter & Reward Generator. Neither is bundled into Phase 7.1.
