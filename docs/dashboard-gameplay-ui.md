# Dashboard and gameplay integration

Reviewed against main at `7bd56dda3c362d9b4ff7e34fee847390cb332f15`.

## Production path and compatibility

The existing static shell loads the React bundles in `react-dist`. React uses
`asteriaFirebaseService` and the single `window.AsteriaFirebase` instance. Protected
gameplay changes still go through the authenticated `asteriaAction` callable and
the existing transactional commands. Canonical items and talents come from
`content/` through `data/compendium.js`. No character ownership, item, talent or
quest database was replaced, and no production data migration is required.

## Changes

| Area | Integration |
| --- | --- |
| GM PC inventory | Select a linked PC, inspect canonical items, equip/unequip, or adjust quantities. Loot rewards use the existing delivery flow in a full-width panel below inventory. |
| Inventory permissions | Campaign GM access is checked separately from ownership. Quantity updates reject stale revisions and mirror the real owner's document atomically. Players cannot use the GM quantity operation. |
| Resources | The shared Resource Engine filters class-restricted definitions. Stale BP/ZP fields remain compatible but do not appear or become spendable on unrelated classes. Custom resource definitions remain supported. |
| GM resources | Cards and their containing panel grow with applicable resources; the player list has no internal scrollbar. |
| Encounters | Initiative and creature resources are separate. Missing/zero-capacity pools are omitted. XP comes from encounter/creature data. Temporary creatures require only a name, HP and XP, with optional SP, MP, AC and initiative. |
| Information | One player area provides News, Events, Notifications and Quests. GM publication uses private workspace records and an allowlisted projection into the existing party workspace. Drafts and GM notes remain private. |
| Geography and time | Scopes are limited to locations present on the campaign plus World. Dates are optional text, with an optional world-time structure for later calendar integration. |
| Notifications | Existing targeted campaign events and activity records are merged and deduplicated. New activity is archived into that same event stream. Read state is separate from reward acknowledgement, and owner-filtered pagination retains history. |
| Quests | Type and status are independent. Optional offers support Pending, Accepted and Declined; existing active/review/completion flows remain. Failed/Expired/Completed records stay in history. Legacy categories and future free-form types are retained. |
| Dashboard talents | Only purchased talents appear, at their highest recorded rank, across selected classes. Lower-rank purchase data is untouched. |
| Talent costs | Costs are parsed from canonical content/metadata and passed through the existing validation, spending and persistence engine. Multiple resources and class resources are supported. |
| Talent tree | One responsive graph includes all selected classes and tiers I–V, prerequisite links, rank state, original TP/purchase validation, pan, zoom, fit and class/tier jumps. |
| Themes | Seven independent areas use shared tokens and the existing settings store. Legacy accent choices seed the new settings without dropping saved preferences. |

## Validation

- All existing `npm test` suites passed; the new dashboard regression suite covers
  resource ownership, highest purchased ranks, content costs, multiclass graph
  structure, custom encounters, quest history, publication, notifications and
  independent theme migration.
- All 54 Firebase emulator tests passed, including cross-account denials, linked
  GM inventory updates, owner mirroring, private publication, targeted messages,
  read/unread state and existing atomic/idempotent rewards.
- Lint, content validation and the production build passed. The content audit
  retains its 98 existing authored-content warnings and reports no errors.
- Browser checks use disposable fixtures with the actual React components and
  shared talent models. Desktop/mobile navigation, purchases, item inspection,
  publication, read state and class resources were exercised. Emulator tests
  separately exercise authorization and persistence; no real accounts were used.

## Deployment and content limits

The source and generated bundles must ship together. The existing manual Firebase
deployment workflow must deploy the new callable commands after review; publishing
only the static website will not activate those backend operations. Existing rules
and event indexes are reused. This work does not claim a production deployment.

Creature XP that is absent from canonical data displays "Not configured" rather
than an invented reward. Earlier activity that was already discarded by the old
bounded activity log cannot be reconstructed; retained records and new activity
are available. Geographic publication remains campaign-controlled because there
is no authoritative per-character world-location access model. "Hide Quest" is
available as requested; pre-existing free-form categories are not renamed.
