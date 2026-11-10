# Asteria Account IDs — verified registration canary preparation

## Scope
This update prepares a **single-account** issuance canary for the existing production project `asteria-ttrpg`, without activating Account IDs or modifying any user data, Firestore rules, Storage rules, existing functions, or website settings. The previous Account ID callable was successfully deployed by workflow #27; the live published Firestore rules exactly matched the reviewed repository in audit #29.

## Security boundary
The callable still requires all of the following before any Account ID reservation:
1. An authenticated Firebase Auth account and exact `{action:'ensure'}` request.
2. `ASTERIA_ACCOUNT_IDS_ENABLED=1` in the function runtime. Currently **disabled**.
3. A canonical UTC `ASTERIA_ACCOUNT_IDS_REGISTRATION_NOT_BEFORE` set no earlier than the separately approved activation boundary.
4. Auth-maintained creation time not before that boundary and within 15 minutes.
5. Firebase Auth display name and verified Auth email matching the canonical Firestore profile.
6. **New:** `ASTERIA_ACCOUNT_IDS_ROLLOUT_MODE=canary` and an operator-approved lowercase email SHA-256 digest in `ASTERIA_ACCOUNT_IDS_CANARY_EMAIL_SHA256`.
7. **New:** Firebase Authentication `emailVerified === true`, verified on the server, and matching the canary digest.

The canary configuration admits only the explicitly reviewed verified email owner. A browser flag alone can never bypass this gate, and arbitrary rollout modes such as `general` are **not implemented** and fail closed. Never publish an email address, digest, UID or account record in GitHub Actions logs.

## Important real-world constraint
Firebase Email/Password users generally start with `emailVerified=false`. The existing registration UI does not currently send an email verification message. The approved canary must therefore include an independently reviewed way to verify the test account before making the authenticated callable request **within 15 minutes of Auth account creation**. Do not promise that the current public registration screen can finish the canary. Do not enable the public website `accountIds` flag in this update.

## Next production steps, separately approved
1. Verify the required private existing-account Auth/Firestore reconciliation and rollback/backup evidence, without uploading PII to GitHub.
2. Approve and deploy **only** the updated `asteriaAccountIdentity` callable using the established isolated package workflow; do not run a broad Firebase deployment. This repository update alone does not change the live callable.
3. Verify the code deployment, then configure the explicit cutoff, `canary` mode and canary digest through a separately approved minimal Cloud Functions configuration change. Setting `ASTERIA_ACCOUNT_IDS_ENABLED=1` is **not authorised by this preparation**.
4. Prepare email verification and an authenticated canary invocation with a fresh account, then verify one assignment, immutability, copy/display, collision and failure paths.
5. Re-run the redacted `account-id-activation-audit` operation and perform an independent review. Keep the public website flag disabled until the canary and evidence requirements pass.
6. General release needs its own reviewed change to allow `general` rollout mode, explicit approval, and separate activation. No backfill or migration of existing accounts is in scope here.

## Rollback
If there is any unexpected behavior, leave the website flag disabled and set the backend issuance flag off. Existing assigned IDs remain permanent; never delete or regenerate them for a rollback.

## Current outcome
**PREPARATION ONLY / NOT ACTIVATED**. Repository tests are not a live canary.
