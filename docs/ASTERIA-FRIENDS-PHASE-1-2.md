# Asteria Friends System — Phase 1.2: Secure Exact Account ID Lookup

**Baseline:** `main` at `e1504f78b102f1d93ac04a9f29b8e729ecdb0a05`. **Scope:** server lookup only. No Friends UI, relationship data, friend requests, notifications, campaign invites, account migrations or production activation.

## Implementation

- `functions/friendAccountLookup.mjs`: trusted callable helper resolves an exact `Username#00000` (case-insensitive username, exact five-digit number) from the **private** `accountIdRegistry`.
- Firebase Auth caller is taken only from `request.auth.uid`; admin verifies the calling Auth user is active. Caller must already have a consistent active account assignment, profile and registry entry.
- Lookup cross-checks the target's assignment, current profile, registry reservation and Auth disabled status, without ever returning email, personal name, Auth UID, profile image URL, token or account metadata. Return shape is `{found:false}` or `{found:true,username,accountId}` only.
- Historical username aliases remain reserved and are **not** discoverable. A username change does not alter the immutable UID binding.
- The request is exact only: no prefix search, wildcard lookup, public directory, email lookup or Firestore client reads.
- Each syntactically valid search, successful **or not**, consumes one transactionally controlled quota: **10 per 15 minutes and 40 per 24 hours**, per authenticated UID. Attempts beyond quota fail. The caller is verified before quota is consumed.
- Private `friendLookupThrottle/{uid}` documents are server-owned. `firestore.rules` explicitly denies browser reads and writes; existing identity registry/assignment access remains server-only.
- `asteriaFriendAccountLookup` requires `ASTERIA_FRIEND_LOOKUP_ENABLED=1` on the backend and **defaults off**. The browser never receives a new search control in Phase 1.2.

## Verification

- `npm run test:friends-phase1-2`: exact formatting, privacy, alias behavior, rate limit boundaries, disabled users, corrupted identities and release-boundary tests.
- `npm run test:firebase`: Firebase emulator verifies private registry/throttle denial and transactional quota enforcement.
- GitHub Actions: existing CI runs the whole project test suite, lint, Firestore/Storage emulator tests, production build and **offline** staged packaging of this single callable.
- `scripts/friends-phase1-2-release-package.mjs` stages a minimal package with just the one callable and helper, rejecting unknown dependencies, altered source markers, untrusted GitHub events or non-production project labels.

## Release boundaries

- No production deployment is triggered by PR, merge, website build or ordinary GitHub CI.
- A separately approved **`friends-lookup-deploy`** option has been added to the already-trusted `.github/workflows/firebase-deploy.yml`, avoiding a new workflow identity allowlist entry.
- This manual operation demands `main`, `workflow_dispatch`, `firebase-production` environment and the typed confirmation `DEPLOY-ASTERIA-FRIENDS-LOOKUP`.
- It deploys **only** `functions:asteria:asteriaFriendAccountLookup` from an isolated source package; it does not deploy other Firebase Functions, Firestore/Storage rules, Auth users, website or account IDs.
- Even a successful backend deploy **does not activate search**: `ASTERIA_FRIEND_LOOKUP_ENABLED` remains unset/off and must be independently enabled after a reviewed privacy and multi-account canary.
- Production Firestore security rules should be reviewed alongside any future activation. The existing default-deny protection of unrecognized collections also applies before the new explicit `friendLookupThrottle` rule is deployed.
- Do not begin Phase 1.3 without explicit approval, and never bypass the new backend restrictions by enabling direct client reads.

## Open verification

Automated CI must complete successfully on the PR head; desktop/mobile authenticated lookup and disabled/renamed-user checks are not considered proven by emulator tests. Actual production activation requires a later scope-limited operator decision.
