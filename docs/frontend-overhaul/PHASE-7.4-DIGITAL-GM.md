# Phase 7.4 — NPC Management, Reputation, Relationships and Digital GM Toolkit

## Scope and migration
The GM/Player React/Vite dashboards now expose the existing Digital GM content without mounting legacy UI or introducing another Firebase app. `VITE_ASTERIA_DIGITAL_GM_ENABLED` is opt-in and remains **off** by default until the agreed final website migration cutover. Do not deploy Phase 7.4 independently.

## Canonical data and permissions
- Campaign NPCs/creatures, private GM notes, quest drafts, factions and global world summaries live in `campaigns/{campaignId}/systems/gmWorkspace`, as before. The new authenticated GM editor uses transactionally verified v1/v2 membership and **targeted nested merge patches**, not stale whole-document replacement. It rejects conflicting per-record revisions/updatedAt.
- Existing NPC library models validate record fields, custom creatures and editable character cards. Official compendium entries and synthetic legacy identities remain read-only. The deterministic concept generator offers ideas but never invents official race facts or combat statistics.
- Relationships: a bounded **17-level** scale (-8 through 0 to +8) and milestone/note history. Reputation: a bounded **15-rank** GM-only narrative ledger, beginning with `Who are you again?`. These are *GM-authored tracking records only*: no automatic deterioration, passive fame, social modifiers, item bonuses, NPC recognition or unapproved player visibility is introduced. Full gameplay calculation and player-facing sharing are deferred until the canonical server rules are implemented and approved.
- Existing **merchant standing** remains a separate -100 to +100 server-authoritative score, updated via `manageMerchantRelationship` in `asteriaAction`. New narrative ledgers never change merchant stock access or currency.
- Existing random tables, loot tables, encounter/reward proposals, canonical Asteria calendar, weather forecasts and document/audio/recording controllers continue to use their authenticated, idempotent server actions. No browser-side random draws, loot grants, automatic encounter insertion or unauthorized publishing is introduced.
- GM-only private collections use Firestore GM read grants. Players subscribe only to the pre-existing **separate** shared projections (`calendarPublic`, `calendarSharedEntries`, `weatherSharedReports`, `sessionPdfsShared`, `audioTracksShared`, `audioLive`, `recordingNotice`), never the private GM world, notes, concealed loot, weather drafts, private audio or recording archives.
- Every listener revalidates membership on server-confirmed snapshots; cache-only and pending writes do not establish authority. The active GM section subscribes only to the collections needed for that section.

## Available React workspaces
- **GM NPC Library:** campaign NPCs, custom creatures, deterministic concept drafts and presentation cards.
- **Relationships/Reputation:** GM-authored relationship milestones and reputation rank histories, with the authoritative merchant standing editor.
- **Quest & Notes:** private campaign notes, session logs and quest drafts; quest assignments and their rewards still use existing backend mechanisms.
- **Generators:** existing weighted random and loot table commands; secure encounter proposals and hidden treasure drafts with GM approval.
- **Asteria Calendar:** current canonical calendar/date, explicit GM configuration and server-authoritative time advancement.
- **Weather:** private biome zones, GM weather generation and review-controlled publication.
- **Archives/Audio/Recordings:** GM notes/PDF publication, published sound cue control, and consent/archive status. Existing secure upload, browser capture, playback-consent and recording services retain their authority; this initial React panel is not a full replacement for those specialized workflows.
- **Player World & Session:** published calendar events, approved forecasts, handout metadata, audio catalog and recording status. It does not expose GM-private records.

## Tests and rollout
`scripts/site-digital-gm-phase7-4.test.mjs` verifies scale contracts, CAS/revision controls, authorization, limited subscriptions, private/player data boundaries and callable actions. The Phase 7.4 GitHub workflow additionally runs the full website regression, lint, secure production build and the two-account Firebase emulator browser test.

Phase 7.4 does **not** create a production deployment. Existing legacy workflows remain available until phase 10 cutover. Remaining detailed reputation rules, advanced NPC automation, full secure PDF/audio upload UI and recording capture controls must be explicitly implemented/validated in later work rather than claimed complete.
