# Asteria Account IDs — Email verification and canary completion

## Purpose and current status
Prepare the existing website for Firebase Authentication email verification and a first controlled Account ID canary. **This source change does not activate the Account ID backend, enable public Account ID registration, set a production cutoff, or migrate existing users.** It uses the existing Firebase Authentication provider and email template, not Resend or a new Cloud Functions API.

## Website behaviour
- Creating an Email/Password account triggers Firebase Auth's `sendEmailVerification` for that account. Failure to send does not delete or replace the Firebase Auth account or its saved profile.
- Account > Password & Security shows **Send Verification Email**, **Check Verification**, and the verified status for the current authenticated account. Resend attempts are throttled in the current dialog.
- The **Complete Account ID (Canary)** button remains hidden unless `window.AsteriaFeatureFlags.accountIdCanary===true` in a *separately approved website release*. The existing `accountIds:false` general flag remains unchanged.
- The completion action re-reads Firebase Auth's verified status, checks the immutable creation time is within 15 minutes, reads the canonical Firestore profile, sends only `{action:'ensure'}` to the server, and confirms the server-stored account profile. It never accepts a browser-selected UID, ID, number, email or username as the target of the privileged function.
- The deployed server will continue to deny issuance until the reviewed verified-email canary version is deployed separately, and its gate and cutoff are explicitly set by the production operator.

## Operator checklist — no changes until canary approval
1. **Firebase Console > Authentication > Sign-in method:** confirm **Email/Password** is enabled. This is already required by the existing account creation flow, so do not enable another provider.
2. **Firebase Console > Authentication > Templates > Email address verification:** inspect the sender, subject and verification link domain. The Firebase built-in template is sufficient; no Resend API key or new email provider is needed. Verify mail is delivered to an inbox you control and check spam. Do not expose a private test email in GitHub.
3. **Authentication > Settings > Authorized domains:** confirm the actual Asteria website hostname and the configured verification-action domain are authorized. Do not add arbitrary domains.
4. **Website verification UI:** after this PR is merged and GitHub Pages has deployed, sign into an existing test account, open Account > Password & Security, and try Send Verification Email / Check Verification. This only tests email verification; it does **not** issue IDs or modify campaigns.
5. **Controlled Account ID canary, later:** separately approve a reviewed deployment of only `asteriaAccountIdentity` and the Cloud Functions rollout configuration `ASTERIA_ACCOUNT_IDS_ENABLED=1`, `ASTERIA_ACCOUNT_IDS_ROLLOUT_MODE=canary`, `ASTERIA_ACCOUNT_IDS_CANARY_EMAIL_SHA256`, and a canonical UTC `ASTERIA_ACCOUNT_IDS_REGISTRATION_NOT_BEFORE`. Only the approved verified email is eligible. **Do not set these settings during this PR.**
6. **Canary website flag, later:** separately enable `accountIdCanary:true` while keeping `accountIds:false`. Create a brand-new test account **after** the cutoff; open the verification link, return to the website, select Check Verification, and select Complete Account ID (Canary) **within 15 minutes** of Firebase Auth creation. An old account cannot use this route.
7. **Validation:** ensure `Username#00000` appears in My Profile and can be copied; after refresh/sign-out/sign-in the same ID must persist, and other users cannot read the registry. Review the Cloud Functions logs privately, avoid putting UIDs or emails into GitHub logs, and retain the ability to turn the backend flag off.
8. Existing Asteria users are handled separately through the one-account administrator-reviewed backfill flow. No automated bulk migration or account deletion.

## Safety and limitations
- Completing email verification is a separate authentication capability. It does not automatically turn on Account ID issuance.
- The email verification link may open Firebase's hosted action handler. Return to the existing website and press Check Verification; no custom link handler is required.
- The existing **15-minute creation window is intentionally preserved**. Delayed verification beyond this window needs manual account review, not an extension or forged profile timestamp.
- Existing passwords, Auth UIDs, characters, campaigns, session data and Firestore/Storage security rules remain unchanged.
- Firebase Authentication mail sending may be subject to provider quotas and delivery delays. No real delivery or real-device testing is established by CI alone.

## Current result
Code preparation only: **public Account IDs OFF, server issuance OFF, canary feature OFF, no account migration.**
