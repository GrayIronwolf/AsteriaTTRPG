# Asteria Stability and System Audit

Date: 8 September 2026

## Executive result

The shared character record in `campaigns/{campaignId}/characters/{characterId}` is now treated as the live, canonical campaign copy. Character-owned copies remain supported, but linked profile data can no longer replace live progression, resources, inventory, quests, titles, magic, or other gameplay state with an older browser snapshot.

High-risk mutations now use guarded Firebase transactions and narrow update paths. The React dashboard also mirrors a character's current canonical campaign state back to that character owner's private record, avoiding the old cross-account limitation where the GM could update the campaign copy but could not write into another user's private path.

Automated result: **552 checks passed, 0 failed**. The Vite production build also completed successfully.

## 1. Trade system: inventory not updating

**Result: FIXED**

**Root cause**

- Item offers and final transfers were vulnerable to competing full-character/inventory writes from older state.
- Legacy item identity could fall back to array position, which is not stable after an item is moved or removed.
- An accepted trade needed one status guard and one transaction covering escrow, both inventories, and the request status.

**Affected code**

- `js/firebase-auth.js`
- `src/state/liveWorkspaceModel.mjs`
- `src/dashboards/PlayerItemExchange.jsx`
- `js/data-sync.js`

**Changes made**

- Trade items move into escrow when offered; they are not left available for a second mutation.
- The receiver's exchange offer, sender confirmation, both inventory updates, and request status are transactionally guarded.
- Only `pending` or `awaiting-sender` requests can advance, preventing duplicate acceptance.
- Stable `instanceId`/item IDs are preferred over array indexes, and received items are placed into a valid free storage cell.
- The expanded legacy sync signature now notices inventory, storage, equipment, quest, title, magic, and resource changes instead of treating them as unchanged.

**Tests performed**

- Exactly-once transfer and request status guards.
- Stable inventory identity across reorder/normalisation.
- Escrow and duplicate-acceptance source checks.
- Full smoke suite.

## 2. XP, level, and Characteristic Point stability

**Result: FIXED**

**Root cause**

- Linked-character/profile writes could include a stale, incomplete character object and overwrite progression fields.
- CP application previously trusted absent/default resource data and could create invalid resource values.
- React and legacy writers could both persist the same shared character.

**Affected code**

- `src/state/characterIntegrityModel.mjs`
- `src/state/liveWorkspaceModel.mjs`
- `src/app/legacyBridge.js`
- `js/firebase-auth.js`
- `js/data-sync.js`

**Changes made**

- Linking an existing campaign character now merges only safe identity/profile fields.
- XP, level, CP, resources, inventory, titles, quests, magic, and other gameplay fields are preserved from the canonical campaign character.
- CP allocation clones the current canonical character, changes only CP/Characteristics and the linked maximum resource, and rejects missing, invalid, or negative resource maxima.
- Constitution, Endurance, and Wisdom continue to add 10 maximum HP, SP, and MP per applied point.
- The legacy full-snapshot writer stands down while the React live dashboard owns the character.

**Tests performed**

- CP allocation preserves XP and level.
- Linked stale-profile data cannot reset progression.
- Missing resource data is rejected rather than converted to zero.
- XP/level notification and canonical/private mirror source checks.

## 3. HP, SP, MP, and BP stability

**Result: FIXED**

**Root cause**

- Broad character writes and stale snapshots could race narrow resource changes.
- Missing resources were sometimes represented as `[0, 0]`, turning unavailable data into real zero values.
- Re-subscribing to a different campaign/character did not immediately clear all previous live state.

**Affected code**

- `src/state/characterIntegrityModel.mjs`
- `src/sessions/useCampaignLiveData.js`
- `src/state/specialDamageModel.mjs`
- `js/firebase-auth.js`

**Changes made**

- Resource writes validate and clamp current/maximum pairs.
- Missing resource values remain missing and display as unavailable rather than being silently reset.
- Character/campaign subscription changes clear old character, session, event, encounter, presence, and workspace state before the new snapshots arrive.
- GM and player resource mutations use guarded transaction paths.

**Tests performed**

- Current/maximum clamping.
- Missing-resource preservation.
- Rest behaviour with absent resources.
- Subscription cleanup and authoritative snapshot replacement.

## 4. Gallery image upload

**Result: FIXED IN CODE; PRODUCTION RULE DEPLOYMENT AND REAL UPLOAD TEST REQUIRED**

**Root cause**

- Upload validation and Storage rules did not share one exact MIME/size contract.
- Gallery paths could use the campaign character ID when the owner's private source ID was required.
- Permanent records needed to reject non-HTTPS/local blob URLs.

**Affected code**

- `js/firebase-auth.js`
- `storage.rules`

**Changes made**

- The client and Storage rules accept PNG, JPEG, WEBP, and GIF only, up to 8 MB.
- Uploads use `users/{ownerUid}/characters/{sourceCharacterId}/gallery/...`.
- Only Firebase HTTPS download URLs are persisted.
- Failed post-upload metadata transactions trigger Storage cleanup and a useful user-facing error.
- Gallery mutations verify that the signed-in user owns the linked character.

**Tests performed**

- MIME, size, HTTPS URL, upload path, ownership, and Storage-rule source checks.
- A real Firebase upload remains a manual production test because this audit did not use a player's credentials.

## 5. GM additional Magic Element grant

**Result: FIXED**

**Root cause**

- Accepting a notification did not consistently update the canonical magic collections used by the spell filter.
- The private character path could be derived from the campaign character ID instead of `sourceCharacterId`.
- Repeated acceptance could duplicate the same element.

**Affected code**

- `src/state/characterIntegrityModel.mjs`
- `js/firebase-auth.js`
- `src/dashboards/CharacterDashboard.jsx`

**Changes made**

- Grant acceptance normalises and deduplicates known elements.
- The accepted element is added to the canonical character fields consumed by Magic/Spells.
- The reward resolves once, the notification is acknowledged, and the owner mirror uses the correct source character ID.
- Loot, magic, quest, and XP modals now have deterministic priority so multiple live events do not continually replace one another.

**Tests performed**

- Duplicate element prevention.
- Magic notification/reward source checks.
- Canonical-to-private owner mirror verification.

## 6. Inventory stability

**Result: FIXED FOR AUDITED MUTATION PATHS**

**Root cause**

- Inventory rows without stable IDs could change identity after array operations.
- Full-array/full-character writes from legacy sync could overwrite a newer loot, trade, storage, or equipment transaction.
- Item placement did not consistently enforce storage capacity and occupied-cell checks.

**Affected code**

- `src/state/liveWorkspaceModel.mjs`
- `js/firebase-auth.js`
- `js/data-sync.js`
- `src/dashboards/InventoryWorkspace.jsx`

**Changes made**

- Inventory normalisation assigns/preserves deterministic stable IDs and prefers `instanceId`.
- Loot resolution is idempotent and places accepted items once.
- Trade, give, sell, identify, shop, quest reward, equipment, movement, stack, storage, and discard paths use the canonical campaign character and guarded transactions where shared state is involved.
- Storage placement validates capacity and occupied cells.
- Legacy sync no longer publishes stale React-owned full snapshots.

**Tests performed**

- Stable IDs, loot idempotency, trade escrow, capacity guards, and stale-write prevention.
- Smoke coverage for inventory API/UI integration.

## 7. Quest Builder and rewards

**Result: FIXED**

**Root cause**

- The React projection flattened quest data and discarded structured reward/claim fields.
- Assignment and completion needed deterministic records, live notifications, and a one-claim guard.

**Affected code**

- `src/state/questRewardModel.mjs`
- `src/state/liveEventReducer.mjs`
- `src/dashboards/GMWorkspacePanels.jsx`
- `src/dashboards/CharacterDashboard.jsx`
- `src/dashboards/CharacterWorkspaceTabs.jsx`
- `src/dashboards/characterWorkspaceData.js`
- `js/firebase-auth.js`

**Changes made**

- The GM builder saves structured XP, currency, and item rewards and assigns the quest to selected linked characters.
- Assigned quests persist on the canonical character and create a player-facing live notice.
- The Character dashboard receives a quest modal and links directly to the Quest Log.
- Completion grants supported rewards in one transaction and stores claim metadata; a completed/claimed quest cannot pay twice.

**Tests performed**

- Structured reward normalisation.
- Assignment event/notification flow.
- Single-claim/idempotency guard.
- Projection retains reward and claimed fields.

## 8. Title revoking

**Result: FIXED**

**Root cause**

- Title management needed a canonical GM-authorised mutation and cleanup of the selected visible title.
- Older snapshots could restore a removed title.

**Affected code**

- `js/firebase-auth.js`
- `src/dashboards/GMDashboard.jsx`
- `js/data-sync.js`

**Changes made**

- Revocation removes the title from the canonical character and clears `visibleTitleId` when necessary.
- The mutation verifies GM authority and persists through the live character subscription.
- Stale legacy snapshots cannot republish the removed title while React is authoritative.

**Tests performed**

- GM authorisation and revoke-path checks.
- Legacy signature/title reconciliation checks.

## 9. GM inventory/storage slots

**Result: FIXED**

**Root cause**

- Capacity could be read from multiple derived values and the player's private copy could lag behind the canonical campaign value.

**Affected code**

- `js/firebase-auth.js`
- `src/dashboards/GMDashboard.jsx`
- `src/dashboards/InventoryWorkspace.jsx`
- `src/dashboards/CharacterDashboard.jsx`

**Changes made**

- `storageLimit` is the canonical grant value.
- GM changes are authorised and transactionally persisted.
- Inventory storage tabs and creation limits derive from the current live character.
- The owner dashboard mirrors canonical updates to the correct private source record.

**Tests performed**

- GM storage authorisation/source checks.
- Canonical owner-mirror test.
- Storage capacity and placement smoke coverage.

## 10. Soul Damage recovery

**Result: PARTIALLY FIXED; RECOVERY RATE NEEDS CLARIFICATION**

**Root cause**

- Rest normalisation could create missing HP/SP/MP pairs as `[0, 0]`.
- A long rest could run a zero-value Soul Damage recovery path without a meaningful recovery choice.

**Affected code**

- `src/state/specialDamageModel.mjs`
- `js/firebase-auth.js`

**Changes made**

- Short/long rests preserve missing resources and validate resources that are actually restored.
- Soul Damage recovery only occurs on a long rest when Soul Damage exists and the player submits a positive manual recovery amount.
- Recovery is clamped, persisted, and cannot be replaced by ordinary HP restoration.

**Tests performed**

- Soul Damage application/clamping.
- No ordinary-healing removal.
- Explicit long-rest recovery.
- Missing-resource preservation.

**Clarification required**

- No authoritative automatic natural recovery rate was found in the current code/configuration. The existing manual long-rest recovery prompt is retained. An automatic amount or time formula was not invented.

## 11. Encounter Tracker

**Result: RESOURCE EDITING FIXED; ARTIFACT-TO-SKULL NEEDS CLARIFICATION**

**Root cause**

- Creature/NPC rows did not retain all real HP/SP/MP values from their source record.
- A whole-encounter save could overwrite a recent narrow resource change.
- Initiative inputs saved on every keystroke, causing unnecessary writes and visual movement.

**Affected code**

- `src/state/encounterResourceModel.mjs`
- `src/dashboards/GMDashboard.jsx`
- `src/firebase/asteriaFirebaseService.js`
- `js/firebase-auth.js`

**Changes made**

- Each creature/NPC row now has HP, SP, and MP current/maximum controls when that resource exists.
- Missing SP/MP displays as `Not recorded` instead of a fake zero resource.
- A dedicated GM-only transactional endpoint updates one resource and clamps it to its maximum.
- Whole encounter saves preserve the latest canonical resource pairs.
- Initiative commits on blur/Enter rather than on every keypress.

**Tests performed**

- Source-resource extraction.
- Missing-resource handling.
- Clamped manual editing.
- Whole-save preservation and endpoint/auth checks.

**Clarification required**

- No Encounter Tracker field or icon with a safely identifiable `artifact` meaning was found. It was therefore not renamed blindly. Confirmation is needed on the exact marker/icon the word `Skull` should replace.

## 12. Website colour customisation

**Result: FIXED FOR SHARED INTERACTIVE CHROME**

**Root cause**

- Several active/selected states still used fixed blue values even though the project already had a central accent variable.

**Affected code**

- `js/asteria-ui-theme-system.js`
- `css/asteria-ui-theme-system.css`
- `src/styles/asteria-react.css`

**Changes made**

- The central theme application now computes shared border, divider, focus, highlight, and active-button tokens.
- React tabs, segmented controls, campaign selection, shops, compendium links, sidebar links, and top links consume those tokens.
- HP/SP/MP and other semantic colours remain intentionally unchanged.

**Tests performed**

- Theme-token propagation source tests.
- Production CSS build and visual fixture inspection.

## 13. Live Sync and persistence audit

**Result: FIXED FOR THE IDENTIFIED ROOT CAUSES**

**Root causes**

- React and legacy code could both publish broad snapshots of the same character.
- Profile linking trusted stale gameplay fields from a private/local character.
- Canonical campaign IDs and owner-private source IDs were sometimes treated as interchangeable.
- Queried events were accumulated rather than reconciled as an authoritative snapshot.
- Broad encounter saves and narrow resource edits shared ownership of HP/SP/MP fields.

**Affected code**

- `src/sessions/useCampaignLiveData.js`
- `src/state/characterIntegrityModel.mjs`
- `src/state/liveEventReducer.mjs`
- `src/state/encounterResourceModel.mjs`
- `src/app/legacyBridge.js`
- `src/dashboards/CharacterDashboard.jsx`
- `src/firebase/asteriaFirebaseService.js`
- `js/firebase-auth.js`
- `js/data-sync.js`
- `firestore.rules`

**Changes made**

- **Competing writers:** React declares live ownership; the legacy full-character sync skips React-owned stale writes.
- **Unsafe linking:** Existing canonical gameplay fields are preserved; only safe profile/link metadata is merged.
- **Wrong private key:** Private mirrors use `sourceCharacterId || id` consistently.
- **Cross-account writes:** GM changes remain canonical; the owning player's subscribed dashboard mirrors them into the owner-only private path.
- **Subscription leakage:** Campaign/character/mode changes clear old state and subscriptions clean up through hook return functions.
- **Stale event accumulation:** Authoritative event snapshots replace the local queried event set, so deleted/expired records do not remain forever.
- **Modal contention:** Loot, magic, quest, and XP notices are prioritised and acknowledged deterministically.
- **Broad encounter overwrite:** Whole-save reconciliation preserves resource fields maintained by narrow transactional edits.
- **Rule/schema mismatch:** Firestore membership and GM checks support both UID arrays and the existing `roles[uid]` map.

**Tests performed**

- Stale linked-character merge and canonical progression preservation.
- Subscription cleanup and campaign/character state reset.
- Authoritative event reconciliation and acknowledgement.
- Canonical-to-private owner mirror and adapter-failure safety.
- Encounter narrow-write preservation.
- Rules/runtime role alignment.
- Refresh/reconnect source-path checks.

## 14. Additional bugs found

| Description | Severity | Root cause | Fix |
| --- | --- | --- | --- |
| Switching campaign/character briefly retained old party, events, session and encounter data | P1 | Live hook did not reset every subscribed slice before the next snapshot | Reset all campaign-scoped state on subscription-key changes |
| Deleted/expired events could remain in the UI | P1 | Event snapshots were merged into prior query results | Treat each Firebase query snapshot as authoritative |
| Rest could create absent resource data as zero | P1 | Default normalisation converted missing pairs to `[0, 0]` | Preserve absence and validate required rest resources |
| Whole encounter saves could undo resource edits | P1 | Resource and encounter-form writers replaced the same fields | Preserve canonical resource pairs during broad saves |
| Legacy persistence missed many meaningful changes | P1 | Signature covered too few gameplay fields and unstable item IDs | Expanded deterministic signature and private source-ID handling |
| Quest cards lost reward/claim metadata | P2 | Workspace projection selected only display fields | Preserve structured reward and claim fields |
| Firestore rules and application membership schema differed | P1 | Rules checked arrays while campaign records may use `roles` | Support both representations in rule helpers |
| CP allocation accepted a negative maximum resource | P1 | Validation checked finiteness but not domain validity | Reject negative maxima before applying points |
| Owner mirroring could throw synchronously when a Firebase adapter omitted the method | P1 | The promise handler was attached after a potentially synchronous adapter lookup; the development fixture lacked the mirror contract | Defer the adapter call into a promise and implement an isolated private fixture mirror |
| Creatures with a zero-capacity SP/MP resource displayed an unusable `0 / 0` editor | P2 | Zero-valued source pairs were treated as present even though the mutation endpoint correctly rejects a zero maximum | Normalise zero-capacity encounter resources to `Not recorded` |

## 15. Architecture and data safety

- No player records, inventories, XP, quests, gallery rows, or databases were wiped or reset.
- No production mock data was added.
- The changes are backward compatible with legacy item IDs, linked source IDs, array-based roles, and role-map campaigns.
- Missing persisted gameplay values are surfaced as unavailable/errors where required instead of silently becoming zero or an empty array.
- The primary remaining architectural constraint is Firebase security: a GM must not write another user's private path. The canonical campaign document plus owner-side mirror intentionally respects that boundary.

## 16. Test results

| Suite | Passed | Failed |
| --- | ---: | ---: |
| Armour system | 11 | 0 |
| Market pricing | 14 | 0 |
| React milestone | 64 | 0 |
| Stability audit | 31 | 0 |
| Static/smoke integration | 432 | 0 |
| **Total** | **552** | **0** |

- `npm test`: passed.
- `npm run build`: passed; Vite transformed 59 modules and produced the production bundles.
- Browser fixture QA: passed at the default desktop viewport and a 390 px mobile viewport for the GM encounter editor, Character dashboard, Gallery, and responsive header/resource layout.
- Separate lint/type-check scripts: not present in `package.json`; the build and test parsers provide the available syntax/module validation.

The 31-test stability suite includes the 17 requested regression categories plus ownership, schema/rules alignment, notification reconciliation, event cleanup, missing-value safety, idempotency, canonical/private mirroring, adapter safety, and data-wipe guards.

## 17. Remaining risks and manual verification

1. Deploy the updated `firestore.rules` and `storage.rules` to the Firebase project before testing production accounts. Local rule files do not alter deployed Firebase rules by themselves.
2. Run the two-account production matrix: GM grants XP/magic/storage/title/loot/quest while the player dashboard is open, then refresh and reconnect both accounts.
3. Upload each accepted gallery format against real Firebase Storage and verify delete/reload behaviour.
4. Exercise simultaneous trade acceptance from two devices to confirm Firestore transaction retry behaviour with real network latency.
5. Confirm the intended Soul Damage natural recovery rate, if an automatic rate is desired.
6. Identify the exact Encounter Tracker field/icon that should become `Skull`.

Until the Firebase rules are deployed and the cross-account matrix is run with real credentials, those production behaviours should be considered code-complete but not production-verified.
