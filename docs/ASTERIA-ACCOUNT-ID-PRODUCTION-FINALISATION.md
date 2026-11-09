# Asteria TTRPG Account IDs — Existing Production Release Finalisation

## Scope
This update completes the operator-side release preparation for **the existing** Firebase project `asteria-ttrpg`. It creates no new project, hosting site, storage bucket or ongoing expense. The existing website, artwork, gameplay and characters are unchanged.

## Delivered
1. New account registration and pending-account retry now use an authoritative `getDocFromServer` read when verifying the assigned Account ID. Cached values must not be treated as final confirmation. Guidance warns that the immutable Auth creation-time policy allows a 15-minute initial assignment window; late retries require reviewed recovery.
2. `scripts/account-id-legacy-operator.mjs` is a **local administrator-only** inspect-or-one-UID-backfill tool. It is not a Cloud Function or web API and does not bulk scan. Each write requires a matching UID confirmation, reviewed exact username, explicit `ASTERIA_LEGACY_ACCOUNT_IDS_BACKFILL_ENABLED=1`, a trusted production project identity, and the existing backend's mandatory rereview inside its transaction. It refuses writes in CI/GitHub Actions.
3. `.github/workflows/firebase-deploy.yml` now includes the manually dispatched **read-only production callable inventory**. An optional Account-ID-**callable-only** deployment is separately gated behind the exact `DEPLOY-ASTERIA-ACCOUNT-ID-CALLABLE` confirmation. Neither option enables the server feature flag, website flag, or legacy migration. The general Firebase deployment workflow remains unchanged.
4. `scripts/account-id-production-finalization.mjs` verifies source and release safeguards, always returns `SOURCE-READY / PRODUCTION-NOT-ACTIVATED` on success (not operational GO). Tests guard against accidentally enabled Account IDs, broad deployments, legacy callable exposure, or weakened registry privacy.

## Operating procedure — No production modifications without approval
1. Inspect read-only backup and Function inventory. Verify project `asteria-ttrpg`, current production Function names, actual deployed Rules, and independently checked backup status. The successful metadata inventory is **not** proof of restore.
2. Carry out a private, read-only Auth and Firestore reconciliation of existing accounts. Do not publish account UIDs, emails, personal data, Auth/export records, or evidence in GitHub Actions logs.
3. Obtain explicit approval to deploy only `functions:asteria:asteriaAccountIdentity` and verify that its runtime `ASTERIA_ACCOUNT_IDS_ENABLED` flag remains disabled. The workflow code is present but never automatically executes on merge.
4. Define an immutable canonical UTC `ASTERIA_ACCOUNT_IDS_REGISTRATION_NOT_BEFORE` rollout boundary at or after approved activation. The backend refuses new-account self-allocation before the cutoff, preventing existing users from bypassing review.
5. Only after a separately approved canary and verified runtime configuration, enable the server flag, then the website `accountIds` flag in a reviewed deploy. Disabling either flag stops new issuance, while assigned IDs remain permanent.
6. For eligible existing accounts, perform a private, reviewed per-UID operator backfill. Inspect first, verify Auth displayName/email vs Firestore username/email, confirm UID and exact username, then enable exactly one UID write. A normal login never backfills existing accounts.
7. Validate a real Android/desktop account registration, Account ID display/clipboard, account switching, profile consistency, collision handling, persistence, late-retry behavior, permissions, monitoring and rollback. The automated emulator suite does not substitute for real authenticated browser checks.
8. Obtain explicit production activation approval before general registration issuance. Maintain a record of approved changes and rollbacks without committing sensitive data.

## Local operator example — only after explicit approval
From a trusted, non-CI administrator workstation with separately approved short-lived Application Default Credentials and access restrictions:

Read-only one-UID review:
`node scripts/account-id-legacy-operator.mjs --project asteria-ttrpg --uid <REVIEWED_UID> --mode inspect`

Approved single-UID migration:
`ASTERIA_LEGACY_ACCOUNT_IDS_BACKFILL_ENABLED=1 node scripts/account-id-legacy-operator.mjs --project asteria-ttrpg --uid <REVIEWED_UID> --mode backfill --confirm BACKFILL-ACCOUNT-ID:<REVIEWED_UID> --expected-username <REVIEWED_USERNAME>`

Never run an automated bulk migration, paste private UIDs into a GitHub workflow dispatch, or use permanent service-account keys. Stop on any mismatch and reconcile manually. This CLI is not a substitute for production backup approval.

## Remaining external blockers
No real production callable deploy, registration flag activation, existing-account migration, authoritative live Auth/Firestore reconciliation, tested live restoration, real-device acceptance, or independently approved canary has been performed here. Production Account IDs are **still disabled**. Those require external verification and explicit, separately scoped authorization.

## Safe outcome
The existing website can continue operating. CI passing and merging this release preparation mean **the code is tested**, not that all users have permanent Account IDs.

## Workload Identity trust-policy compatibility
The initial independent `account-id-release.yml` workflow was rejected by the existing Google Cloud Workload Identity provider (`unauthorized_client`, credential rejected by attribute condition). The remedy is to use the established and previously authenticated `firebase-deploy.yml` workflow for read-only Account ID inventory and separately gated callable-only deployment. The independent workflow is removed. **Do not weaken provider attribute conditions or grant broader IAM roles.** This is a repository change only; re-run `account-id-inventory` manually on `main` to establish live read-only inventory. Do not use `account-id-callable-deploy` until separately approved.
