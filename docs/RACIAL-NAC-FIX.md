# Racial Natural Armour Class fix

## Root cause

Several independent data losses reduced racial NAC to 1:

1. Imported notes used `stats["Neutral AC"]`; the calculation read only `naturalAC` and `natural_ac`.
2. The old armour migration inserted `naturalAC: 1` without recording that it was a fallback.
3. The universal index parser lowercased camel-case `naturalAC` to `naturalac`, while Forge read the camel-case spelling.
4. The race-content scanner omitted NAC from its generated race records, and the race page did not display NAC.
5. The calculator preferred saved character snapshots over the current race definition, so stale 1s persisted.

## Behaviour

The shared calculator now resolves the current race's NAC first, then imported notes and available character/race snapshots. It accepts canonical names, NAC, and legacy Neutral AC, including signed numeric strings. Final player AC is `max(racial NAC, floor(NAC + armour contributions + set bonus + active unconditional modifiers))`, following the user's request that NAC be the lowest AC. The existing 1–12 racial NAC range is retained. Conditional and expired effects retain their existing handling.

Player and GM dashboards, the GM AC inspector, inventory equip previews, Forge previews, and legacy combat use the shared armour calculation. The Race Compendium displays NAC on both Overview and Racial Sheet. Both dashboard breakdowns state the racial minimum. Creature stat blocks retain their explicit creature AC; this is not a replacement creature-stat system.

Existing characters with stale NAC snapshots use corrected race data immediately after the new website is loaded. Calculations do not mutate characters or write Firestore. Normal future Forge saves store the resolved NAC and provenance. No bulk character migration, security-rule change, index change, or new callable action is required for this fix. Existing equipment rules, ownership, rewards, and Live Sync remain in place.

## Recovered values and unresolved source data

| Race | NAC | Source |
| --- | ---: | --- |
| Cavern Sprite | 5 | Repository import, Neutral AC +5 |
| Polaris Ursa | 2 | Repository import, Neutral AC +2 |
| Frostborn Undien | 12 | Repository import, Neutral AC 12 |
| Tempestborn Undien | 11 | Repository import, Neutral AC 11 |
| Tideborn Undien | 11 | Repository import, Neutral AC 11 |
| Flowborn Undien | 6 | Uploaded Flowborn Undien sheet, Neutral AC +6 |
| Craglin | 1 | Uploaded Craglin Race Sheet, Neutral AC +1 |
| Chirolin | 1 | Uploaded Chirolin Race Sheet, Neutral AC 0, bounded to the existing minimum 1 |
| Cavarin Avian | 1 | Uploaded Cavarin Race Sheet / Cavarin (Avarin), Neutral AC 0, bounded to minimum 1 |

There are **192 other current race entries without an unambiguous verified NAC** in the sources examined. They retain 1 as an explicitly labelled fallback, rather than presenting it as authored race data. This includes placeholder races. The complete list is in `data/racial-natural-ac-report.json`.

Older uploaded Batlin sheets disagree (0 versus +3); Drakilin sheets disagree (+1 versus +2). Those values require the author's decision and have not been guessed. Spectrin has a +1 source sheet but is not a current race entry; this fix does not add unrelated race entries. Generic old armour proposals were not used to invent missing racial values.

For future race definitions, put `naturalAC: <verified number>` and `naturalACSource: authored` in `content/races/<slug>/index.md`. Importers now preserve legacy names and provenance. `scripts/repair-racial-natural-ac.mjs` records source recovery, while `scripts/sync-racial-natural-ac.mjs` updates only NAC in the existing universal/content indexes; the full race generator also retains NAC. Existing non-race index contents are preserved.

## Validation

Eight focused regression tests cover aliases, malformed data, every restored race across saved-character schemas, NAC floors, bonuses/rounding, equipped/unequipped previews, missing data, both generated indexes, the actual legacy race renderers, Forge payloads, and future frontmatter parsing. The existing armour, website, ownership, quest, blank-input and Firebase emulator suites are also run. The committed React bundle is rebuilt from this source.

Authenticated production characters were not read or modified. Merge the PR and allow the existing website publication to finish, then refresh GM/player tabs. Check a known-race test character without equipment and compare its NAC, final AC and race-page value; equipping and removing armour should return to the same racial baseline.
