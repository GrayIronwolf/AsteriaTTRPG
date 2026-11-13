# Digital GM Toolkit Phase 3.1 — NPC & Creature Library

Scope: integrate the existing NPC collection and official creature index into
a GM-only searchable management view. No AI/procedural generation, custom
character-card builder, or Obsidian sync is included in this phase.

## Existing Asteria systems reused

- **Campaign NPCs:** The existing private GM World Systems collection at
  campaigns/{campaignId}/systems/gmWorkspace.world.npcs is the authoritative
  source. Records created in World Systems remain visible, and edits made in the
  new library update the same array, not a duplicate table.
- **Custom Creatures:** A bounded world.creatures collection is added within
  the same private GM workspace document. No new Firestore collection or
  security rules are needed. The collection stores descriptions and optional
  Asteria combat stats (HP/SP/MP, creature AC, initiative, XP, threat tier).
- **Official Creatures:** The existing read-only AsteriaCodexCompendium
  creatureEntries() API supplies published reference entries. Official records
  and canonical IDs never get copied or modified in campaign storage.
- **Encounters:** Saved custom creatures with valid HP and XP can be searched
  through the existing GM Main encounter builder; encounter runtime and reward
  calculations are unchanged.
- **Navigation:** A dedicated NPC & Creature Library tab and Toolkit shortcut
  are added to the authorized GM Dashboard. Normal World Systems editing,
  the existing bestiary, and Player Dashboard remain in place.

## Controls and safeguards

- Search by name, species, faction, role, habitat or threat tier; filter
  campaign NPCs, campaign creatures or official bestiary.
- Add, edit and explicitly confirm deletion of custom campaign records; keep
  public bestiary entries read-only. Preserve unknown fields on legacy NPCs.
- Bound each custom collection to 150 records, validate identifiers and
  numeric ranges, and restrict input sizes. No gameplay statistics are
  invented when an NPC is created.
- Each save uses the existing GM-only saveGMWorkspace method with a targeted
  partial world patch. Other world fields are not sent for overwrite. This
  is a client-side workspace editor and does not introduce a new callable.
- Records without complete encounter stats are valid story NPC/creature
  entries, but custom creatures without both HP and XP are not offered as
  encounter participants.
- No Asteria ID Index Code is fabricated for campaign-created entries.
  Official Compendium identifiers retain their source-defined values.

## Validation and deployment

npm run test:gm-phase3-1, npm run test:dashboard, npm test, lint,
Firebase emulator suite, and the tracked React build reproducibility
checks must succeed before merging. The branch-only compilation workflow
is removed after committing production assets. Deployment remains manual
with the project owner.

**Deferred:** Phase 3.2 NPC Generator and Phase 3.3 Custom Character Cards.
