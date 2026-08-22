# Asteria Player Dashboard Redesign

## Completed

- Replaced the tall dashboard resource column and campaign banner with one connected player information bar.
- Added real character identity, level, XP, HP, MP, SP, conditional BP, currency, and campaign/session context to the bar.
- Rebuilt the dashboard summary using shared equipment, weapon, quick-item, talent, spell, skill, condition, quest, journal, and party panels.
- Preserved resource adjustment, spell casting, quick-item assignment, dashboard routing, Firebase live data, notifications, and session controls.
- Added compact player navigation and responsive panel reflow for desktop, laptop, and tablet widths.
- Added shared dashboard components, icon mappings, and design tokens for future Asteria screens.
- Fixed production chunk loading so every lazy dashboard chunk uses the same React runtime.

## Verification

- React milestone checks: 52/52 passed.
- Project smoke checks: 430/430 passed.
- Production build: passed (45 modules transformed).
- Browser QA: passed at 1920x1080, 1366x768, 1024x768, and 768x900 without page-level horizontal overflow or runtime errors.

## Compatibility

- No character, campaign, inventory, spell, talent, or Firebase data schema was replaced.
- No fake currencies, characters, locations, equipment, spells, or statistics were added.
- The currency panel reads only currencies already present in character or campaign currency data.
- No source systems were deleted.
