# Digital GM Phase 10.2 — Unified Toolkit Search

## Delivered design

A unified **GM-only campaign search** appears above the GM Dashboard tab navigation and opens with **Ctrl+K / Cmd+K** or its dedicated button. It complements the existing GM Toolkit directory, which previously searched only tool descriptions.

Searches index the GM's already authorised live workspace data and optional GM-only Firestore subscriptions. There is **no new cross-campaign database, server search service, third-party API, shared index document or new Firebase rules**.

### Searchable sources

- GM Toolkit tools and dashboard shortcuts
- Campaign NPCs, custom creatures, world merchants and shops
- Player-visible and GM-private battle maps, looping maps and world atlas maps
- Regions, settlements, factions and world events
- Quests, encounter plans and saved encounter templates
- GM random tables and loot tables
- Private session notes and saved PDF document titles
- Linked player character names, class and level

Search uses a capped, allowlisted in-memory index. Matching is case- and diacritic-insensitive, supports multiple keywords, ranks exact and prefix name hits first, and provides category filters.

### Navigation

Every search result links to a fixed, validated GM Dashboard tab. Supported records can also select the exact map, NPC filter, quest filter, world collection, shop, encounter plan, random table, loot table or session library filter.

World region and settlement results remember their specific collection so similarly named records open the correct world section. Unrecognised tabs or unvalidated tool targets are rejected rather than navigating to arbitrary URLs or Firestore paths.

### Permissions and privacy

The unified index is created **only within the authenticated GM Dashboard**, after the existing campaign GM access check. All subscriptions use the existing GM-specific Firestore queries, so the search does not change backend access policies.

Only a bounded set of names and safe metadata is copied into local search results. Secret NPC notes, session note body text, quest GM notes, inventory internals, hidden map pins, encounter enemy statistics, and PDF contents are never indexed or exposed to player views. Search terms and results are not persisted to local storage and are never sent to an analytics or external search endpoint.

Search subscriptions are **lazy**: they only activate while the search panel is open, then stop when closed or when the campaign changes. The index is recomputed from live snapshots and capped at 2,400 records with a 50-result page limit.

### Validation checklist

1. Open a campaign as its GM. Verify the GM search button appears above navigation.
2. Press Ctrl+K (or Cmd+K on Mac), type part of an NPC, merchant, quest or location name. Verify ranked results and filters.
3. Open a battle map, atlas entry, shop, quest, random/loot table, NPC or session document result. Verify the corresponding GM tab and record selection or filter opens.
4. Update or delete a record and verify the next search uses the updated live GM data.
5. Open a different campaign: ensure stale index results and private records do not carry across.
6. Use a player account. Verify the GM search interface is absent.
7. Search for text only present in private notes or raw inventory metadata: it must not return those secrets.
8. Test keyboard navigation, Enter, Escape and mobile layouts.
9. Run **Digital GM Phase 10.2 — Unified Toolkit Search** verification and the existing account/role permission tests, lint, dashboard regressions and production build.

### Deployment

As agreed, merge each Phase 10 subphase only after verification. **Defer production Firebase and website deployment until 10.1, 10.2 and 10.3 have all been merged**. Phase 10.2 does not require any new Firebase service, secret or deployment workflow.
