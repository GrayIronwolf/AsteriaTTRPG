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

The initial dashboard JS plus CSS falls from 304,605 to 45,174 decoded bytes (259,431 bytes deferred). The canonical 891-definition Compendium is unchanged and still loads at startup; domain-level content splitting is a separate future optimisation.

## Validation

- `npm test`, including six bootstrap loading/navigation/failure regressions.
- `npm run lint`, `npm run content:check`, `npm run build`, live XP/sync regressions and deterministic generated outputs.
- `npm run test:startup:browser`: public Handbook, dynamic Home/workspace controls, dynamic card decoration, first player and GM loads, inventory, direct owned-character links, slow-download navigation, failed-download reload, mobile width and page errors.
- Optional `ASTERIA_PREVIOUS_ENTRY=/absolute/path/to/previous-entry.js` exercises a cached previous entry against the retained stable chunks. Set `PLAYWRIGHT_EXECUTABLE_PATH` when using a custom Chromium installation. Playwright must be available for this opt-in browser command.
- Existing theme presets, custom colours, lighting animation modes, sliders, refresh persistence, mobile smoke alignment and reduced motion passed browser checks.

Merge deploys the website through GitHub Pages. This change does not require a Firebase backend rollout.

New production chunks omit optional debug source maps to keep release uploads smaller. Source remains in the repository; existing compatibility maps stay available for cached previous entries.
