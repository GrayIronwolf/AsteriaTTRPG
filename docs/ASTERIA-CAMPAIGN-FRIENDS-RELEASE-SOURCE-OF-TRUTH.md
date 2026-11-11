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
