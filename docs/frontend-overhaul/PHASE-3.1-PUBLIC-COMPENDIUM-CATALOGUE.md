# Phase 3.1 — Public Compendium catalogue foundation

The previous Phase 2.1–2.5 work already migrated the header, Home, navigation and appearance, which Phase 0 had originally allocated to Phase 3. Phase 3.1 now begins the next unmigrated area: read-only public Compendium catalogue browsing.

## Architecture
- Content authority remains `content/<domain>/<slug>/index.md` and canonical generated `data/compendium-parts/*.json`. No second authoring store.
- `scripts/site-compendium-public-index.mjs` emits 14 **generated** public-only catalogue JSON shards before `site:check` and `site:build`. Generated files are ignored by Git and rebuilt from committed canonical content.
- The generator excludes all entries whose canonical visibility is not **public**, all `gmOnly` entries and metadata flagged GM-only. Only nine public catalogue fields are copied; raw body, Markdown, metadata, GM Notes and source references never enter the public catalogue.
- `frontend/src/compendium/publicCatalogue.mjs` lazily imports each public shard through Vite's `import.meta.glob`, caches requests, and evicts rejected loads for retry on navigation.
- `CompendiumCataloguePage` renders real catalogue results for public `handbook`, `lore`, `compendium` routes using canonical hash links. It supports search, explicit domain selection, top-level categories, result counts, and incremental 48-item batches.
- Full `compendium-entry` pages remain safe placeholders until the separate full-content migration with GM visibility and markdown sanitisation. All private account, campaign and dashboard routes remain locked.
- The complete Compendium service is intentionally still **preview-only** in `featureRegistry.mjs`. Phase 3.1 enables only the separate public catalogue view without granting any full Compendium service or protected permissions.
- Zero legacy HTML/CSS/JS changes; no Firebase calls or extra project. Final retirement remains covered by the Phase 2.5 ledger.

## Validation
`site:check` regenerates public shards, checks canonical parity and excludes non-public entries. `site:build` also regenerates shards before Vite starts so every preview build is current. Browser CI validates Rule of Cool search, real race/item browsing, canonical deep links, guest-only behavior, screen widths 320–1920 px, and no remote requests. All prior phases continue running. No deployment is permitted at this stage.

## Follow-on
Phase 3.2: robust full public entry rendering, section tabs, safe Markdown, and canonical links. Later steps migrate the complete Compendium category/search index and permission-aware access where required.
