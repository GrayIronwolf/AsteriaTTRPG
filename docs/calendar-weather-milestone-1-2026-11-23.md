# World Calendar & Weather — Milestone 1 implementation and audit

Branch: `Website-Build-Test` (case-sensitive). Milestone scope: phases 0–3, not the later weather-generation milestones.

## Phase 0 — Existing system inventory

The calendar was **already implemented** as React components and trusted Firebase commands. It was not replaced with a parallel static calendar.

| Concern | Existing implementation | Milestone 1 treatment |
| --- | --- | --- |
| Calendar arithmetic | `src/state/asteriaCalendarModel.mjs` | Extended existing model with custom month/weekday/era definitions, leap rules, serial dates, year summaries, moon/cycle periods. |
| GM calendar UI | `src/dashboards/AsteriaCalendarWorkspace.jsx` | Replaced the old fixed twelve-month rules form; retained existing GM clock and event actions. |
| Player calendar UI | `PlayerAsteriaCalendar` in same module | Added shared read-only day/month/year browser; retained player-safe public subscriptions. |
| Calendar persistence | `functions/asteriaCalendarCommands.mjs` | Kept current GM-transaction write path and public projection; added definition versions on configuration. |
| Firebase client bridge | `src/firebase/asteriaFirebaseService.js` | Reused existing functions/subscriptions; no parallel client. |
| Existing campaign records | `campaigns/{id}/calendarState/current`, `calendarPublic/current`, `calendarEntries`, `calendarSharedEntries` | Unchanged paths and access model; legacy documents without new optional fields use established labels. |
| Styles | `src/styles/asteria-calendar.css` | Extended existing stylesheet rather than creating a separate UI framework. |
| Weather engine | `src/state/weatherEnvironmentModel.mjs`, `functions/weatherEnvironmentCommands.mjs` | Preserved; weather integration is Milestone 3 and does not belong in this rollout. |

## Phase 1 — Calendar engine

- Supports 1–24 named months, each with independent length; 1–14 named weekdays; 1–12 seasons; 1–20 eras.
- Supports leap-day rules with integer intervals, insertion after a month, phase offset and optional removal from weekday counting.
- Supports custom hours/minutes, continuous or month-reset weekday sequence, multiple moons and named repeating cycles.
- Provides deterministic date-to-day-index and date-to-minute-index conversion and reverse conversion.
- Preserves the old 12-month/8-weekday configuration when reading an existing campaign record without the new fields.
- Records `definitionVersion` on trusted GM configuration changes, distinct from the transaction `revision` used for conflict detection.

Limitations: leap rules currently insert additional days only *after the regular days of a month*. Richer intercalary calendars and historical era transition offsets require separate design. A calendar with active dated events cannot change its definition; this guard predates this milestone and remains in place.

## Phase 2 — Configuration editor

- Editable, orderable weekdays, months, eras and seasons; custom leap-day rules; moon and cycle settings.
- Configurable world clock and weekday flow.
- JSON validation, import and export of an unsaved configuration draft.
- Optional 13-month screenshot-derived template. It **does not** automatically overwrite any official canon.
- Screenshot reference contains 383 days by listed month lengths; accompanying season page claims a 378-day year. This discrepancy remains a canon decision and the template is labelled a draft.

The new UI writes through the existing `manageAsteriaCalendar` callable only when the GM explicitly presses Save. Server-side input validation and GM permission checks remain authoritative.

## Phase 3 — Calendar interface

- Read-only day, month and year browsing with event labels, date selection, today jump and period navigation.
- The same browsing component is used by GM and player calendar screens.
- Player list and grid only receive the existing party-safe event projection. Private event source references are not exposed.
- Responsive controls fit mobile screens; wide custom-week calendars may scroll horizontally on narrow devices.
- No new Firebase project or backend infrastructure is needed.

## Compatibility and validation

- Old stored `months: [{days,season},...]` records stay readable: missing names are resolved from the previous canonical names.
- Calendar events remain stored in the same collections; they are not migrated or rewritten by this milestone.
- GM history remains available and changes remain revision checked.
- `scripts/calendar-milestone1.test.mjs` exercises old documents, variable months, leap boundaries, serial conversion, weekday handling and cycle arithmetic.
- The existing `npm run test:asteria-calendar` script now includes the new tests.
- GitHub Actions `Firebase and website checks` is triggered by pushes to the test branch. Check the latest head SHA before approval; changes are **not production deployed** by this work.

## Remaining milestones

Milestone 2: campaign permissions/time advancement polish, historical events and celestial event presentation.
Milestone 3: regional climate and weather generation/overrides.
Milestone 4: gameplay integration, canvas/atlas/second-screen rollout and final hardening.

## Review before production

1. Verify calendar and full-site CI are green for the **latest** test-branch commit.
2. Inspect month, year, day and editor views on desktop and mobile.
3. Verify player roles cannot read GM-only calendar entries or write rules.
4. Confirm which month names/lengths and eras are official canon before loading the screenshot draft into a live campaign.
5. Deployment to production must be an explicit separate decision.
