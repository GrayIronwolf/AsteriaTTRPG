# Asteria Digital GM Toolkit — Phase 7.2: Random Table Builder

## Functionality

Phase 7.2 introduces a dedicated **Random Tables** tab in the GM Dashboard and a searchable **Random Table Builder** shortcut in the GM Toolkit. It does not replace the existing, separately authorized **GM Loot Tables** under Economy.

- Create, edit, duplicate and archive reusable campaign-private random tables.
- Five category templates: **random encounters**, **NPCs & characters**, **events & complications**, **travel discoveries**, and **custom generators**. Starter templates supply three editable narrative results.
- Tables have names, descriptions, location/context, optional Threat Tier (1–20), revision tracking, active/archive states and 1–40 entries.
- Each entry has a title, detailed narrative, private GM note and relative weight 1–1,000, with an overall weight cap of 10,000. The UI shows percentage probability for each entry.
- Entries may reference an existing, active GM Loot Table. The server validates those IDs against the saved campaign loot-table collection. A linked result is only a reference; no loot or currency is generated or distributed.
- Roll once or produce a batch of 1–10 draws using cryptographically secure Node `randomInt` on the trusted backend. Returned results contain immutable snapshots of title, description, weight, chance, linked loot reference and saved table revision.
- Every roll/batch is recorded in a **GM-only campaign history** with server timestamp, request ID, actor UID, table revision and complete draw data. The UI shows the latest 80 records, optionally filtered to the selected table.
- Optimistic concurrency checks reject stale edits, archive operations and rolls; the pre-existing action-receipt framework makes retries idempotent.

## Security

The existing `asteriaAction` Firebase callable, campaign membership validation, server-side GM permission checks and transactional receipts are reused. Browser clients can read `campaigns/{campaignId}/randomTables` and `campaigns/{campaignId}/randomTableRolls` **only while authorized as GMs**. All direct browser writes are forbidden. The backend accepts only bounded table definitions and action types and generates rolls exclusively from saved, validated table data.

## Explicit scope boundaries

These results are GM narrative prompts, not system effects. Phase 7.2 **does not automatically create encounters, NPCs, items, coins or quests**; GM application remains deliberate. Existing battle maps, Universal Check Requests, combat AP, the Advanced Dice Roller, GM Loot Tables and player inventory are untouched. Deeper encounter/reward workflows belong to Phase 7.3.

## Verification and release

- `node --test scripts/digital-gm-phase7-2.test.mjs`: categories, templates, weight boundaries, probabilities, stable revisions, privileged actions, loot references and roll history.
- `scripts/digital-gm-phase7-2-emulator.test.mjs`: GM-only reads, denied player and unauthenticated access, and denied direct writes even from the campaign GM.
- Dedicated `build-digital-gm-phase7-2.yml` additionally runs prior Phase 6.1–6.3 and Phase 7.1 checks, lint, combat/dashboard regression tests, Firestore emulator tests and the full production React build. It commits verified frontend assets.
- Standard `npm test` and `npm run test:firebase` include Phase 7.2 test suites, so the existing manual production deploy gate will check them again.
- Merge only after all feature and repository-wide checks pass on the final commit with the verified frontend bundle.

## Deployment and live acceptance

1. After merge, manually run **Deploy Firebase backend (manual)** on branch `main`, operation `deploy`, confirmation `DEPLOY-ASTERIA-PRODUCTION`. The website deploys separately through GitHub Pages.
2. Open GM Dashboard → **Random Tables** and create a category-based table with a 3:1 distribution. Verify displayed probabilities (75%/25%) and server-recorded draw history.
3. Save, reopen, edit and duplicate the table. Verify archived tables cannot be changed or rolled.
4. Link an existing active GM Loot Table and verify that choosing the reference does not create a party-loot draft or modify inventory/currency.
5. Test 10 consecutive draws, timestamps, revision metadata and the history filter.
6. Confirm a player account cannot view or modify private random tables or rolls.

**Next phase:** 7.3 — Encounter & Reward Generator.

## Final source-and-bundle release gate

The dedicated Phase 7.2 workflow has committed verified production website assets to this PR branch. All required checks must pass on this final source-plus-bundle head before merging: Phase 7.2, Phase 7.1, Digital GM Phases 6.1–6.3, both Universal Check regression workflows, and the full Firebase and website suite including the compiled bundle comparison. Production deployment remains manual after merging to `main`.
