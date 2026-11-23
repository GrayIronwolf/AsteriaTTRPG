# Asteria Calendar & Weather — Milestone 2 Implementation

Target branch: `Website-Build-Test`. This milestone extends the **existing** React calendar, Firebase command and player-safe projection. No production deployment or unrelated Combat Command Centre change is part of this work.

## Phase 4 — Campaign clock and permissions
- One authoritative clock record per campaign, with `manual` and `realtime` modes.
- Five allowed elapsed-time multipliers (1×, 2×, 5×, 10×, 60×). The saved clock anchor is a server-generated Unix-millisecond value.
- All player clients derive display time locally from the same campaign anchor, without minute-by-minute Firestore writes.
- Switching modes, changing time or advancing the clock uses the original GM-only `manageAsteriaCalendar` transaction with revision checking and private GM history.
- The most recent eligible time action can be reversed via `undoTime` when the expected revision still matches. Undo cannot roll back unrelated calendar events or configuration changes.
- Clock fields are published to the existing `calendarPublic/current` record; actor, audit history, unpublished event contents and linked GM records remain private.
- No automated gameplay time progression is enabled for resting, combat or travel. Such links are scoped to Milestone 4.

## Phase 5 — Events and celestial cycles
- Existing event model now supports categories and recurring daily, weekly, monthly and yearly rules with positive intervals and optional final year.
- Event categories are GM-managed and hex-colour validated; category definitions are projected to the player's calendar.
- The calendar browser renders occurrences at their recurring dates rather than copying every future instance into Firestore.
- Date-specific moon phases and new/full moon notices are calculated from configured periods and offsets; repeating world cycles are also displayed.
- Public event projections carry only player-safe event details, category and recurrence. No private source-link data or GM audit metadata are added.
- Existing non-recurring events remain compatible.

## Tests and release conditions
- `scripts/calendar-milestone2.test.mjs` covers recurrence, clock arithmetic, reversible trusted commands, permissions, public projections and celestial calculations.
- The existing `test:asteria-calendar` package script includes Milestone 1 and Milestone 2 regressions.
- GitHub's full Firebase and website checks must pass on the exact reviewed branch head before the milestone is accepted or production deployment is considered.
- Website-build-test hosts and GitHub Pages workflows may publish their own artifacts. This work does not explicitly deploy Firebase or merge into `main`.

## Limitations / future milestones
- True time zone geography, distinct regional skies, climate, weather generation and Atlas integration are not part of Milestone 2.
- Celestial and repeating cycles are deterministic mathematical approximations based on configured periods; special lore-specific astronomical events need author input.
- The main Astria canon calendar is not silently overwritten by the screenshot draft; its year lengths remain unresolved.
- New public clock timestamps rely on clients having reasonably synchronised device clocks. Server clock-skew compensation is a future enhancement.
