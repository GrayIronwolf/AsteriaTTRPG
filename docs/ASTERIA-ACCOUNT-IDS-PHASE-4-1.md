# Asteria Account ID Upgrade — Phase 4.1: Testing and Release Readiness

## Scope and baseline
Phase 4 is a single testing/release-readiness update, following Phase 3.3 merged at `f4c1cc813871fb0c34a6e7a2663d02c1f70f5eca`. This work adds offline auditing, integrated tests, Firebase emulator acceptance and a manual go/no-go checklist. It does **not** turn on Account IDs, perform a migration, deploy Firebase or send emails.

## Important finding — release blocked
`asteriaAccountIdentity` is gated by `ASTERIA_ACCOUNT_IDS_ENABLED` and authenticates the Firebase UID, but after gate activation it directly calls `ensureAccountIdentityProfile`. It does **not** cross-check whether an existing account is eligible using `inspectLegacyAccountIdentity`. Therefore any already-authenticated eligible-looking legacy profile could self-initiate Account ID issuance if the server-side flag were activated. This conflicts with the approved operator-reviewed, one-account-at-a-time legacy backfill policy. **Do not enable that server flag or the website `accountIds` flag until this pathway is explicitly resolved, reviewed and retested.** The release audit records this as a fail-closed operational blocker, even when all current code tests pass.

## Automated checks
- `npm run test:account-id` includes 4.1 release source and evidence-attestation tests, end-to-end concurrent ID uniqueness/leading-zero/profile persistence, cross-account ownership and incomplete profile recovery.
- `npm run test:firebase` includes a real Firestore/Auth emulator acceptance run for simultaneous case-insensitive collisions, private registry and profile reads, immutable Account ID fields, preservation of character data, and idempotent/manual-reviewed legacy migration.
- `npm run audit:account-id` is a **read-only** source audit reporting default-off UI flags, callable server flag, transaction and Firestore Rules integrity, protected profile display, private legacy tooling, manual production deployment and the unresolved legacy caller boundary. The audit deliberately reports `releaseDecision: NO-GO`, and its exit code represents static-check quality, not production readiness.
- `node scripts/account-id-phase4-1-release.mjs --require-ready --attestation <private.json>` validates the form of a future private evidence record, but **always exits NO-GO**. It never certifies evidence authenticity or deploys production resources. Do not commit any real production evidence or account data to the repository.
- Existing GitHub CI still checks dependency audit, lint, all Node tests, Firebase emulator tests, content validation, production build and generated website bundle.

## External production acceptance (not completed)
The following evidence must be independently reviewed and stored privately. Each requires an authentic approved reference and recent verification; a file with `result:pass` is not itself proof.

| Area | Required operational proof |
| --- | --- |
| Backups | Production export and verified isolated restore, records and permissions reconciled |
| Legacy accounts | Operator-reviewed representative account inventory, no unresolved profile/Auth mismatches; confirm no unauthorized self-backfill |
| Server policy | Reviewed deployed Rules, Functions, environment flags and project `asteria-ttrpg`; callable identity boundary repaired |
| Identity allocation | Authenticated new-account canary, concurrent normalized username/suffix collisions, retry/reload idempotency |
| Privacy | Owner-only profile reads, no private registry leakage, rejected cross-user access |
| Account switching | Sign-out/in between multiple accounts, stale cached identity/clipboard prevention |
| Devices | Real Android, iOS, tablet and desktop/browser authenticated navigation and popup tests |
| Account UX | Verified My Profile display and Copy ID including leading zeroes, pending/repair states |
| Monitoring | Auth/Functions errors, Firestore rule denials, objective abort thresholds and incident owner |
| Rollback | Tested disablement and safe recovery without reassigning permanent IDs or widening database access |

## Release sequence
1. Keep both Account ID flags false, review PR and CI results, and resolve the server-side existing-account allocation bypass.
2. Perform read-only production Auth/Functions and backup inventory using the separate approved manual GitHub workflows, verifying exact project and permissions.
3. Take/verify backups and restore in isolated infrastructure. Check real account records and legacy mismatches privately; do not export them into GitHub.
4. Run approved, low-risk new-account and existing-account canaries behind scoped permissions; test identities, navigation, persistence and cross-device sessions.
5. Obtain an independently signed, current go/no-go approval and monitor canary behavior. General availability requires separate successful canary evidence and authorization.
6. Activate only after the above is verified; rollback by disabling flags and stopping issuance while preserving existing permanent mappings and restrictive Firestore Rules.

## Explicit exclusions
No friend lists, campaign invitations changes, production Account ID assignment, account migration, Firebase deployment, backend gate activation, notifications activation or real-device claims are part of Phase 4.1.
