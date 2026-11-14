# Digital GM Phase 8.2 — Weather & Environmental Generator

## Features

- GM creates up to 40 named weather zones/landscapes. Each stores an Asteria region, biome (temperate, forest, grassland, desert, mountain, tundra, swamp, coast, ocean, jungle, volcanic, urban or other), variability setting and optional private GM notes.
- Server-controlled weighted generation of 1–7 days of forecast at the **current Phase 8.1 Asteria Calendar date**, respecting configured month lengths and optional seasons. Probabilities are non-canonical suggestions and are labeled as such in the UI.
- Natural weather conditions plus **opt-in** arcane weather. Each generated day includes visibility, travel, hazards and a narrative description.
- GM may override individual days with a condition, intensity and private reason. All modifications use server validation and versioned records.
- Newly generated forecasts are **GM-private drafts**. An explicit GM approval publishes only the safe forecast projection to campaign players; withdrawal removes visibility. Player Character Dashboard has a read-only Weather section.
- Never automatically adjusts attack rolls, skill checks, movement, travel costs, rest, damage, exhaustion, XP, items or the calendar. Existing game mechanics stay unchanged.
- Generation uses crypto.randomInt from the trusted Firebase action; arbitrary client-supplied weather results are not accepted.
- Four collections: weatherConfig, weatherZones, weatherReports (GM-only reads), weatherSharedReports (campaign member reads). All direct client writes are denied and mutations require authorized server actions.
- Supports archived zones and forecasts, and prevents stale edits with revision checks.

## Canon integrity

The repository's Weather Reading skill and Weathered Predator talent refer to weather but do not define a universal numerical weather mechanic. This feature is therefore advisory and does not add unapproved game rules. Phase 8.1's documented Asteria Calendar definitions remain intact.

## Verification

`npm run test:weather-environment`; Firestore emulator `scripts/digital-gm-phase8-2-emulator.test.mjs`; existing Digital GM 6.1–8.1, dashboard and combat tests; lint, production website build, full repository tests and frontend bundle verification.

## Release — consolidated Phase 8

**Do not run Deploy Firebase backend (manual) after this phase.** Phase 8.2 may merge to main after checks; Phase 8.3 will be the next development change. Run **one manual production Firebase backend deploy after Phase 8.3** merges, selecting latest `main`, operation `deploy`, confirmation `DEPLOY-ASTERIA-PRODUCTION`. GitHub Pages may still publish frontend changes between backend releases.

## Acceptance after final release

1. Configure Phase 8.1 calendar, then create a tundra weather zone and a desert zone.
2. Generate a private 3-day forecast spanning a configured month boundary; verify Asteria date rollover.
3. Confirm the player sees nothing before approval.
4. Change weather intensity on one day and approve; verify only a sanitized projection appears for campaign players.
5. Unpublish; confirm player forecast disappears.
6. Verify no direct writes or reads of GM-private weather through client SDK.
7. Confirm existing checks, cooldowns, combat, rest and loot are unaffected.

Next: Phase 8.3 — Interactive World Map.
