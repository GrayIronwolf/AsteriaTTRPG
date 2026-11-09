# Asteria TTRPG — Step 2.2: Read-only Firebase backup inventory

**Scope:** Inspect production backup and configuration **metadata only**, via the existing restricted GitHub Workload Identity Federation identity. **No exports, restores, migration, deployment, feature activation, Firestore document access, Storage object enumeration, or credential changes.**

## Run instructions

1. After PR review and passing full CI, ensure the workflow update is merged into `main`.
2. Open GitHub **Actions → Deploy Firebase backend (manual) → Run workflow**.
3. Select the **main** branch.
4. Set **Operation = backup-audit** (not `auth-check` and definitely not `deploy`).
5. Leave **Production confirmation** blank.
6. Run the workflow. Approve `firebase-production` environment access only after confirming the `backup-audit` operation. The job invokes `google-github-actions/auth` with the **existing** provider and deployment service account.
7. Open the **Firebase backup and configuration inventory (metadata only)** job and inspect the **Summary** tab.
8. If a check reports **not verified**, inspect read-only IAM/API permissions with the project owner; **do not grant Owner/Editor or widen the Google OIDC provider restriction**.

The workflow continues to default to `auth-check`, and production `deploy` continues requiring a separate operation and explicit confirmation. This audit does not run automatically from pull requests or website updates.

## Metadata collected

- Firestore database presence, location, point-in-time recovery setting, earliest available PITR timestamp.
- Existing scheduled backup count, cadence and retention settings.
- Available managed Firestore backup count, READY count and latest recorded READY snapshot timestamp.
- Sampled Firestore admin-operation history for export entries (a history record does not prove files still exist).
- Cloud Storage bucket count and whether the website-configured `asteria-ttrpg.firebasestorage.app` bucket exists; its region, versioning and soft-delete retention, if readable.
- Count of other buckets, **without listing their names**.
- Firestore composite index count and expected `events` index states, where readable.

The summary does **not** contain actual backup resource names, Cloud Storage bucket names other than the publicly configured application bucket, URLs, user IDs, invitation tokens, campaign names, character data, secrets or raw Cloud API responses.

**Read-access failures are expected** if the deployment service account has only deployment permissions. Missing access is marked **not verified**, not zero. The job exits with a nonzero result if core backup metadata cannot be retrieved. Request only least-privilege metadata read access from an authorised Google Cloud administrator if needed. Do not use a service-account key or add credentials to GitHub.

## Release decision

Even if a managed backup shows READY, **do not interpret that as restore verified**. A ready Firestore backup by itself does not include Storage objects, Auth user recovery or all deployed backend configuration. A protected export/copy of the complete needed recovery set and a **separately approved, isolated-project restore test** are mandatory before production activation. Backup creation or restore is a future, separately authorised procedure; neither is in this workflow.

## Evidence handling

Keep operational reports and sensitive backup evidence in restricted storage, not this repository. GitHub Actions reports are visible according to the repository's Actions permissions; only high-level, non-sensitive metadata is printed. Do not use real Firebase credentials or production Firestore exports inside local emulator tests.

The original project is `asteria-ttrpg` and the expected database is `(default)`. Verify current project/database/bucket information before proposing any actual backup creation. Retain production feature flags disabled and do not run the full backend deploy.
