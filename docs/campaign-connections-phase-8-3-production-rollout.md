# Asteria Campaign Connection Upgrade — Phase 8.3
## Final production rollout, cross-account verification and controlled release

**Repository baseline:** \`main\` commit \`c6a3d7214ecbbeb2ec7bcf23ba4fb186ec906177\` (Phase 8.2, PR #114).  
**This update:** release-readiness tooling, fail-closed sign-off, integrated Firebase emulator acceptance, and the final rollout/rollback playbook. **Not an assertion that production Firebase has been migrated or that real user accounts/devices have passed.**

### Readiness decision at merge

**NO-GO for production migration or public activation until all external controls below are independently established.** The repository contains no verifiable completed Firestore export/restore, no authenticated real-player/GM device acceptance evidence, and no evidence that the production callable/rules/email sending domain has been deployed, monitored and tested end to end. GitHub website CI and Pages deployment do not establish any of those facts.

Website \`window.AsteriaFeatureFlags\` for UCN, join, GM roster, character lifecycle, secure invitation, notifications and email controls remain **false**. Existing production Cloud Function staging/cutover paths are manually guarded by independent server-only environment switches. Do not set them merely to make a test pass.

## Automated delivery

1. \`scripts/campaign-phase8-3-release.mjs\`
   - **\`--audit\`** performs a read-only source audit of the checked-out commit: front-end flags, server-only gates, demo-only migration staging, versioned Firestore/Storage access, and the existing manual Firebase deploy workflow. It emits a \`NO-GO\` status by design because external verification is not inferred.
   - **\`--require-ready --attestation <private.json>\`** validates the shape, timestamp, exact checked-out \`GITHUB_SHA\` if supplied, and references for 12 independent evidence categories. It can report **EVIDENCE-FORMAT-READY**, not proof of authenticity and **never deploys or activates** anything. A responsible operator must independently access and verify the private evidence and sign off.
   - Evidence records, names, contact information, production invitations, access tokens, character sheets, Firebase credentials and reports from private production data **must not be committed** to GitHub. The release record belongs in a restricted, reviewed operational store.
   - The required \`successful-canary-monitoring\` additional evidence item blocks general availability without an observed canary.
2. \`scripts/campaign-phase8-3-release.test.mjs\`: default-off and manual-deploy checks, fail-closed missing/stale/invalid evidence, commit and project mismatch, denied release and canary-before-general checks.
3. \`scripts/campaign-phase8-3-emulator.test.mjs\`: authentic Firebase Rules plus Admin SDK test of owner-verified migration preparation, atomic v2 cutover, GM join request/approval, recipient-private notifications, suspension and immediate access denial, continued player access, and preservation of character XP, inventory, owner sheets and permanent UCN.
4. \`npm test\` and \`npm run test:firebase\` include the new tests. Normal CI still runs production dependency audit, content check, lint, all regressions, the Firebase emulator, build and generated-asset parity.
5. \`.github/workflows/campaign-phase8-3-readiness.yml\` is manual **read-only**: no production environment, no deploy step, no secrets or Firebase login, no email provider, no feature switch. Its success is not a production-go decision.

## Required external evidence for an actual release

Each item needs a restricted evidence reference, a verification timestamp (within seven days), and a person who examined the actual system. The release operator must confirm results, not merely enter \`pass\`.

| Required control | Minimum acceptable proof |
| --- | --- |
| Backup restored and verified | Full current Firestore export, Storage/config/rules inventory and **test restoration** with original record counts/hash comparisons, in an isolated project |
| Rules and Functions deployment | Reviewed and independently verified production \`firestore.rules\`, \`storage.rules\`, indexes and deployed callable versions; explicit Firebase project \`asteria-ttrpg\` |
| Production project/config check | Verified environment scopes, Auth providers, callable regions, domain, App Check policy where applicable, non-public secrets and feature switches |
| Per-campaign migration reconciliation | Private owner-approved legacy v1 dry-run results; no unresolved member, UCN, banned-status, source sheet, character link, recipient privacy or conflict issues |
| Authenticated roles | Real owner, Co-GM, player and outsider accounts; GM approval required; Co-GM privileges must not self-escalate |
| Cross-account/device coverage | Fresh sessions and existing logins on Android, iPhone/iOS, desktop and tablet where supported, sign-out/sign-in, offline/reconnect and stale account mirrors; record actual device/browser versions |
| Revocation denial | Suspended, banned, removed and non-member accounts denied future Firestore, Storage, Function, inventory and shared-character reads; stale legacy arrays never grant access |
| Character gameplay integrity | Preserve source and campaign character IDs, XP, HP/SP/MP, inventory, talents, party and campaign images before/after canary |
| Private invitations and notifications | Invitation expiry, revocation, recipient matching, GM approval, idempotent resend, no leaked email/token, no account-crossed inbox, no private full-campaign mirror authority |
| Email DNS and delivery | Authenticated sending domain (SPF/DKIM/DMARC), verified provider credentials, distinct canary inbox delivery and bounced/failed delivery scenarios; no mass sending |
| Monitoring and incident response | Named on-call and GM contact, error/rate/rule-denial dashboards, objective abort thresholds, defined canary window and manually staffed escalation |
| Non-escalating rollback | Rehearsed rollback retaining restrictive v2 authorization and denied tombstones; never reactivate by setting \`membershipSchemaVersion=1\` or unioning legacy UID arrays |

### Controlled execution order

1. **Freeze and back up.** Name the exact verified \`main\` commit. Securely export production records and test a restore, then verify Storage download tokens, old links and rules. Keep backups outside this public repository.
2. **Stage and evaluate canary, privately.** Select a low-risk campaign whose actual owner explicitly authorizes the migration. Reconcile full membership, authoritative source character ownership and private invitation records. Resolve all warnings before any stage. A repository merge does not perform migration.
3. **Deploy backend manually only after approval.** Use the existing separately controlled Firebase production deployment environment. Review the exact Functions, Firestore and Storage rules first, validate independent gates and credentials. A browser feature flag is not an authorization boundary.
4. **Owner-reviewed cutover.** A separately approved production migration operator must use a limited audited manifest, a backup and an owner-controlled process; the Phase 8.2 module deliberately refuses production staging. Only the existing owner-verified cutover callable may switch the schema, after all canonical records are staged and checked. The client must be compatible and tested.
5. **Canary validation.** Test independent signed-in real accounts, and make the GM approve a pending request. Confirm active-role permissions, revoked old sessions, Co-GM role boundaries, character integrity, invitation privacy, email delivery and notification isolation. Do not infer this from simulated/emulator accounts.
6. **Hold and monitor.** Track Auth, Functions, Firestore permission failures, queue length, email bounces, invalid links, client errors and latency. Suspend activation if there is any unexpected data movement, exposure, permission escalation, character loss or monitoring gap.
7. **General availability is separate.** Require the independent canary evidence, a fresh approval, observable stability and final private go/no-go authorization. The repository tool validates required structure but never triggers rollout.

### Stop and rollback

- **Before v2 cutover:** stop new staged operations; restore only verified backup-derived records through an independent, owner-reviewed recovery operation. Never delete unexpected canonical documents or overwrite banned/suspended statuses automatically.
- **After v2 cutover:** **retain v2 schema and strict active-membership rules**. Turn off problematic **UI controls** and live email sending, restrict invite issuance, investigate missing projections, and reconcile in a controlled process. Never toggle the campaign back to legacy access without separately proving that revoked accounts cannot regain access.
- **After an email issue:** disable only sending and resending; retain existing private invitation records, receipts, notifications and approved membership. Coordinate with the sender to revoke compromised credentials.
- **After lost access:** preserve member tombstones, active sessions and original character sheets. Identify exact denied permissions using restricted logs; repair server-owned projections and canonical identities only under a verified, audited operation.
- **Incident evidence:** store timestamps and redacted error codes in the operator record; never commit personal account/character data, email targets, tokens, credentials, Firebase dumps or signed URLs.

### Current delivery status

| Component | Current status |
| --- | --- |
| Final audited source + unit/emulator regression suite | Implemented in this PR; CI results establish code-level status |
| Read-only readiness workflow | Implemented; separate from production Firebase deploy |
| Site and documentation publication | GitHub Pages confirmation after merge only |
| Verified current production data backup/restore | **Not established** |
| Authenticated real-account/real-device test | **Not established** |
| Production backend deployment/flag activation | **Not performed by Phase 8.3 code** |
| Live per-campaign migration and email delivery | **Not performed by Phase 8.3 code** |
| General-availability authorization | **NO-GO pending independent external acceptance** |

**Safety rule:** Do not mislabel “CI passed” or “Pages deployed” as “production rollout completed.” A live launch requires separately confirmed production access, backup verification, real-user testing and explicit cutover approval.
