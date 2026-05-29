---
title: Phase 2 Content Database Expansion
type: handbook
category: Compendium Architecture
tags:
  - compendium
  - database
  - metadata
  - phase-2
visibility: public
---

# Phase 2 Content Database Expansion

## Overview
Phase 2 expands the Universal Compendium Engine into a content database foundation.

Each major Asteria database now supports folder-based markdown or MDX entries, YAML frontmatter, searchable metadata, generated routes, category trees, breadcrumbs, tabs, player visibility, and GM-only visibility.

## Supported Databases
- Races
- Classes
- Creatures
- Items
- Talents
- Spells
- Professions
- Skills
- Factions
- Locations
- Religions and gods
- Lore

## Content Pattern
Use lowercase folder names and clean slugs.

```text
database-root/
  primary-category/
    secondary-category/
      entry-slug/
        entry-slug.md
        metadata.json
        image.png
        gallery/
```

## Frontmatter Pattern
Use shared fields first, then database-specific fields.

```yaml
---
title: Example Entry
type: creature
category: Forest Beasts
visibility: public
lore_status: Common Knowledge
tags:
  - example
---
```

## Generator
After adding content, run:

```text
node scripts/generate-universal-compendium-index.js
```

This refreshes the generated browser indexes:
- `js/universal-compendium-index.js`
- `data/universal-compendium-index.json`

## Notes
The site remains static for now. New files appear after the generator is run. A future build step can run this automatically before packaging or publishing.

