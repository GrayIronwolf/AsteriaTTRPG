# Share & Present — Improvement Phase 4: Prepared Encounter Integration

**Branch:** `feature/share-present-improvement-4-prepared-encounters` stacked on draft Phase 3 PR #360; prior Phase 2 PR #359 and Phase 1 PR #358 remain approval-gated. No merge or deployment.

## Delivered
- The existing Combat Command Centre's authenticated `watchGM` feed supplies prepared encounter records, battle-map references, live combat revision and availability. No second encounter store, new Firebase service, or duplicated combat engine.
- GM chooses a prepared encounter, inspects its name, GM-only notes, enemy/wave totals and map, and explicitly reviews any proposed combat load.
- The existing `previewPreparedEncounterLoad` protects against active combat, stale templates, missing maps and linked-player conflicts. Confirmed loading calls existing `combatApi.loadPrepared(campaignId, preparedId, combatRevision, preparedRevision)`. This replaces staged enemies and preserves linked PCs; it does not start combat, grant rewards or publish a map.
- A separate map action uses the existing `managePresentation` callable and explicit GM click. It constructs an allowlisted map scene from an already published player map and refuses GM-only, missing or fog-enabled original assets.
- Phase 1 emergency-stop remains independently accessible. The Phase 3 playlists and Phase 2 presentation workspace are reused.

## Verification / acceptance
- Phase 4 model and source integration tests, inherited Phase 1–3 security tests, React lint, site checks, build and tracked artifact parity.
- Two-account browser test: GM sees saved prepared encounters; player or invited guest cannot read private plans, enemy stats, waves, GM notes or setup.
- Reject active combat, unavailable saved map, archived templates, lost membership, mismatched combat/template revisions and simultaneous edits.
- Confirm loading never starts combat automatically and never publishes a player map. Test both map stage and explicit present; GM-only and fogged source maps must be denied.
- Confirm live player projection contains no enemy notes/statistics, arbitrary map properties or raw template records.
- Confirm emergency stop and restricted viewer revocation still work after encounter staging.
- Inspect all repository checks on final generated-asset commit. Require owner approval and React/Vite dashboard restoration reconciliation before merging/deploying.

## Limits
- This phase provides a shortcut into existing prepared encounters and player-safe map presentation; it does not create new encounter templates or automatically begin combat.
- Starting combat and controlling enemy tokens remain in the existing Combat Command Centre.
- It does not solve the existing confidentiality limitation of player-published image originals. Use sanitized maps for secrets.
- A presentation preview is not proof of second-account media access; browser role verification remains required.
