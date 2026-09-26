# Compendium authoring

Every definition lives in `content/<folder>/<slug>/index.md`. Keep its artwork in
the same folder, or reference an existing shared asset in `assets/`. Categories
belong in frontmatter; do not create separate copies for inventory, Forge, loot,
crafting, shops, or a different compendium category.

| Folder | Domain |
| --- | --- |
| races | race |
| classes | class |
| creatures | creature |
| items | item |
| spells | spell |
| talents | talent |
| professions | profession |
| skills | skill |
| origins | origin |
| locations | location |
| theology | religion |
| factions | faction |
| lore | lore |
| handbook | handbook |

Example new item (`content/items/travel-mug/index.md`):

```yaml
---
id: item:travel-mug
title: Travel Mug
slug: travel-mug
domain: item
categoryPath:
  - Equipment
  - Travel Gear
itemType: Equipment
itemClass: Common
marketValue: null
marketPrice: null
pricingStatus: needs-completion
tags: []
visibility: public
aliases: []
---
```

Below the frontmatter, add `# Travel Mug`, then `## Overview`, `## Properties`,
`## Crafting`, `## Lore`, or other relevant sections. Unfinished prices are `null`,
not invented values. Add `image: mug.png` only after the actual file exists.
Filenames and references are case-sensitive. Metadata uses camelCase.

Keep an existing `id` permanently, even when renaming or moving a page. Keep old
routes and source paths in `aliases`. New talent folders include the class name,
for example `content/talents/cleric-mana-well/index.md`; set `className`,
`talentTier`, and the five `## Rank 1` through `## Rank 5` sections. Equal talent
names in different classes are separate definitions.

Run from the repository root:

```sh
npm run content:build
npm run content:check
npm test
npm run build
```

Commit the source, `data/compendium.js`, and the rebuilt `react-dist` together.
The generated file is the one browser/backend registry and is never edited by
hand. CI rejects a stale registry, invalid canonical path, duplicate identity,
missing declared artwork, invalid price, or an unindexed content page.

`window.AsteriaContent` provides `entries(domain)`, `items(customItems?)`,
`resolve(idOrAlias, domain?)`, and `resolveAll(idOrAlias, domain?)`. Ambiguous
historical names return no single result; callers must let the user choose.
Canonical links use `#/compendium/<domain>/<folder-slug>`.

An owned item is a separate snapshot with its own instance ID, quantity,
condition, owner, equipment state, and modifications. New snapshots retain
`definitionId` and `definitionVersion`; existing campaign snapshots remain valid.
Campaign custom items use `custom-item:<id>` and are never merged by display name.

Old generation commands delegate to `content:build`. Completed one-time import
commands now stop with authoring guidance because their destructive folder writes
are incompatible with the canonical layout. Their original implementations remain
in Git history. `scripts/import-racial-traits.js` still edits an existing canonical
race page.

`visibility: gm-only` controls compendium presentation, not secrecy. Public static
assets are downloadable; private campaign notes belong in the authenticated
campaign store governed by Firestore rules.
