# Asteria Calendar & Weather — Milestone 3

Implementation branch: `Website-Build-Test`. This update modifies the established Digital GM Toolkit weather system in place. It does not introduce extra Firebase projects or cloud infrastructure.

## Phase 6 — Locations and climates

- Reuses the established campaign `weatherZones` records with optional continent, kingdom, settlement, latitude band, elevation, coastal influence, season offset, temperature offset, and private links to existing world atlas map markers.
- Keeps the original `name`, `region`, `biome`, `volatility`, `magicWeather` and `gmNotes` schema valid. Existing zones do not require migrations.
- Offers twelve named Astria continents for convenience. Their climate types and temperatures are **not predetermined**: only the GM can define a region's climate.
- Adds polar, tropical and rainforest biome presets, plus a baseline profile for each existing biome. Values are configurable simulation suggestions, not official Astria lore.
- Validates atlas map/pin pairs against existing campaign map records server-side. Links are internal-only and never exposed in published forecasts.

## Phase 7 — Deterministic regional weather

- New generated reports use a campaign-scoped, zone-specific and date-specific deterministic pseudorandom seed, with independent daily draws. Re-generating a later overlapping period reproduces the same forecast for unchanged region settings.
- Weather now records temperatures (mean/low/high/apparent), precipitation, wind speed and direction, humidity, cloud cover and visibility.
- Daylight duration and sunrise/sunset estimates derive from the selected custom calendar clock, configured seasons and latitude band; these are **illustrations**, not authoritative Astria celestial mechanics.
- Climate inputs include biome, latitude band, elevation, temperature offset, coastal flag and seasonal hemisphere setting; weather risks remain descriptive, never automatic skill or combat modifiers.
- New reports preserve generator snapshots and historical data. Older saved forecast records continue to display their original narrative fields.
- GM manual overrides recompute condition-specific metrics without replacing untouched days.

## Phase 8 — Weather and GM interface

- The existing `WeatherEnvironmentWorkspace` includes location forms, a preview of baseline climate, optional atlas map/pin selector, extended forecast cards and unchanged publication/withdrawal controls.
- Player weather continues to subscribe only to the safe `weatherSharedReports` projection; private GM notes, atlas IDs, random seeds, revision internals, actor IDs and override reasons remain inaccessible.
- The public projection expressly allowlists weather metrics and visible settlement/kingdom/continent names.
- Climate editor, forecast cards and location fields share the existing responsive `weather-environment.css` design.

## Limitations

- This milestone provides daily weather generation and short-term published forecast views, not hourly or real-world meteorological forecasts.
- Forecasts are limited to seven days by the existing safety and cost bounds; GM may generate subsequent windows.
- Climate profiles are editable presets. Continental climates and Astria moon/daylight relationships require canon confirmation and cannot be inferred solely from maps.
- Automatic gameplay penalties and travel resource costs are excluded until Milestone 4.
- Atlas links refer to existing map markers; they do not move parties or generate map tiles.

## Verification and release

- Existing Digital GM Weather Phase 8.2 regressions remain in `npm run test:weather-environment`.
- New `scripts/calendar-weather-milestone3.test.mjs` tests deterministic forecasts, climate validation, legacy zones, GMT-only authorization, atlas link checks and player projection privacy.
- A dedicated `Verify Calendar Weather Milestone 3` GitHub Actions workflow runs these tests, module parse checks and lint.
- Full `Firebase and website checks` must pass against the **current branch HEAD** to be considered verified. Multiple parallel website features may change the branch while tests run.
- Committed changes do not merge into `main` and no Firebase production deployment is performed here.
