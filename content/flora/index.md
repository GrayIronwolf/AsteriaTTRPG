# Flora Index

The Flora wiki is organized by item class and category so the item library can grow without rebuilding page code.

## Item Classes

- Common
- Uncommon
- Unusual
- Rare
- Epic
- Mythic
- Legendary
- Relic

## Categories

- Flowers
- Herbs
- Grasses
- Vines
- Aquatic
- Fungi
- Shrubs
- Trees
- Mosses

## Workflow

Add new items as markdown pages with frontmatter, then regenerate the static Flora index:

```text
node scripts/generate-flora-index.js
```

The website can then build the all-Flora page, rarity pages, category pages, and individual item pages from metadata.
