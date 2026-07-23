# Asteria Skills

This directory is the canonical source for both the Skill Compendium and Character Forge skill selection.

Skills use this structure:

```text
content/skills/<primary-category>/<secondary-category>/<skill-slug>/index.md
```

Run the supplied importer to rebuild the database from the Asteria handbook source:

```powershell
node scripts/import-skills.js "C:\path\to\Skills"
node scripts/generate-universal-compendium-index.js
```

Each skill uses frontmatter such as:

```yaml
---
title: "Example Skill"
slug: "example-skill"
type: skill
category: "Combat Skills"
subcategory: "Weapon Skills"
skill_rank: Novice
primary_stat: Strength
secondary_stat: Dexterity
training_type: General Training
visibility: public
tags:
  - skill
---
```

Detailed source pages place their techniques in `## Ranks`. Entries without written technique pages remain visible with `Information coming soon` content and can be expanded later without changing JavaScript.
