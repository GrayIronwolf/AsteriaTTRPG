# Asteria Account IDs — automatic number at registration (source implementation)

## Approved behaviour
When Account IDs are separately enabled for production, a new Firebase Auth email/password registration receives a permanent five-digit `Username#00000` immediately after its canonical Firestore profile is saved. Verification email delivery and the Firebase Auth `emailVerified` state **do not block issuance**. Verification messages continue to be sent for independent account security. Profile display and copying use the already-existing canonical account fields.

## Current release boundary
This PR is **source only**. Website `accountIds:false` and backend `ASTERIA_ACCOUNT_IDS_ENABLED=0` remain unchanged in production. It does not modify Cloud Functions live configuration, Firestore rules, GitHub Actions, IAM or existing accounts. The successful first live canary `Grayson#01448` stays permanent.

The server supports three distinct server-only modes:
- `canary`: the original verified-email single-address canary. Do not relax it.
- `auto-canary`: exactly one privately approved email digest, but does not require `emailVerified`. Requires the backend enable flag, trusted cutoff and 15-minute genuine new Auth registration.
- `general`: available in reviewed source only. Requires BOTH `ASTERIA_ACCOUNT_IDS_ROLLOUT_MODE=general` and `ASTERIA_ACCOUNT_IDS_GENERAL_RELEASE_APPROVED=1`, as well as the backend enable flag and trusted cutoff. **Neither is enabled in this PR.**

All modes require exact authenticated Firebase Auth UID, non-disabled account, server-maintained Auth creation time after explicit cutoff, a 15-minute registration age limit, valid canonical Firebase Auth display name and email matching a freshly read canonical user Firestore document. The caller can only submit `{action:'ensure'}`; IDs and numbers cannot be selected. Reservation is transactional and collision-aware. Legacy existing accounts are explicitly excluded from self-service and require independent, operator-reviewed reconciliation/backfill.

## Signup sequence
1. Create Firebase Auth account once; keep the original UID and a pending setup draft without password.
2. Set the canonical Auth display name and create the Firestore profile.
3. If the public website flag is explicitly enabled after rollout approval, request server issuance and verify the resulting number against a server-read profile.
4. Request the optional Firebase verification email. Failure to send must never erase or replace the ID.
5. Display a new account's ID in My Profile. If issuance fails, retain the account and the pending draft for a safe retry on that same UID, subject to the creation window and operator review.

## Further work before enabling general release
- Audit and reconcile existing account Auth/Firestore identities privately, with verified backup/restore evidence and a safe migration approach that does not touch character/campaign data.
- Add or independently confirm abuse protection for anonymous signup and mass account reservation (e.g. Firebase Auth protection, bot controls and quota monitoring), with no broad new permissions.
- Review and test production new-registration rollout cutoff and operator deployment/reversal procedure. The original canary operator's `stage` action still targets the verified-email `canary` mode; do not use it to activate the new `auto-canary` mode without a separately reviewed update.
- Manually verify first new unverified registration, persistence, refresh, copy button, mobile flow, collision handling and recovery; repeat the redacted read-only audit and obtain explicit approval before the public website flag changes.
- Review future recovery policy for accounts whose signup flow fails beyond the current 15-minute window; they must not gain unrestricted issuance based on editable profile timestamps.

## Rollback
Keep `accountIds:false` on the public website until independently approved, and keep `ASTERIA_ACCOUNT_IDS_ENABLED=0` on production. Disable the backend issuance gate to abort; never delete or regenerate already-issued IDs. This update does not require new Firestore indexes or rules.
