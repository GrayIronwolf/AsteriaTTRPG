# Account IDs Phase 2.2 — Existing Account Assignment

This phase adds safe backend-only tools for *individual existing accounts*, building on merged Phases 1.2–2.1.

## Review
`inspectLegacyAccountIdentity` cross-checks the exact Firebase Auth UID, active status, display name, email, and the Firestore account profile. It verifies normalised username, rejects missing or conflicting records, and verifies any prior Account ID mapping against the permanent assignment and unique registry. The preview performs no writes and returns only eligibility or a manual-review reason.

## Allocation
`backfillLegacyAccountIdentity` requires `enabled:true`, exact `BACKFILL-ACCOUNT-ID:<uid>` confirmation, and the matching Firebase project identifier. It processes exactly one UID, then uses the Phase 1.3 transaction allocator with the previously reviewed username pinned inside the write transaction. Collisions retry, immutable identifiers are preserved, and successful retries are idempotent.

## Deployment boundary
No public callable, bulk scan, migration runner, scheduled work, production Firebase changes, or flag activation is introduced. This is an operator-only library requiring a future separately approved execution workflow. Accounts needing reconciliation remain unchanged.

## Verification
`npm run test:account-id` includes Phase 2.2 unit cases; `npm run test:firebase` adds emulator authorisation tests. Require green GitHub CI before merging. Later phases must provide separate legacy account recovery, safe operator rollout, account-menu display, and friend discovery.
