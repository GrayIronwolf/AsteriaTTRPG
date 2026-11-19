# Phase 8.2 — Realtime subscriptions and state management

## Boundary and single owner

Phase 8.1 established the one Firebase Auth, Firestore, Functions and Storage runtime. Phase 8.2 consolidates the transport ownership for React/Vite Firestore subscriptions **without replacing the existing gameplay adapters**, Firestore rules, data paths, queries, or backend. The existing `createAuthObserver` remains the sole Auth event owner, and now notifies a shared subscription hub when the signed-in UID changes.

## Changes

- `frontend/src/runtime/realtimeSubscriptions.mjs` manages scoped Firestore watchers and deterministic disposal. Identical document/collection references are shared and reference-counted within the same account; the last consumer unsubscribes the actual Firebase transport. **Filtered Query objects are never coalesced**, even if their collection paths match.
- Domain subscriptions keep using their existing `firestoreSdk.onSnapshot` API via a single injected `createSharedFirestoreSdk` facade. The component/service-specific campaign, character, role, and source-link checks continue to run before projecting or publishing data. There is no new competing state owner.
- Only server-confirmed snapshots are delivered or replayed; cached/offline snapshots and pending local writes do not grant permissions. This is deliberately fail-closed pending Phase 8.3's offline design.
- Account changes and sign-out invalidate every active scope, unsubscribe all underlying transports, and prevent late callbacks or prior-user state from reaching another account. Firestore permission errors close the affected stream, and independent workspaces remain isolated.
- React unmount/StrictMode repeated subscriptions close deterministically; callers receive an idempotent unsubscribe. Reference-counting avoids redundant Firestore streams across overlapping components without sharing private results between distinct queries.
- Existing GM/Player dashboards, combat, progression, economy, media and Digital GM service watch APIs remain intact. No hidden-data publication or broader Firestore query is added.

## Testing

`scripts/site-firebase-phase8-2.test.mjs` exercises duplicate listener ownership, filtered-query isolation, strict snapshot confirmation, late replay, auth switch and sign-out revocation, stale callbacks, permission errors, per-subscriber failures, SDK facade interoperability, StrictMode disposal and exactly one Auth change owner. The dedicated Phase 8.2 workflow also runs `site:check`, lint, production/guest build integrity and a real two-account Auth/Firestore/Functions/Storage emulator browser flow. Prior-phase workflows continue to guard compatibility.

## Deployment

Do not run a Firebase deployment. Keep production activation disabled until the approved combined migration cutover. Phase 8.3 owns offline behavior, caching, loading, retry and performance; Phase 8.4 owns additional cross-feature permission and integrity auditing.
