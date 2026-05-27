# Asteria Flora Content

This folder is the source of truth for Flora compendium entries. Add one folder per flora item, keep folder names lowercase, and run the Flora index generator after adding or editing item pages.

## Folder Pattern

Use the rarity folder, then the category folder, then the item slug:

```text
content/flora/1-common/flowers/rose/
  index.md
  rose.png
  variants/
```

## Rarity Folders

- `1-common`
- `2-uncommon`
- `3-unusual`
- `4-rare`
- `5-epic`
- `6-mythic`
- `7-legendary`
- `8-relic`

These map to Asteria item classes: Common, Uncommon, Unusual, Rare, Epic, Mythic, Legendary, and Relic.

## Category Folders

- `flowers`
- `herbs`
- `grasses`
- `vines`
- `aquatic`
- `fungi`
- `shrubs`
- `trees`
- `mosses`

## Adding A New Flora Item

1. Create a lowercase slug folder in the correct rarity and category.
2. Add `index.md` with the frontmatter schema below.
3. Add the primary image named in the `image` field.
4. Put alternate art, seasonal forms, or regional variants in `variants/`.
5. Run `node scripts/generate-flora-index.js`.

## Frontmatter Schema

```yaml
---
title: Rose
slug: rose
kingdom: Flora
item_class: Common
category: Flower
subcategory:
habitats:
  - Plains
  - Gardens
climate: Temperate
regions: []
harvest_season:
  - Spring
  - Summer
mana_density: Very Low
toxicity: None
growth_difficulty: Easy
market_value: Low
affinities:
  - Life
crafting_uses:
  - Perfume
  - Minor Healing Potions
alchemy_uses: []
culinary_uses: []
image: rose.png
tags:
  - flora
  - common
  - flower
---
```

## Page Sections

Every item page should use these headings:

```md
# Item Name

## Overview
## Appearance
## Habitat
## Harvesting
## Uses
## Alchemy Uses
## Crafting Uses
## Culinary Uses
## Magical Affinities
## Market Value
## Related Items
```

The static website reads generated metadata from `js/flora-index.js`. The markdown files remain the long-term editable content source.
