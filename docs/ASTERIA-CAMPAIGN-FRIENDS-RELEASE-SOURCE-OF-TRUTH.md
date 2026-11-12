# Asteria Campaign + Friends: authoritative website release configuration

**Canonical configuration:** `config/asteria-release.json`. This file is the source of truth for the published `window.AsteriaFeatureFlags` switches. It defines the production project and region, the seven deployed campaign-related callable names, the existing Friends and Account ID protections, and the pending **independent** production readiness evidence.

## Website build contract

- Do not hand-edit the `AsteriaFeatureFlags` declaration in `index.html`.
- Make an approved change in `config/asteria-release.json`, regenerate with `npm run release:sync`, then run `npm run release:check`.
- `npm test`, all production `npm run build` invocations, GitHub Firebase/website CI, and the Phase 8.3 readiness workflow run the drift check. An unreviewed website flag change **fails the build**.
- This initial manifest is deliberately `installed-not-activated`: existing Friends notifications and Account IDs remain on, while all new Campaign v2 and Friends-to-Campaign UI switches remain off.
- The release generator refuses to render an active state from this unsigned source-only manifest. That requires a separately reviewed evidence-backed activation implementation, and independent backend/Firestore/Storage checks. Do not mark the approval fields true merely to satisfy a test.

## Automatic audit and restricted cloud trust

Merging a change to the canonical release configuration triggers `.github/workflows/asteria-campaign-release-audit.yml` automatically. This is an **offline source audit**: it verifies the manifest against the website and the existing Phase 8.3 release safeguards and publishes a single NO-GO/ready-for-review summary. It does not query live Google Cloud, enable anything or claim that production is ready.

The existing Google Cloud Workload Identity Provider rejects authentication from newly created workflow files. Live verification belongs exclusively to the already-trusted `.github/workflows/firebase-deploy.yml` manual, scoped, read-only operation. Do not relax WIF conditions or grant wider IAM merely to make an automatic report green.

## Single comprehensive production readiness audit (no writes)

The existing WIF-trusted **Deploy Firebase backend (manual)** workflow on `main` now offers a read-only operation: `campaign-coordinated-readiness-audit`. Leave the production confirmation **blank**.

This single run verifies the seven core Campaign/Friends Cloud Functions, all their relevant boolean server gates, optional notifications/email function availability, signing-secret enabled-version visibility (never secret values), and live Firestore/Storage Rules source parity. It runs the existing backup metadata inventory and records a unified list of release blockers in the job summary. It never deploys, enables, migrates, emails or reads account/character data. If the deployment service account cannot inspect a resource, it reports **NOT VERIFIED** rather than claiming success.

The auto-triggered `asteria-campaign-release-audit.yml` remains offline because new workflows are not allowed Google Cloud Workload Identity credentials. The comprehensive live audit runs **only from the existing trusted workflow** and needs no IAM expansion.

**A successful audit workflow does not mean public activation is authorised.** It never establishes that a backup was restored, that owners reconciled real Campaign v1 memberships, that real accounts tested acceptance, or that an incident-response owner approved general availability. These are intentionally explicit NO-GO blockers until independently verified.

## Audit #66 findings and false-positive correction

The first consolidated production audit (#66) reported six of seven Cloud Functions as verified ACTIVE, even though the seventh, `asteriaCampaignUCN`, was listed by the Cloud Functions API. The audit had only described functions with environment gates and **had not described the non-gated UCN function**. This was a source-audit defect, not proof of a UCN outage. The follow-up correction describes every required function from the canonical manifest.

The live audit must distinguish an absent server gate from an inaccessible function: omitted gate variables on verified callables are **off by default**, since runtime handler code explicitly requires `'1'`; inaccessible or unrecognized values remain **unknown**. No gate may be marked active without a verified explicit `'1'`.

Audit #66 also found Storage Rules source mismatch, a confirmed inactive Friends invitation configuration, four READY Firestore backups, and no independently verified restore. **Do not overwrite production Storage Rules simply to clear a mismatch**. Preserve the current live rules until they have been inspected against the committed rules and the security tests, with special attention to per-campaign membership and avatar/character access. The report's optional campaign notification/email callable warnings do not themselves prove the core Friends invitation path is unusable.

This correction does not authorize activation. Production v2 per-campaign migration, backup restore, website approval, real-user acceptance and rollback checks remain mandatory.

## One coordinated Campaign v2 / Friends in-app production preparation

The approved source now contains one complete manual preparation workflow in the **existing WIF-trusted** `.github/workflows/firebase-deploy.yml`.

- **Operation:** `campaign-inapp-prepare-disabled`
- **Exact confirmation:** `PREPARE-ASTERIA-INAPP-CAMPAIGN-DISABLED`
- **Repository/branch:** `GrayIronwolf/AsteriaTTRPG`, `main`
- **Project/region:** `asteria-ttrpg`, `us-central1`
- **Deployment scope:** precisely `asteriaCampaignNotifications` and the already-deployed `asteriaSecureInvitation`, as two isolated `--only` targets under one reviewed run

One dispatch performs the full relevant security and Firebase emulator suite, reads only Cloud Function names, environment flags and the **existing** signing-secret attachment, builds both packages under the trusted runner's temporary directory, installs the notification callable **with its gate 0**, updates secure invitations to the new notification-aware implementation **while preserving all existing v2 flags and keeping friend issuance 0**, and verifies both callables ACTIVE with the expected flags. It fails closed if notifications are already deployed, if the secure invitation or recipient callable is absent, if the signing-secret attachment is not visible, if unreviewed environment variables exist, or if any selected source packages would reintroduce Resend/email sending.

This preparation step **does not** require `ASTERIA_RESEND_API_KEY`, request access to secret values, modify IAM, migrate campaign memberships, deploy Storage/Firestore rules, or activate browser flags. A successful preparation is **not** approval to activate a v1 campaign.

### Actual production activation — conditions, not unfinished feature implementation

The later *live activation* must meet each requirement below **before** changing any server/UI switches:

1. Live Storage and Firestore Rules are reviewed against source and verified to preserve existing v1 access, v2 active-member permissions and denied/banned states; do not blindly overwrite a drifted ruleset.
2. A full restorable backup, verified isolated restore and recovery owner are documented for Firestore, Auth, Storage and configuration. Existing READY Firestore backups alone are not sufficient.
3. An explicitly selected existing campaign has passed owner-approved v2 membership and character reconciliation. The cutover remains per campaign only. Never bulk-migrate every campaign or silently grant previously blocked accounts.
4. GM, intended recipient and an unrelated authenticated account verify private notification, recipient-only preview, pending GM approval, post-approval roster membership, blocking, expiry, revocation and duplicate claim. At least one mobile test is required.
5. Review the feature-state diff as **one coordinated release**, including `ASTERIA_CAMPAIGN_NOTIFICATIONS_ENABLED` on both relevant callables, `ASTERIA_CAMPAIGN_FRIEND_RECIPIENTS_ENABLED`, `ASTERIA_CAMPAIGN_FRIEND_INVITES_ENABLED`, secure issuance/acceptance/manager, required join request/review gates and the corresponding website flags. The source-of-truth manifest currently keeps every new campaign flag OFF. External email controls remain OFF permanently until a separate future project.
6. Record a clearly named production owner, evidence references, live monitoring and a stop/rollback procedure before issuing the final GO. Rollback hides browser actions first, then disables friend issuance and notification delivery without reverting membership schema or modifying existing campaign characters.

The auto-triggered source audit and the coordinated preparation are **separate**: CI verifies code on merge, while the production preparation is a single intentionally manual action. Cloud permissions do not allow the GitHub connector to trigger GitHub Actions, and no code can truthfully substitute for authenticated real-account acceptance or a verified backup restore.

## Invitation delivery: in-app only (Resend postponed)

**Current approved direction:** A GM chooses an accepted Friend or exact Account ID and sends a private invitation through Asteria. The recipient sees it under **Account → Notifications**, can submit a pending join request there, and must be approved by the GM before campaign membership changes.

The invite is bound to the recipient's immutable Firebase UID, validated against Account ID registry, friend-block status, Auth status and the current v2 campaign. The server creates the recipient's private notification in the *same Firestore transaction* as the invitation record. The inbox stores **only the invitation ID and campaign ID**, never the bearer token, email, signing key or membership privileges. Its list/read operations use the authenticated user's UID, and the new notification-only preview/claim actions validate the recipient and current campaign state again. Neither notification creation nor claiming provides immediate campaign access.

The website now exposes no bulk-email invitation sending, email-based invitation type or resend controls. The email callable is absent from the active Firebase entrypoint. The old email transport modules are retained **only in Git history/source for a possible future project** and are not a deployment requirement. Existing Firebase Authentication verification emails are a different service and remain unchanged.

The retired two-callable operation `campaign-channels-deploy-disabled` failed on secret metadata in Run #68 and is replaced by `campaign-notifications-deploy-disabled`, confirmation `DEPLOY-ASTERIA-CAMPAIGN-NOTIFICATIONS-DISABLED`. This installs **only** `asteriaCampaignNotifications`, initially with `ASTERIA_CAMPAIGN_NOTIFICATIONS_ENABLED=0`; it performs no Resend/Secret Manager access, sends no email, and cannot change campaign membership or site flags. No new email provider account or API key is needed.

**Rollout constraints remain:** the existing `asteriaSecureInvitation` callable must receive the reviewed notification-only action update before enabled delivery; v2 membership and rules, a restorable backup, GM/recipient acceptance tests, and an independently approved canary remain necessary. Do not turn on a browser switch alone or replace live Storage Rules without comparison. The source-of-truth manifest locks email invitation delivery to deferred and rejects accidental activation.

## Verified historical backend deployment — not an activation attestation

Production project `asteria-ttrpg`, region `us-central1`:

- GitHub manual run #59 deployed core campaign functions `asteriaCampaignUCN`, `asteriaMembershipPreparation`, `asteriaCampaignAccessCutover`, `asteriaCampaignJoinRequest`, `asteriaCampaignJoinReview`.
- Run #61 deployed `asteriaCampaignFriendRecipients` with the feature gate off.
- Run #63 verified only the presence of an enabled secure signing-secret version (not the value).
- Run #65 deployed `asteriaSecureInvitation` with the friend issuance gate off; the log verified Firebase granted runtime access to `ASTERIA_SECURE_INVITE_SIGNING_KEY`.

These records prove installation, not operational readiness, successful migration, or public activation. Do not redeploy these functions broadly.

## Remaining prerequisites for full production acceptance

The Phase 8.3 rollout remains **NO-GO** until evidence verifies all of the following: current Firestore and Storage production rules; backup and restore; canonical v2 membership readiness and owner-approved per-campaign migration; campaign issuance/manager/acceptance/join/GM review server gates; real-device tests of multiple authenticated accounts; invitation recipient restrictions and pending GM approvals; ability to disable the frontend and callable flags without accidentally restoring old membership permissions; and recorded operational monitoring.

Do not automatically migrate any existing campaign or enable general access to make a green CI run. The old v1 and newer v2 campaign access models cannot be safely blended. Email delivery is separately gated and does not need to be switched on to test private friend invitations.

## Release order after independent production readiness

1. Verify rules and backups and authorize the individual v2 campaign canary. Keep existing campaigns unchanged.
2. With independently verified and reviewed backend release flags, publish `secureInvitationManager` and `secureInvitationAcceptance` plus the required join-preview, join-request and GM-review UI as a coordinated versioned client.
3. Approve `campaign-friends-recipients-enable`; verify that the backend is read-only and matches accepted friends/Account IDs, then publish `campaignFriendRecipients`.
4. After existing v2 flags are verified active and actual canary accounts pass, independently approve `campaign-friends-invites-enable`, then publish `campaignFriendInvitations`.
5. Test GM, accepted friend and another signed-in account. Check wrong-account denial, expired/revoked/replayed token, blocked users, pending join request and explicit GM approval. Preserve existing v1 campaigns, account identities, characters and gameplay data.
6. Require separate observed canary monitoring before broader activation.

## Rollback

Revert the browser friend-invitation feature first; disable only the friend-invite backend, then recipient backend if required. Preserve invitation history, canonical membership, denied/banned records, characters, existing Friends notifications and older campaign flags. Never relax security rules or change `membershipSchemaVersion` back to 1 as a rollback.

**Automated source verification is not a substitute for live approval.** Existing Phase 5.3 and Campaign v2 documents remain supporting detailed specifications; this manifest is the authoritative *website flag and deployment-contract source* for future code changes.
