---
title: Universal Compendium Engine
type: handbook
category: Compendium Architecture
tags:
  - compendium
  - engine
  - metadata
  - phase-1
visibility: public
---

# Universal Compendium Engine

## Overview
Phase 1 adds one shared content pipeline for future Asteria compendium content.

Structured markdown files and metadata files are scanned into a universal index. The browser engine then creates searchable entries, filters, category trees, breadcrumbs, tabs, routes, GM visibility handling, and related-content links.

## Supported Content
- Races
- Classes
- Creatures
- Items
- Spells
- Talents
- Professions
- Skills
- Locations
- Religions and gods

## Adding Content
Place a markdown file in the matching folder, then run the universal generator.

Use frontmatter for shared metadata:

```yaml
---
title: Example Entry
type: creature
category: Forest Beasts
tags:
  - forest
  - beast
visibility: public
---
```

## Generator
Run:

```text
node scripts/generate-universal-compendium-index.js
```

This updates:
- `js/universal-compendium-index.js`
- `data/universal-compendium-index.json`

## Runtime Engine
The browser exposes:

- `AsteriaUniversalCompendium.entries()`
- `AsteriaUniversalCompendium.search()`
- `AsteriaUniversalCompendium.filters()`
- `AsteriaUniversalCompendium.tree()`
- `AsteriaUniversalCompendium.openSection()`
- `AsteriaUniversalCompendium.openEntryBySlug()`

The existing compendium systems remain intact while future systems can migrate into the universal engine.

