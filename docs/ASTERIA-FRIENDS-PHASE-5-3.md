# Asteria Friends — Phase 5.3 Final Cross-System Integration and Release Controls

## Scope and status

Phase 5.3 prepares the production release controls required to activate the existing Phase 5.1/5.2 Friends-to-Campaign invitation system **only after** independently approved campaign v2 secure invitations, manager, acceptance and joining are verified live. No additional Firebase projects, test deployments, production data migrations, Firestore/Storage rules or email integrations are introduced.

This PR changes **only the existing WIF-trusted** `.github/workflows/firebase-deploy.yml` (and release scripts/tests/documentation). The website remains `campaignFriendRecipients:false`, `campaignFriendInvitations:false`, `secureInvitationManager:false` and `secureInvitationAcceptance:false`. The existing Friends notifications feature stays enabled.

### Current prerequisites that are NOT yet independently verified

1. Is `asteriaSecureInvitation` deployed as a Gen 2 Cloud Function in `asteria-ttrpg/us-central1`?
2. Are the existing secure invitation issuance, acceptance and manager environment flags **all** `1` and independently approved for campaign v2?
3. Is Secret Manager secret `ASTERIA_SECURE_INVITE_SIGNING_KEY` present with an enabled version, readable by the secure invitation Cloud Function's runtime identity? The audit can verify only metadata; runtime secret access must be verified before activation.
4. Is `asteriaCampaignFriendRecipients` already deployed, or must it first be deployed **disabled**?
5. Has the campaign v2 website activation been separately approved, tested and published? At this PR's baseline the relevant website flags are **false**. Those must not be silently enabled by Friends Phase 5.3.

**Fail closed:** until these facts are confirmed, no `campaign-friends-invites-enable` operation can run successfully.

## Independent read-only audit

After PR CI passes and release-control code is merged, use GitHub Actions → **Deploy Firebase backend (manual)** on `main`.

- Operation: `campaign-friends-release-audit`
- Production confirmation: **leave blank**

This inventories only the two target Cloud Functions and their nonsecret `ASTERIA_` environment flags; it also checks the existence of an enabled signing secret version **without reading or printing the secret value**. This operation never writes to Firebase.

If a function is missing, an environment variable is unexpected, an old campaign prerequisite is off, the secret cannot be verified, or runtime permissions are insufficient, **stop** and reconcile the independently owned campaign v2 release first. A green GitHub CI does not prove the current production flag configuration.

## Explicitly confirmed one-function deployment operations

All require `main`, `workflow_dispatch`, `firebase-production` environment, exact typed production confirmation, pinned Node 22 and Firebase CLI, existing restricted Workload Identity, current live Cloud Function metadata, and full security tests. Packages stage exactly one named `asteria` codebase function, preserving allowed existing environment variables and checking deployed flags after the operation.

| GitHub Actions operation | Exact production confirmation | Scope |
|---|---|---|
| `campaign-friends-recipients-deploy-off` | `DEPLOY-ASTERIA-CAMPAIGN-FRIEND-RECIPIENTS-OFF` | Stage only `asteriaCampaignFriendRecipients` with its flag `0` |
| `campaign-friends-recipients-enable` | `ENABLE-ASTERIA-CAMPAIGN-FRIEND-RECIPIENTS` | Enable read-only recipient selection backend |
| `campaign-friends-recipients-disable` | `DISABLE-ASTERIA-CAMPAIGN-FRIEND-RECIPIENTS` | Disable read-only recipient selection backend |
| `campaign-friends-invites-deploy-off` | `DEPLOY-ASTERIA-CAMPAIGN-FRIEND-INVITES-OFF` | Stage only the existing signed `asteriaSecureInvitation` callable, preserving all observed campaign flags and keeping new friend invitation issuance off |
| `campaign-friends-invites-enable` | `ENABLE-ASTERIA-CAMPAIGN-FRIEND-INVITES` | Enable the new account-bound issuance and redemption path **only after** existing v2 invitation issuance, manager, acceptance, recipient backend and website prerequisites are live |
| `campaign-friends-invites-disable` | `DISABLE-ASTERIA-CAMPAIGN-FRIEND-INVITES` | Disable only account-bound invitation issuance/redemption; preserve all other campaign v2 flags |

These operations **must be individually approved** before running, not selected all together. The same job cannot deploy Cloud Functions unrelated to its selected target and cannot deploy website, Firestore rules, Storage, email or indexes.

If the existing signed invitation service is not deployed or its secret is not configured, do **not** create it by guessing missing prerequisites. First finish and approve its independent campaign v2 deployment.

## Proposed release sequence (only after prerequisites and separate approvals)

1. Run the read-only audit and verify exact live Cloud Functions, flags, signing secret and current campaign v2 approval state.
2. If recipient callable is absent, deploy it disabled using `campaign-friends-recipients-deploy-off`. Verify.
3. If signed callable requires the Phase 5.2 source update and existing campaign v2 is independently active, deploy it with `campaign-friends-invites-deploy-off` preserving its live secure invitation, acceptance, manager and notification settings. **Do not** do this if it would interrupt other campaign work or if its signing key cannot be verified.
4. Separately approve and publish the existing v2 website invitation manager/acceptance controls, with their own end-to-end tests; they are outside the new Friends feature flag and must not be activated as a side effect.
5. Separately enable the recipient callable, then publish the approved `campaignFriendRecipients:true` website flag.
6. Verify owner lookup of accepted friends and exact nonfriends without UIDs/emails. Then enable the account-bound backend only after all existing v2 prerequisites are confirmed; publish the **separately approved** `campaignFriendInvitations:true` website flag last.
7. Use actual accounts (GM, friend, second recipient) on desktop and mobile: accepted-friend and exact Account ID selection; private one-time link; wrong recipient denied; claim creates **pending** join request; GM explicitly approves; no immediate membership/Co-GM elevation. Verify blocking, disabled account, expiry/revocation, duplicate claims and campaign v1. Do not bypass existing friendship cooldowns or use real email sending to manufacture tests.

## Rollback

If live checks fail:

1. **Website:** revert `campaignFriendInvitations:false` first in a reviewed website-only release. Disable `campaignFriendRecipients:false` if necessary, preserving all pre-existing campaign v2 features.
2. **Backend issuance/claim:** run `campaign-friends-invites-disable`, preserving existing secure campaign issuance, manager, acceptance and campaign notifications.
3. **Recipient lookup:** run `campaign-friends-recipients-disable` if necessary.
4. Verify both flags are off as intended, and that old `asteriaSecureInvitation` operations still work. Do not delete historical invitations, campaign members, private account records or change Firestore deny rules.

Keep `ASTERIA_SECURE_INVITATIONS_ENABLED`, `ASTERIA_INVITATION_ACCEPTANCE_ENABLED`, `ASTERIA_INVITATION_MANAGER_ENABLED` and `ASTERIA_CAMPAIGN_NOTIFICATIONS_ENABLED` **exactly as observed and separately approved**; never use a broad Firebase deploy. Rollback is gated and does not erase already accepted join requests or token indices.

## Verification vs pending acceptance

The source CI and emulator coverage prove only the code, authorization controls and test fixtures. Production readiness requires the **separate manual read-only audit**. Production acceptance requires the separately approved one-function deployments, independently published UI flags and live GM/two-player checks.

**Do not call Phase 5.3 fully activated or end-to-end accepted until those manual actions have been completed and verified.**
