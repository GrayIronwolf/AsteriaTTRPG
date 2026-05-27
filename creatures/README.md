# Asteria Creature Compendium

Creatures use the same compendium pattern as Items, Races, and Classes.

## Folder Pattern

```text
creatures/
  animals/
    mammals/
      dire-wolf/
        dire-wolf.md
        metadata.json
        creature-image.png
        gallery/
        loot/
        variants/
```

## Add A Creature

1. Create a lowercase slug folder inside the correct creature category.
2. Add a markdown page named after the creature slug.
3. Add `metadata.json` using the supported metadata fields.
4. Place creature art as `creature-image.png` when available.
5. Add variant and loot notes inside their folders.

Creature categories are navigation only. Encounter roles, threat tiers, loot, and soul data live in metadata.

