# Asteria Friends — Phase 5.2: Single-use, account-bound secure campaign invitations

## Scope and audited baseline

This update connects the existing Phase 5.1 Campaign Forge recipient selector to the **existing** v2 secure invitation contract. It does not change Friends relationship transitions, direct Firestore permissions, Account ID assignment, Campaign GM review, or legacy v1 campaigns. It does **not** activate a new production backend or website feature flag.

The existing `asteriaSecureInvitation` callable already supports signed 256-bit private bearer tokens, one-time presentation, expiry, revocation, deterministic idempotency, issue throttling, target-UID restriction, and pending join requests requiring GM review. The Phase 5.1 selector resolves accepted friends or exact `Username#12345` Account IDs with no private UID exposure.

## Implementation

- A new `issue-friend` action on **the existing** `asteriaSecureInvitation` callable reuses its signing secret, issuance transaction, owner-only v2 campaign checks, token-index, throttle, audit and response contract.
- It has **two independent backend release prerequisites**: `ASTERIA_CAMPAIGN_FRIEND_INVITES_ENABLED=1` and `ASTERIA_SECURE_INVITATIONS_ENABLED=1`. The new flag defaults to **off**; no Cloud Function is deployed in this PR.
- The browser can supply only `{action,campaignId,accountId,requestId,expiresInHours}`. The server selects `recipientUid`, never the client.
- Exact lookup uses the existing authenticated Account ID search and counts unsuccessful attempts against its owner-based quota. At transaction time the selected account's current canonical identity, Firebase Auth status, blocked relationship, existing membership, and existing join request are rechecked. Owner and inactive/blocked/already-enrolled recipients are not eligible.
- The issued invitation is forced to `type=share-link`, `roleOffered=player`, `maxUses=1`, `requiresGMApproval=true`, with the selected UID bound to the existing invitation record. It never emails a recipient or creates campaign membership.
- A new `friendAccountBound` marker applies **only** to these new invitation records. The existing preview and acceptance code checks current Firebase Auth status and blocking for these invitations; old invite formats are unchanged. The server's existing signed-token verification still prevents wrong-recipient claims, forged tokens, revoked/expired invites, replayed use and privilege escalation.
- A reused `requestId` can never acknowledge a different recipient or recover the original bearer link.
- The Phase 5.1 Campaign Forge panel can show a one-time invitation link and copying action only if the website flags `campaignFriendRecipients`, `secureInvitationManager`, and `campaignFriendInvitations` are **all** enabled. By default `campaignFriendInvitations:false`; the website remains inert. The panel never stores tokens in Local Storage, Session Storage, Firestore client documents or query strings. Recipients must sign in with the intended account and request GM approval.
- Account switching/sign-out invalidates the current selector and the one-time link display.

## Release boundaries

Production Cloud Functions, Firebase rules, Storage, email and campaign data were not changed by developing or merging this source update. Merging to GitHub Pages can publish the **disabled** browser controls but cannot enable the new backend action. Phase 5.3 must verify live secure invitation deployment state, signing-secret permissions and actual production server feature flags before it can safely prepare a scoped function release on the existing `firebase-deploy.yml` trusted Workload Identity workflow. Never deploy all functions to activate this one change.

Activation and rollback require explicit manual approval. Phase 5.3 must keep the existing Friends notifications and Campaign system flags independent. If tests or live acceptance fail, disable `ASTERIA_CAMPAIGN_FRIEND_INVITES_ENABLED` and the `campaignFriendInvitations` website flag, rather than weakening Firestore rules or deleting existing campaign membership.

## Acceptance criteria

Tests cover accepted friend and exact nonfriend selection, disabled account and blocked relationships at issuance and at claim, pending/canonical members, v1/closed campaigns, wrong-UID token, duplicate ID and duplicate claim, one-use exhaustion, revocation, expiry, forged bearer credentials, pending GM approval, token privacy and lack of unauthorized membership changes. Existing campaign secure invitation and Friends tests must continue passing.

Real account, desktop and mobile testing remains **pending** until the separately approved production rollout. Phase 5.3 is not started by this PR.
