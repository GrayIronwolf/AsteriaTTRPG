# Asteria Account ID — combined general release

## Scope
One coordinated release for permanent `Username#00000` identities for **all existing eligible users** and **new registrations**. The first ID `Grayson#01448` remains unchanged. There is no new Firebase project, no demo environment, no change to gameplay or campaigns and no requirement to verify an email to receive a new Account ID.

## Source components
- The already-deployed `asteriaAccountIdentity` callable supports the `general` mode. It requires both the independent operator approval flag `ASTERIA_ACCOUNT_IDS_GENERAL_RELEASE_APPROVED=1` and `ASTERIA_ACCOUNT_IDS_ENABLED=1`, plus a genuine Firebase Auth creation timestamp after an operator-generated UTC cutoff. It still rejects arbitrary UID, number, username and pre-existing Auth users.
- The normal website signup uses `accountIds:true`, issues a permanent Account ID after the Firestore profile saves and **before** sending an optional verification email. It verifies the server-saved ID. A failed issuance leaves the account and pending retry intact.
- The one-time existing-account migration uses Firebase Admin, private server-side reads and the already-tested per-UID transactional backfill. It previews the **entire** Firebase Auth listing before writes; an inconsistent account stops the migration before changes. Permanent IDs are never reassigned. It changes only Account ID fields, assignment and registry documents.
- The production Cloud Shell operator now supports `release-general`, an explicit one-step server configuration switch. It sets `general`, both approval and enable gates, a fresh canonical cutoff, and clears the previous email canary digest in one PATCH. It requires exact `RELEASE-GENERAL` typed confirmation. The original `disable` operation remains the rollback for new issuance.

## Coordinated production order
1. Pass the pull request's complete CI, including Firebase emulator authorization, `npm test`, website build and exact bundle comparison. Do not merge failures.
2. Confirm a currently usable Firestore backup and access to Firebase Auth account recovery. Review owner permissions and verify the expected deployment/function from read-only status. These cannot be inferred from CI.
3. In the trusted operator's Cloud Shell, check out the reviewed pull request branch and install production dependencies. Use the following single, combined release command. The script starts with a read-only check and full existing-account preview. It reports aggregate totals only and **stops before any writes** if even one identity needs manual review.

   ```bash
   git clone --depth 1 --branch feat/account-id-complete-general-release https://github.com/GrayIronwolf/AsteriaTTRPG.git /tmp/asteria-id-release
   cd /tmp/asteria-id-release
   npm ci --omit=dev --no-audit --no-fund
   bash scripts/account-id-cloud-shell-release.sh
   ```

4. The launcher uses the existing Firebase Admin service account through short-lived impersonation, not unsupported Cloud Shell end-user ADC. If impersonation is refused, stop and grant the current operator **Service Account Token Creator on that one service account** through a separately reviewed permission change. No private keys are downloaded. If the preview is clean and the administrator accepts the production operation, enter `COMPLETE-ASTERIA-ACCOUNT-IDS` once. The script repeats the account scan, assigns all eligible existing IDs transactionally, preserves previous permanent IDs and switches the existing Cloud Function to general registration only after migration reports success. A failure blocks the activation; partial migration can be reviewed and resumed without regenerating IDs. Use a current full backup and verified account-recovery plan before running.
5. The script confirms `BACKEND ACTIVATED; PUBLISH WEBSITE` only when the backend's general flag, independent approval flag and fresh registration cutoff are verified. This does **not** imply that the website has been published yet.
6. Merge and publish this PR only after backend activation and successful migration, so the public UI is not enabled before the backend.
7. Perform one live end-to-end test using a previously created account **without** modifying its assigned ID; create another fresh unverified account and verify immediate ID issuance. Test persistence, account switching, concurrent signup, logout/login, profile copy, mobile and unaffected campaign/character state.
8. Run the read-only Account ID production audit and check new issuance counts, Function errors and registration errors. Investigate exceptions instead of overwriting IDs.

## Failure and rollback
If registration issues occur, run `node /tmp/account-id-canary-operator.mjs disable` with typed `DISABLE`. This stops **new allocations**, not already assigned IDs or existing account sign-in. If the PR has not been merged, keep it unmerged. If merged, revert only the website feature flag, leaving existing assignments intact. Never delete user accounts or regenerate identifiers. Migration errors halt and require review of the affected account; never turn an identity mismatch into an automatic overwrite.

## Verification limits
This repository change alone does not activate Firebase, run a real migration, prove backups restorable, or verify a live website session. The operator must approve real production actions after CI. A green pull request is not a live production test.
