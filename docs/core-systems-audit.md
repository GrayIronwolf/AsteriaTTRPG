# Asteria core systems integration

Reviewed against production commit `5a635b5`. This change extends the existing React dashboards and authenticated `asteriaAction` Firebase Function. It does not replace the Forge, talent graph, inventory workspace, campaign systems, or live subscription layer.

## Production paths and retained systems

- `index.html` loads the Firebase bridge and the committed `react-dist` build. `src/main.jsx` and `AsteriaReactRoot.jsx` select the React player/GM routes; the legacy bridge still connects the Forge, compendium, world, and progression code.
- `js/firebase-auth.js` owns the singleton Firebase app, auth session, subscriptions, and callable requests. `src/firebase/asteriaFirebaseService.js` is its React adapter, not a second Firebase initialization.
- `functions/handler.mjs` validates authentication, canonical campaign membership/ownership, request receipts, and stale revisions. `functions/commands.mjs` retains talent purchasing, TP, inventory, equipment, currency, spells, skills, and quests.
- The existing talent catalog reads authored ranks from the compendium. Current production Mana Well multipliers, Blood Control, Mystic Recovery, cooldowns, rank costs, and prerequisites remain intact. This is not a talent rebalance.
- `armourSystem.mjs` remains the authoritative AC formula: racial NAC, crafted armour contributions, one set bonus, and shared effects; existing rounding and the racial NAC floor are preserved.

## Security and synchronization audit

Existing Firestore/Storage rules already isolate private `users/{uid}/characters` records, reject outsiders from campaigns, and prevent players from directly writing shared gameplay fields. Campaign members intentionally see shared campaign sheets; that is distinct from another player's private Forge record. No rules or indexes needed broadening.

New GM callable scopes require both canonical GM membership and a consistent character link. A GM can configure conditions/resources and review rests for linked players without owning the character. Other player commands remain owner-only. Missing private records are never recreated by a GM action, and mismatched owner records are rejected.

Transactions now patch changed root fields in the shared sheet and the existing actual owner's private mirror. This preserves private names, appearance, journal entries, and other unrelated fields and avoids recursive map merges resurrecting removed rules. Source IDs and owner UIDs are never rewritten. Rest notifications use the existing owner-targeted event collection.

The older client snapshot/progression mirror now uses one transaction that re-reads the canonical shared sheet and existing private record. It copies only changed gameplay fields, ignores stale snapshots, preserves private profile fields, and does not recreate deleted records or write unchanged snapshots.

Request receipts prevent replay of the same request. Resource/talent/spell controls also send a canonical revision, so distinct concurrent stale requests cannot double-spend. A shared synchronous React action lock and an in-flight Firebase request map coalesce repeated clicks before disabled controls render. Short rests use a sequence; long-rest requests and approvals have terminal states and stable IDs.

Removed stale cached role merging, fixed the logout event subscription, and removed a duplicate ready event. Existing listener unsubscribes remain in place for route, campaign, account, and session changes. Pending writes no longer appear fully synchronized. Derived calculations do not write back every clock tick. Core initialization/encounter refreshes are scoped and deduplicated; unchanged refreshes leave character revision/timestamps untouched.

## Shared effects and resources

`effectsEngine.mjs` collects explicit mechanics from race, class effects, talents, equipped items/enchantments, active spells, conditions, patron effects, and campaign effects. Known but inactive spells do not silently grant bonuses. Inactive/expired parents suppress nested effects. Equipment and explicit effect IDs are deduplicated.

Supported operations: SET, ADD, SUBTRACT, MULTIPLY, MIN (ceiling), MAX (floor), ADVANTAGE, DISADVANTAGE. Calculation order is set → additive changes → multipliers → bounds; priority/ID makes ordering deterministic. Advantage and disadvantage cancel. `strongest` stack groups select the largest absolute modifier. Conditional effects remain visible and do not automatically affect unconditional statistics.

Targets include characteristic aliases, `ac`, `hp.maximum`, `sp.maximum`, `mp.maximum`, custom resource maxima/regeneration, movement, initiative, skills/checks, carrying capacity, and extensible damage/resistance/immunity/sense namespaces. `characterCheck` composes general and skill-specific modifiers. Effective CON/END/WIS modify resource maxima without rewriting base characteristic scores or CP.

`resourceEngine.mjs` supports bounds, costs, restoration, temporary maxima, regeneration, reset events, and rest recovery. Legacy HP/SP/MP/BP pairs and object records remain readable. Blood Points retain their overflow/burden semantics. Learned Paladin's Zeal supplies ZP with its authored 10/15 cap and combat/unconscious resets. Zeal techniques use canonical costs; Divine Guard projects AC and Holy Restoration's HP option respects Soul Damage.

Canonical talent metadata can declare `resourceCosts`/`activationCost` and `restoreResources`/`resourceRestoration` maps for arbitrary configured resource IDs. Malformed rules block activation; client-provided replacement costs are ignored. Existing prose-derived talent mechanics remain supported.

Default existing rest rules remain HP +50% on Long Rest, SP +35% on Short Rest/full on Long Rest, MP +50% on Long Rest, with Mystic Recovery. Blood Points reduce by 25% current on Short Rest and reset on Long Rest; Zeal resets. GM-defined resources supply their own recovery rather than always refilling.

Resource markers keep base maxima separate from computed maxima, preventing multiplier compounding and free healing when a penalty expires. Forge edits rebase the markers while retaining spent pools, learned ranks, effects, conditions, and rest state. Regeneration is reconciled lazily on authoritative actions/refresh, not by a scheduled background job; combat time is not banked when a rule disables combat regeneration.

## Conditions and rest workflow

Conditions support descriptions, source/applier, mechanical effects, stacking, explicit owner-removal permission, timestamps and durations in rounds, minutes, hours, days, until Short/Long Rest, until removed, or permanent. Concussion supplies −3 skill checks and ×0.8 MP maximum. Blindness disables natural vision. Poison is a template requiring the authored poison's specific effects; no damage rule is invented.

Player Dashboard conditions are inspectable and mechanically active. The GM can manage them from linked player dashboards or GM Tools. Players can remove only conditions explicitly allowing it. The GM can configure custom resources and their recovery, regeneration, bounds and reset rules through the same tools.

The existing Rest & Recovery panel is extended in place. Short Rest applies resource rules and matching resets/expirations. Long Rest requests do not heal. GM Main shows a pending queue; approval expires applicable effects/conditions before recalculating maxima and recovery, while denial gives a visible reason/status without rest recovery. Repeat approvals do not heal twice. Soul recovery remains an explicit GM-approved amount.

## Data compatibility and deployment

No destructive migration, new collection, index, security credential, or Firebase project configuration is introduced. New optional character fields are `resources`, `resourceDefinitions`, `resourceState`, `conditions` metadata, `talentResourceEffects`, `restState`, `coreStateVersion`, and `coreRevision`. Existing talent state/effect fields remain compatible. New markers and safe defaults are introduced on read/authorized actions, not through a bulk migration.

The new frontend sends the `requestCharacterRest` callable action. An old backend rejects that name safely instead of performing its former immediate Long Rest. The old `takeCampaignCharacterRest` action remains a server alias with the new approval semantics for compatible callers.

After merging and the website build deploys, run the existing **Deploy Firebase backend (manual)** workflow on **main**. It deploys Functions, rules and indexes through the existing WIF/environment gate. Do not change IAM credentials or bypass that gate. Reload open player/GM dashboards after deployment so they use the same version.

## Safe cleanup

Removed private unused `RecordActions`, class-detection duplication, obsolete imports/helpers left behind when gameplay moved to trusted Functions, duplicate resource parsing/value logic, duplicate AC modifier collection, duplicate action hooks, and the old immediate-rest handler. Checked current imports, lazy routes, global bridge entry points, and migration references before removing these candidates.

Kept `js/asteria-gameplay-systems.js` (active Forge), `js/asteria-progression.js` (also loaded by the server), legacy migration/bridge functions, inventory implementations still used by the Forge, dev fixtures, and runtime CSS. No speculative mass deletion of legacy files.

## Validation and limits

- Existing regression suites cover authentication/ownership, linked GM access, Forge, AC, talents/TP, equipment, inventory, quests, and live sync.
- Added 18 core model/React tests for effect combinations, maxima, regeneration, conditions, duration, rests, Zeal, atomic costs, Forge compatibility, rapid clicks, safe client mirroring, structured talent costs, and synchronization-loop prevention.
- Firebase emulator suite: 51 tests, including direct-request denials, private profile preservation, controlled condition removal, canonical custom-resource costs, stale concurrent activations, rest request/approval/denial, reset-map replacement, and Soul-aware restoration.
- ESLint covers React, shared models, server code and the Firebase bridge; production builds and the real-time XP regression also run. CI repeats tests, emulator checks and the build on Node 22 and checks the committed bundle matches source.
- This session's browser reports `ERR_BLOCKED_BY_CLIENT` for the local preview. React rendering/click tests and responsive CSS checks were completed, but visual mobile QA, authenticated production browser-console checks, and real-account Firebase checks cannot be claimed from this environment.

Before a live game, use a test campaign to inspect the player and GM layouts at phone and desktop widths, open conditions/talents, spend a custom resource, request/deny/approve a rest, and verify a second tab receives the changes without console errors. Production rollout is separate from local/emulator validation.

## Recommended follow-up

Add an authoritative combat/roll event pipeline for hit/save triggers, end-of-turn versus round timing, damage/resistance resolution, temporary HP depletion, Zeal generation/Broken Conviction, and conditional technique outcomes. The shared engine supports structured targets now; it deliberately does not infer executable mechanics from every prose-only spell or talent. Divine Guard can be ended through existing talent-effect controls when hit; until-hit and exact turn-boundary automation remain part of that follow-up. Missing base movement/carrying rules are not invented.
