# Compendium cleanup

The baseline was commit `6c5164d9f1e7c312185cfcb3408ecf77dbe50338`.
It used separate content, wiki, race/class/creature, clean-compendium, and universal
indexes. Root sample folders and `content/` overlapped. The item, race, and codex
viewers had different navigation and rendering. The backend loaded two catalogs.

## Implemented architecture

`content/` is the authored source. `scripts/generate-compendium.js` parses it once
and emits `data/compendium.js`. The browser registry and trusted backend consume
that file. Compatibility APIs expose views over the same records; they do not
load independent catalogs. The shared viewer owns every compendium index, search,
filter, card, breadcrumb, detail tab, and canonical URL.

| Content | Canonical definitions |
| --- | ---: |
| Races | 201 |
| Classes | 30 |
| Creatures | 23 |
| Items | 136 |
| Spells | 3 |
| Talents | 226 |
| Professions | 1 |
| Skills | 154 |
| Origins | 4 |
| Locations | 2 |
| Theology | 104 |
| Factions | 1 |
| Lore | 1 |
| Handbook | 0 |
| Total | 886 |

The empty handbook is intentional: the five previously indexed handbook entries
were developer setup documents, now retained outside the rules catalog. Existing
game systems still provide their functional rules interfaces.

## Migration and compatibility

- `compendium-migration.json` lists 894 source/document moves, eight merges, 288
  retired empty scaffolds or inactive generated seeds, and 36 metadata conflicts
  with the retained and retired values. Source precedence is recorded per merge.
- IDs from the active catalog remain stable. Moved paths and historical wiki and
  compendium URLs remain aliases. Same-name class talents receive distinct routes;
  ambiguous old links display class/category choices.
- All 23 creatures from the old authored creature manifest are now source pages.
  The race notes and 95 detailed Artificer rank texts were merged into their
  canonical pages before removing the alternate runtime files.
- The removed generated catalogs, renderers, and snapshot script are no longer
  loaded. Completed destructive importers are retired. Generation wrappers keep
  old commands usable without recreating the old directory layout.
- Inventory, equipment, Forge, loot/rewards, shops, crafting/enchanting, GM tools,
  and search consume shared definitions. New owned snapshots preserve definition
  identity and mechanics while remaining independent mutable campaign data.
  Static and campaign-created items with the same title remain distinct.
- Racial NAC and its explicit fallback, characteristic tables, trait details,
  class talents, five-rank descriptions, galleries, and item metadata use the
  common detail shell. The live character talent graph and gameplay calculations
  remain in their existing systems.
- Query, category, filter, sort, and detail tab state are represented in the hash
  URL. Old aliases redirect; unknown references show an explicit missing-entry
  state. Search restores keyboard focus, and long result lists load in batches.

## Validation and remaining authored gaps

`compendium-validation.json` is the reproducible content audit. There are no
structural errors. Its 98 warnings record one attachment absent from the supplied
source and 97 entries with unfinished item pricing. Missing attachments render a readable label
instead of a broken image request. Existing incomplete rule prose is preserved;
this structural cleanup does not invent new game rules or missing artwork.

Automated coverage includes deterministic generation, source coverage, IDs/routes,
artwork paths and casing, alias resolution, duplicate class names, shared custom
item identity, independent inventory snapshots, exact filters, GM presentation,
NAC, preserved race mechanics, and complete talent ranks. The existing gameplay,
ownership, sync, security, resource, and Firebase integration suites remain gates.

## Rollout and rollback

Review the source moves and reports together with the implementation. Build and
deploy the website and backend from the same revision so both use the same
registry. No Firestore data migration is required. Existing owned records remain
snapshots; content updates do not silently overwrite a player's possessions.

To roll back, revert the cleanup commit and rebuild/deploy that complete revision.
Do not restore individual generated indexes alongside the canonical registry.

Authoring instructions and the schema example are in `content/README.md`.

## Verification results

- `npm test`: all suites passed, including 11 compendium regression cases.
- `npm run content:check`: 886 entries, no structural errors.
- `npm run lint` and `npm run build`: passed; generated files and website bundle refreshed.
- `npm run test:firebase`: 51 tests passed against the demo Auth, Firestore, and Storage emulators.
- `node scripts/test-xp-realtime-sync.js`: passed.
- Local Chromium review at 1440, 768, and 390 pixels: search focus, pagination,
  exact rarity filters, canonical and historical links, ambiguous talent choices,
  tab refresh, expandable race traits, talent rank pages, and responsive width
  passed, with no page exceptions or failed local asset requests.

These checks use local code and emulated services; they do not assert that a
production deployment has occurred.
