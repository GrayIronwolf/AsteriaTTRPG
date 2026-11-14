# Digital GM Toolkit — Phase 8.1: Asteria Calendar Integration

## Canon source and unresolved mechanics

The existing Obsidian vault at `Asteria TTRPG / 23. Asteria Lore / Seasons, Months, Days & Calendar` establishes:

- Eight weekdays: Mystday, Embiday, Wynday, Thunday, Faeday, Lunisday, Solday, Elisday.
- Twelve months: Aork, Barolm, Crexis, Tylonn, Aquol, Sularis, Hamtol, Vofenn, Kirem, Straph, Vlumis, Whystol.
- Four seasons: Summer, Autumn, Winter, Spring.
- Five eras: AOP, TBG, ABE, EOLG, EOSR.

The available vault entries were folders without readable rules for month length, day duration, weekday epoch, or season-to-month mapping. Rather than invent canon, these are explicit GM-configurable campaign fields.

## Feature scope

- New GM Dashboard **Asteria Calendar** page and GM Toolkit shortcut.
- The GM configures the twelve month lengths, time units, weekday anchor, optional month seasons, initial era/date, and advances the date by minute/hour/day/8-day-week/month/year.
- The existing `asteriaAction` backend verifies current campaign GM membership and uses transaction-backed revision checks plus idempotent request receipts. Calendar history records GM actions (latest 50).
- Players get a **Calendar** page within their linked Character Dashboard. A server-produced shared calendar snapshot shows campaign time without private GM history.
- The GM can create, edit, archive and explicitly share up to 120 dated event entries. Categories include festivals, quests, travel, events, timeline, economy, other.
- GM calendar entries may link to existing campaign quests, world events, timelines and economy trade routes. References are verified on the server using saved campaign records; private source contents are never copied into shared entries.
- The Firestore collections `calendarState` and `calendarEntries` are GM-readable only. `calendarPublic` and `calendarSharedEntries` are campaign-member-readable only. **All direct client writes are forbidden** to all four; server transactions maintain projections.
- No automatic rest, combat effects, resource regeneration, weather, travel actions, quest state changes, or external time synchronization. Existing encounter, battle map and inventory systems remain unchanged.

## Deployment

**Hold Firebase production deployment until Phase 8.3.** Phase 8.1, 8.2 and 8.3 may each be built, tested and merged individually, then the repository owner runs the existing manual Firebase backend deployment once from the merged `main` head.

GitHub Pages may publish after each merge. Until final backend deployment, the Calendar UI and subscriptions may not be functional on production and should not be treated as live.

## Verification

- `node --test scripts/digital-gm-phase8-1.test.mjs`
- Firestore emulator: `scripts/digital-gm-phase8-1-emulator.test.mjs`
- Prior Digital GM phases 6.1–6.3, 7.1–7.3; dashboard/combat regressions, lint and production website build.
- Standard `npm test` and `npm run test:firebase` include Phase 8.1.
- Merge after the final compiled frontend bundle matches source and all GitHub checks pass.

## Live acceptance after Phase 8.3 deployment

1. Configure month lengths and first campaign date as GM; verify day/month/year and eight-day-week rollover.
2. Confirm date updates across GM and Player Dashboards.
3. Create a GM-private event and confirm players cannot access it.
4. Publish an event with a linked campaign quest or world record; confirm players see only its public calendar text.
5. Archive/unpublish and verify it disappears from the player view.
6. Attempt direct Firestore writes and confirm denials.
7. Confirm ordinary combat turns, rest effects, cooldowns, XP and inventory remain unchanged.

**Next: Phase 8.2 — Weather & Environmental Generator.**
