# Asteria Calendar & Weather — Milestone 4 implementation

Target branch: `Website-Build-Test`. The update extends existing React/Vite dashboard canvases, the calendar's authenticated GM transaction, published Atlas maps and the signed-in presentation view. It does not add a second clock or Firebase collections.

## Phase 9 — Gameplay chronology

- Shared `calendarGameplayModel.mjs` validates GM-approved durations: Light rest 120 minutes, Short rest 240, Long rest 480; bounded custom travel, encounter and downtime durations.
- Calendar previews use the campaign's single authoritative clock and configured calendar definition. Custom months, leaps, hours/day and minutes/hour are supported.
- The GM Calendar has a preview and confirm panel. Existing `manageAsteriaCalendar` transaction handles `advanceActivity` with GM permission, revision checking, private history, and eligible undo.
- Activity updates write only `calendarState/current` and `calendarPublic/current`. It never awards recovery, changes HP/SP/MP, resolves rests, consumes AP, changes combat rounds, moves characters, modifies quest records or grants XP.
- The rest, combat, travel and quest systems retain their own permissions and gameplay mechanics; cross-system atomic effects are deliberately not inferred by the clock.

## Phase 10 — Dashboards, Atlas, second screen

- GM and Player main dashboards have an optional `worldContext` panel using the existing freeform canvas allowlists and saved layout engine.
- Context subscribes to existing calendar, event and weather sources. The player receives only published forecasts and shared calendar events, with links to the existing pages.
- The Atlas now matches the weather forecast to the effective campaign date rather than showing the first saved forecast day.
- Atlas GM route controls may advance the campaign calendar for explicitly confirmed route durations, with optimistic revision checks. The Atlas never moves party markers or changes resources.
- The signed-in player world-map presentation scene can display published weather and current date. Restricted hybrid viewers are excluded, and blackout/other scenes do not mount these extra listeners.
- Responsive styling accompanies the optional dashboard panel and second-screen overlay.

## Phase 11 — Migrations, tests, polish

- New `scripts/calendar-weather-milestone4.test.mjs` covers fixed rest rules, custom date rollover, player-safe selection, forged/unauthorized actions, GM history/undo, panel navigation and public overlays.
- `npm run test:asteria-calendar` includes these regressions. Milestone 4's dedicated workflow runs calendar, weather, Atlas, module syntax and lint checks.
- Existing saved campaign calendars, player/GM canvas preferences, weather zones, reports, Atlas maps, routes and presentation models remain in their original storage paths; no forced migration or parallel backend layer.
- The user-supplied calendar screenshots contain unresolved 378-vs-383-day year definitions. No official chronology was silently rewritten.
- Full website CI is independently required for release approval; no production Firebase deployment or merge to `main` is performed.

## Known constraints

- Automatic coupling to an actual completed rest, journey or encounter would require a separate server-side atomic workflow and explicit GM policy. This milestone provides explicit chronological approvals only.
- Atlas travel legs over 10,080 in-world minutes require separately approved segments.
- Hourly weather, true astronomy, long-term forecasting and restricted-viewer weather broadcasting are future choices rather than silently enabled features.

## Final verification record

- The targeted Milestone 4 regression workflow has passed after the dashboard compatibility fixes.
- The existing React/Vite compiled bundle was regenerated and committed to the test branch through its approved GitHub Actions workflow.
- Final combined Firebase/website CI must be checked at the post-build commit before declaring the test branch release-ready.

## Test-branch integration verification (24 November 2026)

- Milestone 4 gameplay, calendar/weather, atlas and player presentation source is already integrated into Website-Build-Test.
- A separate dice-workspace regression was repaired by rendering saved presets using only the dice expression's allowed configuration fields. The strict validator still rejects extraneous preset metadata, and Phase 4 regression coverage was added.
- The React/Vite bundle compilation workflow has committed the synchronized tracked assets to Website-Build-Test. The final Firebase and website workflow is required to pass against this updated branch state before release sign-off.
- This verification does not merge into main or deploy Firebase production.

## Combined branch verification — dice render and physical tower fixes

- Repaired the dice preset display to pass only validated roll fields to `diceExpression`; added regression coverage.
- Addressed a sporadic real-physics tower face mismatch with up to three additional visual attempts of the same server-confirmed result. No extra server roll is permitted, and the final face/exit verification remains strict.
- React/Vite compilation is triggered on every dice workspace or dice-engine source change, independently of slow Chromium physics acceptance tests.
- Generated website artifacts are synchronized on `Website-Build-Test`; the full website checks must pass against the combined commit before final approval. No merge to `main` or Firebase production deployment is requested.
