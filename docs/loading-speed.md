# Website startup performance

Home and the Compendium now use a 45 KB dashboard bootstrap. React, its dashboard provider and the 110 KB dashboard stylesheet download only when a dashboard opens. Character, GM and owned-character bookmarks still load directly. Concurrent requests share one runtime; returning Home during a slow download preserves the current route. A failed runtime download offers a working page reload.

Home navigation uses its existing capture delegation for dynamically inserted controls. Workspace button binding scans new subtrees rather than the entire document after every mutation. BorderGlow batches position reads before decoration writes and ignores its own decorative nodes. Navigation state updates track view changes rather than every descendant mutation.

Lazy dashboard chunks use content hashes. Existing stable/versioned chunks remain available for cached clients; the bootstrap also supplies the stylesheet expected by a cached previous entry. Keep those compatibility assets available when deploying through GitHub Pages.

## Measured comparison

Production build, fresh Chromium contexts, 390 × 844 viewport, fourfold CPU throttling, local static server, external services blocked. Medians of three startup runs sampled after network idle and a further 1.8 seconds; one run per set also collected a CPU profile. These are controlled lab results, not a promise for every device or connection.

| Metric | Before | After | Reduction |
| --- | ---: | ---: | ---: |
| Startup JavaScript execution | 2,573 ms | 1,768 ms | 31% |
| Main-thread task time | 3,515 ms | 2,581 ms | 27% |
| Time in tasks lasting at least 50 ms | 1,917 ms | 1,218 ms | 36% |
| DOMContentLoaded | 1,247 ms | 1,089 ms | 13% |
| First contentful paint | 332 ms | 336 ms | Essentially unchanged |

The initial dashboard JS plus CSS falls from 304,605 to 45,174 decoded bytes (259,431 bytes deferred). The original pass retained the complete 891-definition Compendium at startup. The on-demand delivery update below removes its full page text from the startup path.

## Validation

- `npm test`, including six bootstrap loading/navigation/failure regressions.
- `npm run lint`, `npm run content:check`, `npm run build`, live XP/sync regressions and deterministic generated outputs.
- `npm run test:startup:browser`: public Handbook, dynamic Home/workspace controls, dynamic card decoration, first player and GM loads, inventory, direct owned-character links, slow-download navigation, failed-download reload, mobile width and page errors.
- Optional `ASTERIA_PREVIOUS_HTML=/absolute/path/to/previous-index.html` exercises cached previous HTML against the retained full Compendium files and React assets. Set `PLAYWRIGHT_EXECUTABLE_PATH` when using a custom Chromium installation. Playwright must be available for this opt-in browser command.
- Existing theme presets, custom colours, lighting animation modes, sliders, refresh persistence, mobile smoke alignment and reduced motion passed browser checks.

Merge deploys the website through GitHub Pages. This change does not require a Firebase backend rollout.

New production chunks omit optional debug source maps to keep release uploads smaller. Source remains in the repository; existing compatibility maps stay available for cached previous entries.


## On-demand Compendium delivery

The browser now loads `data/compendium-index.js`, a generated projection of the same 891 definitions. It contains stable identities, aliases, navigation/filter fields, summaries, structured mechanical metadata and a compact full-text word index. Search matches all entered words without fetching the full pages; permanent four-part ID searches match the exact `Asteria ID Index Code` property. Full-text words use a shared dictionary and delta-encoded word references, decoded only when searched.

Opening a page downloads its content-hashed JSON partition. Related definitions in that partition are hydrated in place, so the library, Forge, inventory and viewer retain references to the same definitions. Requests are shared, validated before mutation and reused in memory. A failed request offers a retry. A completed request cannot reopen a page after the user returns Home or selects another view. Bookmarked routes retain their requested tabs.

Forge loads complete rules for its current step before showing controls; Save waits for all rules needed to construct the character. Player/GM dashboards load their associated rules before mounting, so talent rank text, resource effects, NAC and combat calculations never operate on unloaded prose. Structured item mechanics remain available synchronously for inventory snapshots. No content definitions, IDs, owned records or backend rules change.

Generated partitions and the index come only from `content/` via `npm run content:build`. Existing `data/compendium.js`, the Handbook adapter and earlier React assets stay available for cached previous HTML and Node/backend consumers. The new React bootstrap uses its own entry URL (`asteria-react-content-v1.js`) to avoid cached older bootstraps skipping the rules-loading gate. Keep hashed partitions available while cached index versions remain in use. CI checks both the projection and every required partition for deterministic generation.

### Measured comparison for this pass

Fresh Chromium contexts, 390 × 844 viewport, fourfold CPU throttling, local static server, external services blocked. Medians of three alternating before/after runs; no concurrent test workload. Resource sizes are decoded bytes, not compressed network transfer. Browser and connection timings will vary.

| Metric | Before | After | Reduction |
| --- | ---: | ---: | ---: |
| Startup Compendium bytes | 5,184,903 | 1,895,741 | 63% |
| Startup JavaScript execution | 1,683 ms | 1,433 ms | 15% |
| Main-thread task time | 2,673 ms | 2,304 ms | 14% |
| DOMContentLoaded | 1,006 ms | 783 ms | 22% |
| First contentful paint | 296 ms | 284 ms | Small lab difference |

Tests compare all 891 fully delivered bodies, sections, metadata, artwork references, aliases and routes against the full canonical registry. Browser checks cover startup/search without page downloads, isolated Handbook and race reads, direct bookmark tabs, retry, navigation away during loading, Forge prerequisites and ranks, character/GM dashboards, cached previous HTML and phone layouts.
