# Phase 8.4 — Cross-feature permissions and data-integrity audit

## Scope and boundaries
Phase 8.4 audits the **React/Vite migration** on top of merged Phases 8.1–8.3. It reuses the original Firebase application, Firestore/Storage rules, feature flags, Functions, existing character and campaign ownership checks, and public-only Compendium projections. There is no production deployment or website cutover in this PR.

## Verified cross-feature contracts
| Boundary | Enforcement and evidence |
| --- | --- |
| Auth and runtime | One existing Auth observer and Firebase SDK app; current UID plus observer generation now determine whether asynchronous results remain valid |
| GM vs player | Canonical campaign and v2 active-membership records, not frontend role flags, determine GM/co-GM and player access; v1 compatibility remains preserved |
| Character Forge and Player Dashboard | Owner UID, exact campaign link, source sheet and active status are independently checked before actions |
| Combat and progression | Account verification, GM vs player role, source/character link, and server-confirmed encounter/check records; trusted Functions execute commands |
| Inventory, trade, loot, shops, crafting | Firestore rules limit private trade and owner-scoped collections, player actions require canonical character linkage, and commands use trusted server callables |
| Campaign media | Player map lists require published visibility, private pins and GM map edits require GM permission, Storage reads are controlled by existing Storage rules |
| Digital GM | GM-only workspace and unpublished records are separate from player-safe shared collections; player-facing projections never subscribe to GM workspace |
| Shared network boundary | Verified-only Firestore reads/listeners and no offline private-data cache; no automatic replay of potentially committed mutations |

## Changes made after audit
1. **Same-account session reuse:** UID-only response checks were insufficient if a user signed out and back in as the same account while an earlier request was pending. `connectionMonitor` now tracks Auth-observer generations, and Firestore requests are keyed by UID **and** generation.
2. **Functions and Storage:** All migrated feature services receive guarded Functions and Storage SDK facades. Calls capture the Auth generation and reject stale results after an awaited operation. Connection unavailability prevents starting new calls. This is client-side integrity protection **in addition to**, never replacing, backend authorization.
3. **Transaction and batch lifecycle:** Firestore transaction callbacks and batch commit entry points reject obsolete sessions. Existing transactions and server-side receipts remain authoritative.
4. **Strict snapshot confirmation:** Both shared realtime streams and server-read transport require explicit metadata indicating not from cache and without pending local writes. Missing metadata cannot be treated as permission proof. Replays are suppressed while offline.
5. **Regression tests:** `scripts/site-firebase-phase8-4.test.mjs` covers v1/v2-compatible role boundaries, revoked members, source links, cross-character check views, same-UID logout/relogin races, account switches, stale Firestore/Functions/Storage responses, transactions, batch commits, private stream metadata and security-rule/source invariants.
6. **CI:** The dedicated Phase 8.4 workflow runs all four Firebase phase suites, complete site regressions, lint, guest build parity, and an actual authenticated emulator browser network interruption test. Earlier phase workflows provide additional two-account, GM/player and end-to-end compatibility checks.

## Important limitations
- The React UI is not an independent authorization system. Security rules and Firebase Cloud Functions remain authoritative.
- A JavaScript facade can reject **responses** after account switches; it cannot undo an already committed server-side mutation. Existing receipts and transactions provide deduplication.
- Auth session generation is updated by the **one existing Auth state observer**. It deliberately does not create another observer, service worker or persisted cache.
- These are repository/CI and local emulator checks, **not production account tests**. Production rules and current deployed frontend are unchanged.
- Do not run the Firebase deployment workflow; wait until the coordinated ten-phase migration cutover and final acceptance.

## Next
Phase 9 will address final production readiness, compatibility and rollout preparation; the later coordinated cutover will be separately approved.
