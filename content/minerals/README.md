# Asteria Minerals Content

This folder is the source of truth for Mineral compendium entries. Minerals use the shared Asteria content index engine, so new mineral pages should be added as markdown folders with frontmatter instead of hardcoded JavaScript entries.

## Folder Pattern

```text
content/minerals/1-common/ores/iron-ore/
  index.md
  iron-ore.png
  variants/
```

## Categories

- `ores`
- `crystals`
- `gems`
- `stones`
- `clays`
- `salts`
- `metals`
- `fossils`
- `arcane`

## Adding A New Mineral

1. Choose the item class folder: `1-common` through `8-relic`.
2. Choose the mineral category folder.
3. Create a lowercase slug folder.
4. Add `index.md`, an image file, and optional variant images.
5. Run `node scripts/generate-wiki-index.js`.

The generator writes the shared `js/wiki-index.js` file used by the website.
