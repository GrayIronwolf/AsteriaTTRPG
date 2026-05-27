# Asteria Class Compendium

Classes use the same compendium pattern as Items, Races, and Creatures.

## Folder Pattern

```text
classes/
  martial-classes/
    fighter/
      fighter.md
      metadata.json
      class-symbol.png
      gallery/
      talents/
        tier-1/
        tier-2/
        tier-3/
        tier-4/
        tier-5/
```

## Add A Class

1. Create a lowercase slug folder inside the correct category.
2. Add a markdown page named after the class slug.
3. Add `metadata.json` using the supported metadata fields.
4. Place class art in `gallery/` and a symbol named `class-symbol.png` when available.
5. Add talent markdown or metadata files under the matching tier folders.

Categories are navigation only. They do not apply inherited stats or rules.

