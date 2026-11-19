# Phase 8.3 — Loading, errors, offline policy, caching and performance

## Boundary
This phase extends the single Firebase SDK runtime (8.1) and shared account-scoped realtime transport (8.2). It does **not** change the established Asteria game service contracts, gameplay, Firestore paths, authorization rules, backend functions, or production feature flags.

## Implemented policy
- **Loading and recovery:** Existing account/Forge/GM/Player loading states continue until server verification. The React connection boundary suspends signed-in private screens on browser offline events or exhausted server availability failures. It unmounts those views and their Firestore listeners; restoration/retry remounts views to demand fresh membership and ownership checks. A sign-out action remains available while offline.
- **Errors:** Transient Firestore `unavailable`, `deadline-exceeded` and network-request failures receive at most two additional attempts (150 ms and 450 ms), after which the connection shows a recoverable unavailable state. Permission-denied, missing records and validation failures are never retried. Mutations and Firebase Functions calls are **never automatically replayed**.
- **Account isolation:** In-flight reads must match the Auth UID after every awaited server call and before returning. One in-flight document read per UID, method and exact document path can be shared; filtered queries and collection queries remain independent. Completed results are never stored in the read layer.
- **Offline/cache policy:** Private Firestore data is server-only (`getDocFromServer` / `getDocsFromServer` and metadata-confirmed realtime snapshots). No IndexedDB persistence, localStorage, Cache Storage, service worker, or private offline fallback is introduced. Existing bounded-by-live-subscriber memory snapshot reuse is revoked on offline/connection failure and Auth changes. Generated, publication-validated public Compendium shards retain their existing in-memory promise sharing; no new public/GM data projection is created.
- **Performance:** Coalesce concurrent identical document reads, share verified Firestore document/collection subscriptions, stop transport when no consumer remains, limit retries, and remount affected private views rather than creating competing SDK instances or CSS/JS systems. No fabricated speedup measurements.
- **Browser online status is not proof of backend availability.** Reconnection always requires the same live server checks as initial load. A connection banner is not an authorization boundary; existing Firestore rules and service checks remain authoritative.

## Verification
`scripts/site-firebase-phase8-3.test.mjs` verifies retries, non-retriable failures, deduplication, query isolation, cache rejection, Auth account switches, offline listener disposal, stale callbacks and source invariants. The dedicated Phase 8.3 CI workflow also runs all prior site tests, lint, isolated and authenticated Vite builds, artifact parity and a real authenticated emulator browser offline/restore flow. Earlier acceptance workflows remain required.

## Release
**No production deployment** until the final ten-phase React/Vite migration cutover. GitHub merge is not a Firebase deployment. Phase 8.4 owns comprehensive cross-feature permission and integrity auditing.
