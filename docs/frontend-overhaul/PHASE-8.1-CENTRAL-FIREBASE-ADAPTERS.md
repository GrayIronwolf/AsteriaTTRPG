# Phase 8.1 — Centralise Firebase Auth, Firestore and Storage adapters

## Existing architecture and replacement

Prior to this phase, `firebaseAuthAdapter.mjs` contained Firebase SDK imports, the default-app singleton, runtime selection, emulator wiring, Auth persistence setup and domain service assembly. This coupled Account-specific logic to application-wide infrastructure. The React/Vite project already used a single injected Auth adapter; this phase **moves the underlying SDK/runtime ownership**, not an additional layer of Firebase projects or mirrored data.

### New single-owner files

- `frontend/src/firebase/firebaseRuntime.mjs` is the only React Firebase initialization path. Lazy SDK imports prevent loading Firebase in the public/guest preview. It validates the existing production or demo-emulator project configuration, refuses mismatched default/named apps and refuses a mode/project switch without reloading.
- The runtime gets the existing default Auth, Firestore, Functions (us-central1) and Storage instances from **one Firebase app**. Local emulator connections occur exactly once per runtime owner, and Auth persistence is configured once before the service facade becomes available.
- `frontend/src/firebase/firebaseClientAdapters.mjs` exports the immutable, dependency-injected Auth/Firestore/Storage/Functions SDK contract. Domain services continue using the same owned client references. No implicit browser-global bridge, second app, local owner cache or independent Firebase initialization is added.
- `frontend/src/auth/firebaseAuthAdapter.mjs` now owns **account-facing functionality and domain service assembly only**. It obtains already-initialized dependencies from `connectFirebaseRuntime`; its account profile, Auth observer, login, reset, username, avatar, and appearance behavior is unchanged.

### Data and security boundaries

- No changes to `firebase.json`, Firestore security rules or indexes, Cloud Functions endpoints, Firestore document paths, Storage paths, or role decisions.
- Existing features still enforce ownership in domain-specific adapters and existing Firestore/Functions security rules. Centralization cannot replace those checks; revocation, subscription lifecycles, and offline retry policy are separate Phase 8.2–8.4 work.
- The standalone React preview stays disabled unless `VITE_ASTERIA_AUTH_ENABLED='true'` **and** an explicit `VITE_FIREBASE_MODE` is supplied. Production continues to target the single existing `asteria-ttrpg` Firebase project. The `demo-asteria` emulator remains loopback-only.
- Incompatible pre-existing Firebase apps fail closed, rather than silently attaching to a different database or Storage bucket.
- Failed initialization clears the cached startup promise and deletes only an app created by this initializer; a pre-existing app is never deleted.
- App-level Auth observer remains the single authenticated subscription owner. Domain adapters are injected once per account facade without creating new SDK instances.

### Acceptance and rollout

`scripts/site-firebase-phase8-1.test.mjs` tests single-app reuse, concurrent consumers, duplicate emulator prevention, project/mode mismatch, guest isolation, failed startup/retry, storage dependency continuity, default app conflict, immutable SDK injection and no feature-level secondary initialization.

The Phase 8.1 GitHub workflow runs these tests, full site check, lint, production preview build verification and real Firebase emulator browser tests for authentication, profiles and Storage. Existing earlier-phase workflows also run. **Merge only when all applicable checks pass.**

No production website or backend deployment is required for Phase 8.1; leave the original website runtime in place until the coordinated migration cutover. Phase 8.2 should focus on subscription ownership; Phase 8.3 on loading/error/offline/caching policy; Phase 8.4 on permissions and cross-feature integration.
