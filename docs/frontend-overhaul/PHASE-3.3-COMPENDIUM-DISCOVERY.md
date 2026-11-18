# Phase 3.3 — Public Compendium navigation and discovery

## Implementation
- Reuses Phase 3.1 catalogue and Phase 3.2 filtered public definitions, with one React route and no additional legacy CSS/JavaScript controller.
- Adds category hierarchy from existing `categoryPath` metadata, with progressive facets, descendant counts, clickable breadcrumbs and a clear/reset action.
- Adds stable query parameters `path` (repeated, one per depth), `sort` (`relevance`, `az`, `za`), and preserves existing `group`, `category`, `domain` and `q` links.
- Search preview responds immediately using catalogue metadata. Submitting a query creates a shareable URL and searches normalized tokens from the already-filtered public section bodies, ranked by title, tag, category, summary and text; results fall back to metadata when full-text shards cannot load.
- All indexes are derived at build-time from Phase 3.2 public-only shards, never the raw Canonical Compendium, private campaign notes or Firebase data. Output is domain-sharded, lazy-loaded and gitignored.
- Public entry deep links and existing protected route behavior remain unchanged. A malformed path or invalid sort never grants additional access.
- Regression includes source tests, category/filter browser history, link reload, ranking, empty states, mobile/desktop 320–1920px layout and earlier phase suites.

## Release boundary
This is still an isolated React/Vite preview. No production HTML, Firebase configuration, security rules or GM/Player data has been changed. No deployment is required.
