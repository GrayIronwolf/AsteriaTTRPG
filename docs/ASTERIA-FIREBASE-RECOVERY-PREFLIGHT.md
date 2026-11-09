# Asteria TTRPG — Step 2: Isolated Backup Recovery Preflight

## Current status

The GitHub backup/configuration inventory succeeded (manual run #18). Google Cloud authentication, Firestore database visibility, point-in-time recovery, daily and weekly backup schedules, two READY Firestore backups and Storage-bucket metadata were confirmed.

**A successful metadata inventory does not prove that Firestore, Firebase Authentication, Storage or Cloud Functions can be restored. The current status is RESTORE NOT VERIFIED.** No production data was accessed for this preflight.

## Recovery architecture

A Firestore managed-backup restore creates a distinct Firestore database **within the same Google Cloud project**, not directly into a separate Firebase project. Such a database is not automatically an appropriate sandbox: it shares project-level identity, quota, operational boundaries and IAM concerns. Do not treat a new database in `asteria-ttrpg` as a fully isolated test environment.

For a fully isolated project, separately plan a controlled Firestore export/import under approved identities and access controls. An export/import requires additional storage permissions and private source-data handling; this pull request neither exports nor imports any data.

Firebase Authentication users require their own separately verified export/reconstruction strategy, with UID preservation, credential handling restrictions and provider/credential limitations reviewed before execution. Cloud Storage artwork must be separately inventoried and tested for recoverability, ownership, paths, object metadata and Security Rules. A Firestore backup alone cannot prove either is recovered.

## Stage A — Offline synthetic-only preflight (implemented)

Run `npm run test:firebase-recovery` or `node scripts/firebase-recovery-preflight.mjs`. Both operate only on fabricated identities and ownership data with **no Firebase or Google Cloud SDK calls**. Tests reject:
- Production project as destination, or ambiguous/unsafe sandbox project names.
- Cloud credentials, real account data, production writes or actual restore execution.
- Unsupported direct cross-project managed-backup transfer.
- Missing Auth account identities, conflicting Account IDs, absent characters or owners.
- Broken campaign memberships, character ownership or Storage paths.

A passing result is **PLAN-READY / RESTORE-NOT-VERIFIED**, never GO for deployment.

## Stage B — Separately approved isolated recovery test (not performed)

1. Independently verify the source project, backup freshness, geographic residency and a backup ID through private administrator records. Do not put backup IDs, user data, export bucket paths or credentials into GitHub logs.
2. Provision a distinct Firebase/GCP sandbox project with billing, constrained IAM, no public web hosting, outbound transactional email disabled and production integrations off.
3. Establish a *separate* backup evidence and restore design for Firestore, Authentication, Cloud Storage, Rules, indexes and Functions configuration. Review encrypted export location, retention and data deletion procedures.
4. Require explicit written approval, least-privilege temporary identities, a sandbox-specific budget and a tested abort/cleanup procedure before any production-data export or restoration.
5. Execute on a limited, approved test dataset using manually reviewed tooling. No public callables, production webhook or email functions may execute in the sandbox.
6. Validate exact Auth UID ownership, character inventories, GM/party membership, campaign image and character image paths, permanent Account ID mappings, ownership and privacy rules. Verify no source data changed and no cross-account leakage occurred.
7. Record an independent restore-test result, clean up all temporary credentials/export objects and sandbox resources, and retain only approved non-sensitive evidence.

## Explicit exclusions and stop conditions

This change does not create cloud backups, restore data, deploy Firebase, change IAM, run migrations, send emails, activate Account IDs or change friend/campaign features. Stop if the sandbox cannot be confirmed separate, permissions are broader than reviewed, private artifacts lack an expiry/cleanup plan, or a real UID/account ID mapping differs after restoration.

**Next gate:** Request separate approval for an isolated, supervised restore test. The current read-only backup audit and this synthetic preflight are not proof of production disaster-recovery readiness.
