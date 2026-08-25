# Asteria Materials Content

Materials are processed, refined, crafted, or gathered resources used by crafting systems, professions, recipes, settlements, and trade.

## Folder Pattern

Each material item lives in its own lowercase slug folder:

```text
content/materials/<item-class>/<category>/<item-slug>/
  index.md
  item-slug.png
  variants/
```

Example:

```text
content/materials/1-common/metals/iron-ingot/
  index.md
  iron-ingot.png
  variants/
```

## Item Classes

- `1-common` / Common
- `2-uncommon` / Uncommon
- `3-unusual` / Unusual
- `4-rare` / Rare
- `5-epic` / Epic
- `6-mythic` / Mythic
- `7-legendary` / Legendary
- `8-relic` / Relic

## Categories

- `metals`
- `woods`
- `fibres`
- `leathers`
- `stones`
- `glass`
- `ceramics`
- `alloys`
- `reagents`

## Frontmatter Pattern

Use metadata first, then readable page sections. The generator reads the frontmatter and builds index, class, category, and item pages automatically.

```yaml
---
title: Iron Ingot
slug: iron-ingot
kingdom: Material
item_class: Common
category: Metal
subcategory: Ferrous
material_family: Iron
source_items:
  - Iron Ore
processing:
  - Smelting
  - Casting
crafting_grade: Basic
durability: Moderate
mana_density: Very Low
market_value: 10
market_price: 15
affinities:
  - Earth
crafting_uses:
  - Basic Weapons
  - Basic Armor
alchemy_uses: []
culinary_uses: []
image: iron-ingot.png
tags:
  - materials
  - common
  - metal
---
```

## Regenerate The Index

After adding or editing materials, run:

```text
node scripts/generate-wiki-index.js
```

The static site reads `js/wiki-index.js`, so no individual item should be hardcoded into the renderer.

Use numeric Marks for both `market_value` (the player selling baseline) and
`market_price` (the player purchase baseline). Market Value must be lower than
Market Price when both are positive. Use `0` / `0` for an item that is not
normally tradeable; `market_price: null` is reserved for migrated legacy items
that still need pricing completion.
