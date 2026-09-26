# Asteria Compendium Content Index Engine

The website now uses generated content indexes as data for the unified Asteria Compendium. Flora, Minerals, and Materials are not separate public wiki systems anymore; they are Compendium Entries rendered through the same shared card and page viewer used by Items, Races, Classes, World, Magic, and the Handbook.

## Current Content Sources

- Flora: `content/flora`
- Minerals: `content/minerals`
- Materials: `content/materials`

## Planned Collections

- Fauna
- Potions
- Weapons
- Armor
- Artifacts

## How The Content Index Works

1. Markdown files live under `content/<collection>`.
2. Collection rules live in `scripts/wiki-engine-config.js`.
3. `scripts/generate-wiki-index.js` scans configured collections. The file name is legacy; the public UI is the compendium.
4. The generator writes `js/wiki-index.js` as a data index only.
5. `js/clean-compendium.js` imports the generated indexes and converts every item into a Compendium Entry.
6. The unified compendium renderer places entries into normal Item categories such as `Resources & Materials > Metal > Metal Ores` and handles index views, rarity/category filters, individual pages, metadata, images, and relationship links.

## Commands

Generate all configured wiki indexes:

```text
node scripts/generate-wiki-index.js
```

Generate only Flora:

```text
node scripts/generate-flora-index.js
```

## Public Routes

The static server sends collection routes such as `/flora/common/flowers/rose` back to `index.html`. The unified compendium route handler then opens the matching Compendium Entry, or opens the correct collection with rarity/category filters for broader routes such as `/flora/common` and `/flora/flowers`.

## Adding A New Collection Later

1. Add a collection entry in `scripts/wiki-engine-config.js`.
2. Create `content/<collection>` with the same item class folder pattern.
3. Add category folders for that collection.
4. Add item folders with `index.md`, an image file, and optional `variants/`.
5. Run `node scripts/generate-wiki-index.js`.
6. Map the collection into a normal compendium category in `js/clean-compendium.js` if the default Resources & Materials placement is not specific enough.

Keep item data in markdown frontmatter. Do not hardcode individual item pages in JavaScript.

## Relationship Links

The unified compendium builds an in-browser lookup from all generated collection items. If metadata or the `## Related Items` list references another generated item by title, slug, route, or alias, the shared page viewer links it automatically.

Supported relationship metadata fields include:

- `source_items`
- `related_items`
- `crafting_uses`
- `alchemy_uses`
- `culinary_uses`
- `recipes`
- `recipe_links`
- `ingredients`
- `materials`
- `outputs`
- `requires`
- `upgrades_from`
- `upgrades_to`

Future recipe, weapon, armor, potion, fauna, or artifact collections only need to be added to `scripts/wiki-engine-config.js` and regenerated. Their pages will become link targets automatically.

## Current Proof Collections

- Flora proves organic item pages, habitats, harvest seasons, alchemy/crafting use lists, and magical affinities.
- Minerals proves resource pages, deposits, refinement details, mining sources, and crafting-material links.
- Materials proves processed and refined crafting resources, source-item links, processing methods, crafting grades, and reusable recipe inputs.
