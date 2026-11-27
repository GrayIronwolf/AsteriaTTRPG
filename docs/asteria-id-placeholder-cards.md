# Asteria — ID-only Compendium card foundation

Target: `Website-Build-Test` via a review branch. No Obsidian Markdown contents are imported in this phase.

## Goal and privacy rule

The website already has authored Compendium definitions and gameplay-backed inventory/spell/talent records. Those remain displayed and functional. The new `js/asteria-index-cards.js` catalogue is a **separate metadata-only, review-gated identity bridge** for the 12 priority categories.

Only an explicitly verified `{ asteriaId, name, category, websiteId? }` tuple may be added to the catalogue. The browser must never infer an Asteria ID from a file path, file name or category position. No lore, rule text, YAML, artwork, draft text or privately scoped vault pages belong in this catalogue.

The catalogue is intentionally **empty** until IDs are verified and approved. This is not a claim that the existing vault is empty. Initial sampled vault files lacked the required `Asteria ID Index Code`; mapping them without review would generate incorrect identifiers. No actual vault content has been imported and no identifier has been reassigned.

## Card behaviours

- **Verified mapping with `websiteId`:** the existing website card displays its verified Asteria ID; its current authored page and game mechanics remain unchanged.
- **Verified mapping without `websiteId`:** an ID-only `Coming Soon` card is rendered in the shared Compendium. It displays only name, category and Asteria ID, with no gameplay or MD content.
- **No verified mapping:** no fabricated card or fabricated ID. Existing website cards continue as before.
- **After future separately approved import:** once a canonical Compendium definition is published under that exact Asteria ID, `indexCardPanel()` automatically suppresses the ID-only placeholder; the existing full Compendium viewer renders the published definition. This is a registry lookup, **not** a Dropbox sync or live import.
- **Gameplay:** existing items, spells and resources remain usable wherever already supported. A placeholder alone grants no new mechanics or ownership; no blank item is added to player inventories.

## Review procedure for index assignments

1. Verify the actual definition's `Asteria ID Index Code` in the vault. If missing, flag for assignment; do not guess.
2. Distinguish one canonical definition from rank pages, templates, drafts, duplicate notes and assets.
3. Match any existing website record by approved Asteria ID. Name-only matches must be manually reviewed.
4. Record name, priority category, Asteria ID and optional existing website ID in the frozen metadata list in `js/asteria-index-cards.js`.
5. Validate the assignments with `node --test scripts/asteria-index-cards.test.mjs` and existing `npm run test:compendium`, `npm run content:check`, build and Firebase emulator checks where accessible.
6. Approve and deploy the card catalogue separately from any content import. The original imported Markdown remains unpublished until explicitly reviewed.

## Explicitly deferred

- Replacing existing website IDs and migrating stored character/campaign references.
- Publishing Obsidian Markdown, mechanics, images or GM-only material.
- Automatic Dropbox syncing or scheduled imports.
- Rule changes, including talent rank costs and tier unlock levels.
- Adding new gameplay-defined items or spells from placeholders alone.

The existing `scripts/import-approved-vault.cjs` staged import bridge remains unchanged; its public-review safeguards continue to apply.

## Step 1.3 — Metadata catalogue initial population (27 November 2026)

Source of identifiers: the vault's existing `Asteria Definition ID Register.json`, not auto-numbered filenames or imported Markdown pages. The register is a **reservation and allocation record**. Its `allocation_status: active` values are used as the initial identity source. This does not certify that the current Markdown file itself contains the ID property or is ready to publish.

| Scope | Count |
| --- | ---: |
| All recorded allocations in the source register | 5,130 |
| Active allocations across all systems | 4,948 |
| Active allocations in Items, Resources, Schematics, Recipes, Blueprints, Patterns and Designs | 4,830 |
| Excluded due to duplicate names within a category | 201 |
| Excluded due to possible same-name website item/resource definition | 134 |
| **ID-only Coming Soon cards enabled** | **4,495** |

Cards by category: Items 2,088; Resources & Materials 884; Schematics 336; Recipes 547; Blueprints 196; Patterns 234; Designs 210.

No permanent definition ID has been invented. All mapped IDs are syntactically valid and were unique in the source register. The catalogue does not contain `sourcePath`, descriptions, Markdown text, rules, stats, images, or other content fields.

**Review required before additional mappings:** The 201 duplicate-name records may be distinct definitions, not necessarily errors. The 134 apparent website overlaps are name/slug matches only and must never be treated as verified ID relationships automatically. All 182 reserved allocations across the full register remain excluded. Races, Classes, Talents, Spells & Magic and Formulas remain unpopulated until the source IDs are assigned and verified.

**Placement:** The ID-only panel is visible from the **Items Compendium root** with its own selector for each of the seven populated categories, text searching and Show More pagination. Other Compendium domains and existing item detail pages do not receive unrelated cards.

**Future completion path:** Later, after explicit user approval and an ID migration, published canonical Markdown entries using the same assigned Asteria ID replace the placeholder in the existing Compendium. Merely retaining a file inside Dropbox does **not** publish it; this phase adds no automatic vault reader or upload.

**Operational boundary:** No modifications to the Dropbox vault, Firestore, existing canonical website IDs, inventory mechanics, spell content, or live branch.
