# Phase 10.2 — Full end-to-end functionality and Firebase security

## Goal
Establish an independently repeatable release gate for the React/Vite website using real Firebase Auth, Firestore, Functions and Storage emulators. Do not deploy, change production hosting or use real player accounts.

## Added in Phase 10.2
- `scripts/site-cutover-phase10-2-security-emulator.test.mjs` tests Firestore and Storage permissions as guest, GM owner, active co-GM, active player, suspended player and outsider.
- Covers private profile and character ownership; protection against editing permanent account IDs; campaign/member role escalation; check request filtering, group result secrecy and idempotency receipt privacy; public and private battle maps and GM annotations; private shops, loot, stash mutations, trade and requests; social and notification confidentiality; media and avatar Storage access; and immediate access revocation.
- Tests positive and negative cases against actual `firestore.rules` and `storage.rules`, with independent synthetic fixtures written with disabled rules.
- Dedicated `npm run site:cutover-security-phase10-2` script and `.github/workflows/frontend-phase10-2-acceptance.yml` runner; additionally re-runs existing universal check and recording access tests, public content security audit, legacy retirement protections and React build.

## Existing full browser end-to-end verification gates
The checked-in frontend acceptance workflows also run on `package.json` changes and are required to pass before merge:

| Feature | Existing acceptance workflow |
| --- | --- |
| Guest-to-GM/Player signup, character/campaign Forge and role capture | `frontend-phase10-1-acceptance.yml` |
| Account/profile, Friends, notification, guest-only routing | `site-foundation.yml`, `firebase-checks.yml` |
| Character creation, join, approval, deactivation, restoration and account isolation | `frontend-phase6-2-acceptance.yml` |
| GM campaign dashboard, real-time session actions, role denial | `frontend-phase6-1-acceptance.yml` |
| Map upload, sharing, projector and multimedia | `frontend-phase6-4-acceptance.yml` |
| Initiative, AP, combat sessions and authorized commands | `frontend-phase7-1-acceptance.yml` |
| Progression, XP, physical/digital checks and character synchronization | `frontend-phase7-2-acceptance.yml` |
| Shops, crafting, inventory, trade, party stashes and loot | `frontend-phase7-3-acceptance.yml` |
| GM NPCs, relationship and reputation permissions, role-safe projections | `frontend-phase7-4-acceptance.yml` |
| One Firebase runtime, listeners, reconnect, access revocation and cross-feature checks | `frontend-phase8-1-acceptance.yml` through `frontend-phase8-4-acceptance.yml` |

These are separate automated suites; the Phase 10.2 rules-matrix workflow does not falsely claim to perform every prior browser scenario on its own. Phase 10.1 evidence and this PR's checks together form the pre-cutover regression baseline.

## Release safeguards and outstanding work
- No production access or deployment, no changed Firebase rules or generated assets, and no replacement of live `index.html`.
- Any unexpectedly permitted outsider request, denied legitimate owner access, or unreviewed rule discrepancy must fail CI; do not weaken rules just to make tests green.
- Existing authenticated **legacy production** GM and player visual baselines remain unavailable in offline CI (Phase 10.1 limitation). Production parity approval therefore remains blocked until redacted and authorized legacy comparison is available.
- Phase 10.3 still covers mobile design, accessible behavior and measured performance; Phase 10.4 still requires rollback strategy, artifact/cached-session safety and the approved Hosting cutover.
- Deployment remains reserved for the user in Phase 10.5, not this phase.

## Run locally
From the repository with Node and Firebase CLI installed:
`npx firebase emulators:exec --project demo-asteria --only firestore,storage "npm run site:cutover-security-phase10-2"`

No additional Firebase project or paid service is required.
