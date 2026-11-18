# Phase 4.1 — React Firebase Authentication Migration

## Contract

- The isolated Vite app uses the same **asteria-ttrpg** Firebase project and existing Email/Password, owner-scoped Firestore `users/{uid}` profile and server-owned Account ID callable.
- The default preview remains **Firebase-disconnected**. To deliberately test with emulators, set `VITE_ASTERIA_AUTH_ENABLED=true VITE_FIREBASE_MODE=emulator` while building and running on localhost. `production` mode also requires an explicit `VITE_ASTERIA_AUTH_ENABLED=true`; the existing production website remains unchanged.
- React's single `AuthBootstrap` lazily initialises one Firebase app/Auth/Firestore/Functions collection after opt-in. No `window.AsteriaFirebase`, secondary project or new Firebase backend/schema is introduced.
- The React Auth provider owns exactly one observer, discards stale UID transitions, refuses local profile caches as authority and only displays a verified header identity when the authenticated Firebase UID and email match a server-read profile.
- The login, account creation, and password reset pages replace their **isolated preview** placeholders only when Auth is enabled. All other protected routes (profile, account settings, Friends, GM/Player dashboards, campaigns and invitations) remain locked for subsequent phases.
- Registration reuses the canonical validation, saves the owner-scoped Firestore profile, requests a permanent Account ID via the existing trusted callable (the server validates rollout) and then attempts Firebase email verification. If later steps fail after Auth creation, the UI truthfully reports incomplete setup; it never deletes the existing Auth account, invents an Account ID, writes registry documents or silently re-registers the user.
- Reset responses avoid account enumeration; Firebase SDK handles credentials without storing passwords in the new React app. Sign-out clears the Auth session and header. A successful sign-in does not navigate a returning user away from Home.

## Evidence

- Source and async session lifecycle tests verify public Firebase config, opt-in gating, safe UID ownership, no stale listeners, generic errors and no automatic activation of protected routes.
- GitHub workflow runs **all previous** isolated React and offline guest acceptance tests first, then builds an explicitly enabled emulator-only bundle and tests registration, login/logout, persisted sessions, password reset, responsive layouts and protected route isolation against disposable Firebase Auth and Firestore emulators.
- Account ID callable assignment is **not falsely claimed** as tested by the two-emulator browser suite; existing repository-wide production/rollout security tests remain independent. The demo Functions endpoint may be unavailable and the new registration UI must display an accurate pending warning.

## Cutover boundary

No live `index.html`, legacy scripts/styles, real user data, Firestore/Storage security rules, Firebase deployment configuration or hosted production bundle is changed. Keep the existing website running; only the final approved Phase 10 cutover can replace it.
