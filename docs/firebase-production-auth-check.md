# Safe Google Cloud authentication check — Firebase production

## Why this exists

The November 8, 2026 manual campaign-artwork-rules deployment failed in Google's identity exchange with `unauthorized_client` and `The given credential is rejected by the attribute condition.` The configured Google Workload Identity Provider maps `attribute.workflow_ref=assertion.workflow_ref` and allows only:

`GrayIronwolf/AsteriaTTRPG/.github/workflows/firebase-deploy.yml@refs/heads/main`

The failing workflow used a **different filename**, `.github/workflows/deploy-campaign-artwork-rules-manual.yml`. The October 18 deployment of `firebase-deploy.yml` previously succeeded. No Google Cloud IAM condition needs to be relaxed to test the existing authorised workflow.

## Safe test

1. Merge this PR after all checks pass. Do **not** run a historical workflow or its rerun button; those execute older versions.
2. Open GitHub **Actions → Deploy Firebase backend (manual) → Run workflow**.
3. Keep **branch `main`** and leave **Operation = `auth-check`** (the default).
4. Leave **Production confirmation** blank.
5. Start the workflow. If `firebase-production` requires a reviewer, approve **only this auth-check** after verifying its selected operation; its production environment still controls OIDC access.
6. Inspect the **Google Cloud authentication only (no deployment)** job. The `google-github-actions/auth@v3` step must succeed, and the expected project check must pass.
7. A read-only Cloud Functions listing is attempted. If IAM lacks inventory permission, the listing step is recorded as an unavailable inventory and must be reviewed separately; authentication success is still distinguishable from inventory access.
8. Preserve the Actions run URL. This test does not deploy, list secrets, enable flags, send emails or migrate campaigns. It also does not prove which Firestore/Storage rules are deployed.

**Do not choose `deploy` or enter the production confirmation phrase while diagnosing authentication.** The real deploy job remains separately gated on exact operation `deploy`, exact confirmation `DEPLOY-ASTERIA-PRODUCTION`, `main`, and the `firebase-production` environment, followed by the existing audits/tests and an actual Firebase deployment command.

## What this does not fix

- An authentication-only run cannot itself prove that the production Cloud Functions and security rules match current GitHub source.
- A rejected token from the approved workflow would require read-only inspection of the Google Workload Identity Provider's complete attribute condition and the workflow's issuer claims. Do **not** disable the attribute condition or broaden it to all workflow files.
- The GitHub deployment service account needs separate least-privilege checks before any future real rollout.
- Production backups, restore tests, email sending credentials/DNS verification, migration readiness, real GM/Player testing, and controlled feature-flag activation remain separate release gates.
- The alternate `deploy-campaign-artwork-rules-manual.yml` still cannot authenticate under the existing workflow-specific provider condition. Prefer using the designated `firebase-deploy.yml` after an approved production release, rather than weakening federation trust.

## Release status

A successful **code CI** run after merging this change verifies the workflow and source checks only. The OIDC test requires a `workflow_dispatch` from `main` and may need GitHub environment reviewer approval. No production deployment is performed automatically by this PR.
