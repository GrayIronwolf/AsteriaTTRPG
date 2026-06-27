# Asteria Race Content

This folder is the source of truth for Race Compendium entries.

Every race lives directly under `content/races/<race-slug>/index.md`. Do not place races inside category folders. Category navigation is generated from frontmatter fields such as `raceCategory`, `secondaryCategory`, and `tertiaryCategory`.

To add a race:

1. Create a lowercase folder directly in this directory.
2. Add an `index.md` file using the race frontmatter schema.
3. Add optional image paths under `images.male` and `images.female`.
4. Run `node scripts/generate-race-content.js`.

The generator rebuilds `js/race-compendium-data.js`, which the Race Compendium, Character Forge, and Player Dashboard use through the existing shared race system.
