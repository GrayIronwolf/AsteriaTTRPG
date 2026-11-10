# Asteria Account ID — single-email canary operator

This is a **production Cloud Shell operator procedure** for the existing project `asteria-ttrpg`. It does not create a project, enable Cloud APIs, edit Firestore rules, deploy source code, or touch existing user accounts. The tested `asteriaAccountIdentity` callable is already deployed in `us-central1`.

## Release prerequisites
- GitHub Pages deployment **#188 attempt 2** must show success for the test-only `?account-id-canary=1` UI. The initial deployment timed out in the Pages queue; attempt 2 succeeded.
- GitHub Actions run **#31** verified the callable is ACTIVE, Firestore rules match the repository, issuance disabled, cutoff absent, and no canary configured.
- The specific new email must be accessible but must **not yet be registered in Firebase Auth**. The current approved testing mailbox is held by the account owner and is entered interactively, not committed to GitHub. No existing account should be deleted.
- The user who operates Cloud Shell must have Cloud Functions v2 update permissions for the project. If an API call fails, stop instead of granting broad roles.

## Installation (Android, Google Cloud Shell)
Open https://shell.cloud.google.com/ in Chrome; use **Desktop site** if necessary. Open the existing Google Cloud project. Copy the verified source file to the temporary Cloud Shell workspace:

```bash
curl -fsSL https://raw.githubusercontent.com/GrayIronwolf/AsteriaTTRPG/main/scripts/account-id-canary-operator.mjs -o /tmp/account-id-canary-operator.mjs
node /tmp/account-id-canary-operator.mjs status
```

This source file is in the reviewed `main` branch. The `status` operation is read-only. Do not use `curl | bash`.

## Stage — disables issuance while setting only the approved tester
After reviewing this code and confirming the real test email, run:

```bash
node /tmp/account-id-canary-operator.mjs stage
```

At the prompt, type the **approved new test email address**. Input is visible in the operator's own terminal but is **not sent to GitHub**, logged by the script or printed in the resulting summary. The script normalises it to lowercase, computes its SHA-256 digest in memory, and patches the **existing function's runtime environment variables only**. It preserves unrelated variables; validates the function name, state, region, update timestamp, and project; requires issuance not already enabled; sets `ASTERIA_ACCOUNT_IDS_ENABLED=0`, `ASTERIA_ACCOUNT_IDS_ROLLOUT_MODE=canary` and `ASTERIA_ACCOUNT_IDS_CANARY_EMAIL_SHA256`; and clears any cutoff. It waits for the Cloud Functions update to finish.

Run:

```bash
node /tmp/account-id-canary-operator.mjs status
```

Expect **ACTIVE / DISABLED / CONFIGURED / NOT SET**. Then run the separate read-only GitHub workflow operation `account-id-activation-audit`; it must confirm **DISABLED**, **VERIFIED-EMAIL CANARY CONFIGURED**, **NOT SET** and **EXACT SOURCE MATCH**. Do not register the new user yet.

## Stage for automatic verification-free registration (separate approval)
The original `stage` action stays unchanged and still stages the verified-email canary. After the separately approved deployment of the **new** automatic-ID callable, use `stage-auto` to stage a different, genuinely new Auth email for the verification-free smoke test. The operation leaves issuance **disabled** and clears the previous registration cutoff. Do not use an address already registered as a Firebase Auth user. A Gmail plus address can be used if it is not already registered, but it must be entered exactly in the stage prompt and subsequent Asteria registration.

```bash
node /tmp/account-id-canary-operator.mjs stage-auto
node /tmp/account-id-canary-operator.mjs status
```

Expected safe status: `ACTIVE`, `DISABLED`, `CONFIGURED`, `UNVERIFIED AUTO-CANARY`, `NOT SET`. Run the separate read-only GitHub Account ID audit and confirm it recognises the mode **before** enabling the test. Email verification is still offered, but need not be completed for an Account ID. The server continues to require trusted Auth creation time, a matching canonical Firestore profile and its private one-email digest.

Do not use `stage-auto` while the production callable still contains the old verified-only implementation; that older callable must fail closed and would not issue the new ID. The general rollout remains disabled without additional approval.

## Separate unverified automatic-ID canary (not public activation)
After the automatic Account ID callable source is separately deployed and the previous single-account canary has been disabled and audited, an operator may stage a **new** test email using:

```bash
node /tmp/account-id-canary-operator.mjs stage-auto
node /tmp/account-id-canary-operator.mjs status
```

The operator prompts for the approved unregistered address and only modifies `ASTERIA_ACCOUNT_IDS_ENABLED=0`, `ASTERIA_ACCOUNT_IDS_ROLLOUT_MODE=auto-canary`, the private approved email digest, and resets the registration cutoff. No source deployment, public activation or user creation occurs. Status must be **ACTIVE / DISABLED / CONFIGURED / NOT SET**, with rollout **UNVERIFIED AUTO-CANARY**. The separate GitHub read-only audit must show `UNVERIFIED-EMAIL AUTO-CANARY CONFIGURED`, `DISABLED`, `NOT SET`, and `EXACT SOURCE MATCH`.

Only after inspecting that audit and preparing the email inbox and fresh website registration session, run `enable`, type `ENABLE`, then create one new account via `https://asteriattrpg.com/?account-id-auto-canary=1`. Verify that the permanent five-digit ID appears in My Profile **before** email verification. Check persistence, copy, duplicate protection and unchanged character/campaign data. The automatic mode allows at most 24 hours of same-UID registration recovery but the first assignment should occur immediately.

Disable issuance after the test. The pre-existing `Grayson#01448` account must not be deleted or reassigned. The `general` rollout mode and public website flag remain strictly out of scope; require separate abuse-prevention review and approval.

## Enable — only after staging evidence and tester ready
Once GitHub read-only audit and website checks pass, with the new inbox open and tester ready to create the account, run:

```bash
node /tmp/account-id-canary-operator.mjs enable
```

Type `ENABLE` when asked. This sets a canonical UTC registration cutoff to the operator's **current clock time**, enables issuance for the previously approved verified email only, and preserves other variables. It waits for successful completion and verifies the resulting configuration.

Then, using a fresh Asteria website session, create a new Asteria account with that same email **after activation**. Verify the new email, return to `https://asteriattrpg.com/?account-id-canary=1`, sign in as the new account, open **Account → Password & Security**, select **Check Verification** and **Complete Account ID (Canary)**. This must occur **within 15 minutes of Firebase Auth account creation**, not 15 minutes from enabling the function. If the 15-minute window expires, do not delete/recreate or reuse that account; stop and review another controlled test plan.

Check that the assigned `Username#00000` persists after refresh and logout/login, and that account, character and campaign data is unchanged. No general rollout, email-sending API changes or legacy migration is authorised.

## Disable — abort/close after test
Irrespective of success or failure, run:

```bash
node /tmp/account-id-canary-operator.mjs disable
node /tmp/account-id-canary-operator.mjs status
```

Type `DISABLE` if prompted. Expect **DISABLED**. This leaves any legitimately assigned ID permanent, does not delete accounts, and does not change unrelated functions or configurations.

## Security and operational notes
- The URL can reveal a button but **cannot bypass** the server's verified-email, registration timestamp, canary digest and issuance gates.
- Do **not** paste actual verification links, passwords, token output, raw Cloud Function settings or email hashes into GitHub issues or this chat.
- The operator script does **not** display raw environment variables or access tokens. Its Google Cloud API requests require the current Cloud Shell credentials; no GitHub Actions secrets are involved.
- This is a Cloud Functions v2 **configuration-only REST PATCH** using the documented `serviceConfig.environmentVariables` field mask after re-reading the function's update timestamp and environment variables; it does not run Firebase CLI source deployment or deploy any unrelated functions.
- Cloud Functions v2 does not expose an `etag` on its Function resource. The operator rechecks `updateTime` and existing runtime settings immediately before patching. This is a best-effort concurrency check, **not** an atomic lock; do not run other configuration changes at the same time.
- Cloud Functions configuration changes can create a new underlying Cloud Run revision. The stage and enable operations are real production changes and must be separately approved by the operator.
- If any operation reports an error, run read-only `status` and do not retry blindly. Check the Cloud Functions console operations for the existing function. Do not edit IAM without a specific denied permission.
