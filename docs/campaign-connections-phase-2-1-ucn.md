# Campaign Connection Upgrade — Phase 2.1: Permanent UCN Registry

**Baseline:** `0eb7767a98e263b9507b5d37b9f93f5070e72d53` (`main` after #85, #86, #87).
**Scope:** server-controlled 12-digit campaign identity, separate read-only directory lookup, immutable existing campaign UCNs, and regression tests. This is **not** the membership / GM approval implementation.

## Implemented

1. `functions/campaignUCN.mjs`: creates UUID-based campaign IDs and cryptographically random padded 12-digit UCNs. A Firestore transaction reserves the new campaign, `campaignDirectory/{ucn}`, and a temporary `campaignInvites/{ucn}` compatibility mapping together. Existing campaign IDs, UCNs and characters are never renumbered. Allocation retries on an already-used campaign document, directory entry or legacy invite code.
2. The allocation service checks the signed-in Firebase Auth UID and requires a nonempty campaign name; it bounds new creations at 10 per account per day using `campaignCreateThrottle/{uid}`. These throttle records have no client read/write Firestore rule.
3. `asteriaCampaignUCN` authenticated callable: `{action:'create',name}` allocates; `{action:'preview',code}` looks up a UCN. Preview is limited to 12 requests per account per rolling minute, stored under `campaignLookupThrottle/{uid}` (server-only). Responses contain only `{id,name,ucn}`; no roster, email addresses, invite tokens, roles, or protected gameplay data.
4. The directory is deliberately server-only. An existing UCN lookup uses the legacy `campaignInvites/{ucn}` registry **only if no canonical directory entry exists**; a closed directory cannot be bypassed by an old active invite.
5. Firestore rules now prevent the existing `ucn` field from being changed by an ordinary owner save or a player. Previously established campaign numbers remain stable.
6. An opt-in `AsteriaFirebase.createCampaignIdentity(name)` and `previewCampaignByUCN(code)` client API supports the new callable. Campaign Forge uses server allocation only when the static-site runtime flag `window.AsteriaFeatureFlags.serverCampaignUCN` is set to `true` in `index.html`. **Default is false**, so current creation behavior remains unchanged until backend and rules have been deployed and verified. When enabled, failure aborts creation rather than silently choosing an unreserved code.
7. Tests cover leading-zero UCNs, reservation collisions against both registries, ownership validation, rates, privacy-preserving responses, legacy UCN compatibility, immutable UCNs and denial of client access to the directory.

## Deployment order and cautions

1. Review and merge this PR only after GitHub CI passes.
2. Deploy Firebase Functions and Firestore Rules using the existing **manual** reviewed backend workflow on `main`; verify `asteriaCampaignUCN` exists and both create and preview work against the intended Firebase project. This phase does not run production deployment automatically.
3. Confirm existing campaigns retain their existing UCN and players can still join through the legacy flow.
4. Enable the new creation path in a reviewed production website build by changing the reviewed `index.html` runtime flag `serverCampaignUCN:false` to `true` **only after** backend verification. Check the switch with authenticated accounts and verify end-to-end persistence and creation/artwork flow before broad rollout.
5. If the new callable has an outage, disable the frontend flag (not membership security) rather than corrupting or reassigning an allocated UCN. Any already-allocated server campaign is kept for safe resumption; do not delete by default.
6. Old campaigns without directory entries continue looking up by their original legacy UCN. Do not run a bulk backfill without auditing collisions and ownership and preparing a dry-run report.

## Remaining work by phase

- **2.2–2.3:** canonical member records and authorization, status semantics, migration, and end-to-end v2 permissions. The `membershipSchemaVersion` is not changed in Phase 2.1.
- **3:** GM join approval, request queues and limits. **The legacy `asteriaInvite` callable still directly joins a valid UCN today.** UCNs must not be advertised as secret credentials.
- **4:** GM player management.
- **5:** character linking and ownership isolation.
- **6:** replace legacy code-based invitation access with separate high-entropy invite tokens and revocation/expiry.
- **7:** email and in-app invitations.
- **8:** full campaign migration, cutoff, authenticated device testing and production rollout.

## Security limitations that remain

The new directory's direct Firestore reads are denied by existing default-deny rules. The old `campaignInvites` documents are still readable to signed-in users via existing legacy rules. The preview callable uses account-level rate limiting but is not a substitute for Firebase App Check or wider abuse protection. Old browser-created campaigns may still use legacy locally generated UCNs until the flagged server creation path is deployed and enabled. `saveCampaign` still refreshes the old invitation status; this will be removed during the dedicated invitation migration.

**Validation:** isolated Node tests are part of `npm test`; Firebase emulator tests are part of `npm run test:firebase`. CI must pass both. No production data or live website settings are changed by this PR until separately deployed.
