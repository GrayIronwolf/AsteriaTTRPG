# Asteria React/Vite — Phase 3.2 public Compendium entry pages

## Scope

Phase 3.1 created a read-only public catalogue; Phase 3.2 renders complete **public** definition pages using the canonical authored Compendium registry. GM-only, player-restricted, private campaign and authenticated features are not enabled. The current production website remains unchanged.

## Single content authority

- Authoring remains under `content/<domain>/<slug>/index.md` and the generated canonical `data/compendium-parts/*.json`.
- `site:dev`, `site:check` and `site:build` regenerate 14 domain-specific `public-entry-index/*.json` outputs from these existing canonical partitions. No new authoring system, legacy CSS layer or additional Firebase service is introduced.
- The generator filters non-public entries and removes GM Notes/private sections **before** publishing client assets. It allowlists exactly seven fields: ID, title, slug, domain, summary, category path, and filtered sections. It does not copy raw entry bodies, metadata, sources, files, aliases, or hidden notes.
- Build outputs are not committed and remain absent from the live production entry. A production-safe later review must still verify content marked public is genuinely appropriate for public distribution.

## Entry reader

- `#/compendium/:domain/:slug` now renders the published public entry; refreshes and `?tab=...` section bookmarks work.
- Sections are generated from H2 headings; nested headings remain in the selected section. Links are rendered as safe React elements; Markdown is never inserted using raw HTML. Arbitrary HTML, unsafe schemes, remote images and unresolved wiki-link routing are disabled.
- Duplicate legacy slugs remain ambiguous and never arbitrarily select an unrelated definition. Missing or private URLs show the same generic unavailable state, without existence disclosure.
- The feature registry intentionally leaves `compendium-entry` marked as an **unmigrated full Compendium service**; only the explicit public-data page branch in the isolated React route outlet renders a filtered public definition. All account, social, GM, dashboard and campaign routes remain fail-closed.
- User experiences: breadcrumb navigation, subject/category context, canonical definition ID, mobile-friendly section tabs, loading/error/empty states and return to catalogue.

## Testing and release boundary

- Automated source/publication checks compare each published section to its source after stripping, exercise nested and trailing private sections, verify every canonical entry remains represented exactly once, and check URL/privacy contracts.
- Browser tests check reading the actual Rule of Cool, bookmarked tabs after reload/history, race traits, duplicate talent slugs, malformed/unknown private routes and 320–1920px layouts.
- Previously passing Phase 1–3.1 regression tests remain in the existing site workflow; no Firebase deployment is required or authorised during isolated migration.
