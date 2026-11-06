# Asteria — Private Obsidian Vault ↔ Public Website GitHub Bridge

## Current connection

- **Private content source:** `GrayIronwolf/Asteria-Obsidian-Vault`
- **Public website:** `GrayIronwolf/AsteriaTTRPG`
- **Direction:** content repository → staging pull request in website repository (one-way)
- **Trigger:** manual GitHub Actions `Import approved Asteria vault content for review` plus six-hour scheduled checks after credential setup
- **Live website:** unchanged; publishing into the running Compendium is deliberately **not** enabled

This prevents a full Obsidian checkout from publishing private campaign material, unpublished lore, or GM-only information. The current website Compendium and its stable identities remain untouched until the separately reviewed Phase 8 ID migration and data mapping are complete.

## Complete this GitHub setup (repository owner)

The GitHub connector cannot create or inspect Actions secrets. Create **two repository Actions secrets in the public website repository**:

1. `ASTERIA_VAULT_READ_TOKEN`: a fine-grained GitHub PAT restricted to `GrayIronwolf/Asteria-Obsidian-Vault` with **Contents: Read-only**. This is used only for the checkout step.
2. `ASTERIA_WEBSITE_PR_TOKEN`: a separate fine-grained GitHub PAT restricted to `GrayIronwolf/AsteriaTTRPG` with **Contents: Read and write** and **Pull requests: Read and write**. This token permits a workflow-created PR to trigger normal PR CI. Do not paste either token into chat or a Markdown note.

In GitHub: open `GrayIronwolf/AsteriaTTRPG` → **Settings → Secrets and variables → Actions → New repository secret**. The menu may vary by GitHub account setup. Tokens can be limited to the named repositories and given an expiration. Only the public website repository stores these credentials.

Then open **Actions → Import approved Asteria vault content for review → Run workflow**. If no approved pages exist yet, the action validates an empty export and does not create a PR or change the website.

## Approved pages only

The private source's `publish/public/` directory is initially empty (except README). Keep your original Obsidian vault and GM secrets elsewhere in the private repository. Each export must be deliberately curated and explicitly approved.

Example `publish/public/items/blue-primdale/index.md`:

```markdown
---
title: Blue Primdale
slug: blue-primdale
domain: item
id: 07-05-001-001
Asteria ID Index Code: 07-05-001-001
visibility: public
publish: true
publicationApproved: true
categoryPath:
  - Flora
  - Flowers
tags:
  - herb
---

# Blue Primdale

## Overview

Public lore about this flower.
```

The importer accepts only whitelisted metadata fields; it rejects GM-only flags/headings, secrets headings, unresolved Obsidian wiki links, HTML scripts/embeds, malformed IDs, conflicting stable IDs, symlinks, unexpected files and duplicate definition IDs. It writes exclusively to `content-import/approved/` in the website repository, plus a manifest containing IDs and SHA-256 hashes. It does not touch `content/`, `data/`, art assets, gameplay or Firebase.

Review the resulting website PR carefully. **The staged PR branch is public**, so do not approve any note that is not safe for everyone to read. Private content must remain out of this export.

## Later Phase 8 integration

The current Compendium has 891 canonical entries and uses stable IDs such as `race:content-races-aarakocra-avian-index`; the permanent Asteria four-part ID convention requires a deliberate, audited mapping. **Do not replace existing IDs automatically.** The bridge is staged but cannot update live Compendium definitions until an ID mapping/approval and migration strategy are implemented and tested.

The website periodically checks the *approved export only* after credentials are configured. No continuous or two-way Obsidian vault / Dropbox sync is enabled. No Dropbox changes were made.
