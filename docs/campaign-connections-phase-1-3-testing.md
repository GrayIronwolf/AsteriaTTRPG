# Campaign Connection Upgrade — Phase 1.3 Security and Test Scaffolding

**Scope:** isolated readiness checks only; no production v2 membership, join approvals, invitation tokens, runtime rule changes or Firebase deployment.
**Reviewed main baseline:** `8959f4607faadc18964e016f7b7cd79b08018d07`.
**Previous work:** [Audit PR #85](https://github.com/GrayIronwolf/AsteriaTTRPG/pull/85) and [Schema PR #86](https://github.com/GrayIronwolf/AsteriaTTRPG/pull/86), both separate from this PR.

## Files / intent

- `functions/campaignConnectionPolicy.mjs`: dormant, dependency-free policy contract. Nothing in the running site imports it. The `ASTERIA_CAMPAIGN_CONNECTIONS_V2` value must be *exactly* `enabled` to evaluate v2 authorization; absent or other values disable it. This is not a deployed Firebase Remote Config flag, environment switch or production security rule.
- `scripts/campaign-connection-phase1-3.test.mjs`: tests feature default off, version detection, deny-by-default behavior on disabled v2, active-membership-only access, revoked legacy array fallback, forged membership IDs and explicit Co-GM permissions.
- `scripts/firebase-integration.test.mjs`: emulator tests verify unimplemented v2 collections remain denied to browser clients and preserve legacy UCN joining while version 2 is dormant. Tests also explicitly document that the existing generic `users/{uid}/{collectionId}/{document=**}` Firestore rule permits owners to write `campaignRefs`; future authoritative projections must have a more specific rule.
- `package.json`: includes the isolated policy tests in the existing `npm test` command. Existing CI already runs `npm test`, Firebase emulator tests and a production build.

## Current baseline behavior (not changed by 1.3)

1. UCN is still sufficient to join an existing v1 campaign. That is a known finding; **do not claim it is fixed in this phase**.
2. Firebase Firestore and Storage rules still use v1 UID/role membership arrays. A status of `suspended` is not yet an access revocation. **Do not set v2 schemaVersion on a live campaign.**
3. The new policy module is not an access-control boundary until future phases wire it consistently into callable functions, Firestore, Storage, realtime discovery and legacy/React clients.
4. Existing sheets, characters, XP, inventory, campaign images, UI, Compendium and live sessions are untouched.
5. Account `campaignRefs` projections remain blocked from authoritative use. Current account owners can write that path under legacy generic rules, even though they cannot read other owners' projections.

## Test matrix for future implementation

| Security scenario | Phase 1.3 | Future proof required |
|---|---|---|
| Default-off v2 policy | Node unit tests | Production rollout flag consistency |
| Version > 2 or unknown => deny | Node unit tests | Cross-service rule parity |
| v2 suspended/removed/banned cannot inherit legacy arrays | Node unit tests | Auth + Functions + Firestore + Storage emulator end-to-end |
| Co-GM cannot self-grant ownership privileges | Node unit tests | Server transactional role change tests |
| New server-only membership/invitation/request collections inaccessible under old rules | Emulator tests | New narrowly scoped v2 reads/actor writes |
| Per-user account projection is not authority | Existing rules reviewed + emulator behavior checked | Server-written-only canonical projection rule |
| Legacy UCN and linked character behavior retained | Existing integration and additional regression | Phase 2/3 migration tests |
| Forged/duplicate invitation tokens, recipient checks, expiry | Not implemented | Phase 6/7 |
| GM approval, capacity, concurrency, idempotency | Not implemented | Phase 3 |
| Character collision, unlinking, owner preservation | Existing owner tests; new work not implemented | Phase 5 |
| Revoked account receives no live data on reconnect/account switch | Not implemented | Phase 2, 4 and 8 |

## Readiness and rollback gates

- Do not enable v2 membership on any real campaign until canonical member documents have been verified and **all** permission paths enforce the same versioned membership policy. Never use `legacyMember || v2Member` for a v2 campaign.
- A production rollback must not silently grant revoked users access by restoring the old arrays. Prefer disabling new UI surfaces while retaining strict v2 authorization, or a verified reconciliation.
- Email addresses, invite tokens, private decline reasons and delivery metadata must not appear in shared campaign documents, private full-campaign account copies or logs.
- Migration should be reversible, per-campaign, and dry-run-first with owner, Co-GM, player, suspended and banned fixtures; preserve saved source character IDs and campaign character records.
- Explicitly verify Firebase index and Storage download-token implications before activation.

## Verification

The isolated Node test suite was run on Node 22 and passed (9 tests). The Firebase emulator suite requires Firebase SDK dependencies and emulator services; GitHub CI is the authoritative execution gate. No production Firebase call was made and no deployment was requested.

## Next step

Phase 2.1 will implement a new server-issued UCN lookup directory while preserving existing UCN values and existing member access. Its rollout requires the later canonical-membership authorization gate; the current UCN cannot be treated as an invitation secret after cutover.
