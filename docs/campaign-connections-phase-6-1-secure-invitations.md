# Asteria Campaign Connection Upgrade — Phase 6.1: Secure Invitations

**Scope:** server-only issuance, validation contract, private storage and authenticated permission boundaries for invitation credentials. No invitation manager UI (Phase 6.2), email delivery (Phase 7), redemption/QR acceptance (Phase 6.3), membership grants, migrations, or production activation.

## Audit
Baseline: GitHub `main` `af138bd0dcacca48ea7f898ffa94f36bd630b927`. Permanent 12-digit UCNs remain *campaign identifiers*, never credentials. Legacy `campaignInvites/{ucn}` and existing v1 join behavior remain unchanged. Phase 5.1–5.3 membership, character, role and gameplay handling stays intact.

## Server-only issuance
- New callable: `asteriaSecureInvitation`, `action:"issue"`. An authenticated campaign **owner** can issue invitations for upgraded `membershipSchemaVersion:2` campaigns only. Co-GM delegation to issue invitations is deferred until an explicit `manage-invitations` capability exists; a Co-GM cannot escalate to that privilege.
- Server deployment requires **both** Firebase Secret Manager secret `ASTERIA_SECURE_INVITE_SIGNING_KEY` (32+ bytes of unpredictable secret) and backend environment gate `ASTERIA_SECURE_INVITATIONS_ENABLED=1`. Default gate is **off**. No browser feature flag, UI button, deployment or live data migration is introduced in 6.1.
- The backend generates a 32-byte CSPRNG random token (43-character base64url), returned to the *owner's initiating response exactly once*. Token is never saved in a document, log, campaign root, profile or user-owned account mirror.
- Only a keyed `HMAC-SHA256` digest is stored. The digest is bound to the campaign ID, invitation ID and raw token with domain separation, and checked using a timing-safe equality comparison. Never use a public hash of the UCN as a token.
- A unique client-generated `requestId` (12–80 ASCII letters/digits/_/-) deterministically reserves `inviteId = SHA256(actorUid, campaignId, requestId)`. Repeated requests return safe metadata with `token:null`; no new token or quota consumption and no way to recover an earlier plaintext token. Owners must create a fresh invite if the one-time response was lost.
- Invitation records live only at `campaigns/{campaignId}/invitations/{inviteId}`. Global `campaignInvitationTokenIndex/{HMAC digest}` reserves the digest; `campaignInvitationIssueThrottle/{ownerUid}` tracks issuance. All are written transactionally with an `auditEvents/secure-invite-{inviteId}` record.
- Firestore rules explicitly forbid all browser reads and writes to these paths, including from owners and Co-GMs. This includes child claim receipts. Authoritative privileged reads happen only inside deployed authenticated Cloud Functions.
- Invitation issuer may choose `type:"share-link"|"email"`, `roleOffered:"player"|"co-gm"`, `recipientEmail` (email type only), optional `recipientUid`, `maxUses:1–25`, and `expiresInHours:1–720` (up to 30 days). If restricted by email or account, maximum uses is 1. Email addresses are normalized and stored only in the private record.
- `requiresGMApproval:true` is mandatory in Phase 6.1, even for player invitations. An offered Co-GM role is **not** an authorised role grant; actual authority must be reviewed separately.
- Campaigns with closed join policies cannot issue new invitations. Issuance is limited to 10 per campaign owner per rolling 24 hours, excluding idempotent retries.
- `assertSecureInvitationEligible` is a *pure server-side validation helper* for future Phase 6.3; it verifies HMAC, expiry, exhausted/revoked status, maximum use, account restrictions, verified recipient email, role and approval policy. It makes no writes, does not count as redemption, creates no membership and must never be treated as authorisation on its own.

## Threat boundaries and limits
- **Not a ready-to-send invitation manager:** There is no user interface in this phase to call the issuer or distribute the token. Share-link/QR creation and invitation revocation/list/resend belong to 6.2–6.3.
- **No membership is granted:** No join request, account projection, character, party, permissions or role arrays are changed. Existing server-validated membership remains the only v2 access authority.
- **Future claim must be atomic:** 6.3 must re-read invitation status, expiry, membership, per-user claim receipt, capacity and GM approval policy within a transaction. Validation alone does not increment `usedCount` and must never let a holder join without a separate decision.
- **Secrets are operational prerequisites:** A production activation needs a separately managed random secret, documented rotation/rollback and coordinated backend deployment. Do not enable `ASTERIA_SECURE_INVITATIONS_ENABLED` before credentials, prior join phases, Firestore rules and real account flows have been verified. Never paste secret values into GitHub, frontend JavaScript, documentation or audit records.
- **Legacy compatibility:** Existing v1 `campaignInvites/{ucn}`, `asteriaInvite` and website visuals are unchanged. No retroactive tokenization or automatic conversion of legacy links.

## Verification
Run `npm run test:secure-invitations`, `npm test`, `npm run test:firebase`, `npm run lint`, production dependency audit, compendium validation, production build and committed bundle consistency. Node tests cover one-time exposure, retry and quota semantics, expiry, exhaustion, revocation, HMAC mismatch, email verification and owner-only issuing. Firebase emulator tests cover direct Firestore access denial, no membership side effects and private data isolation.

**Next approved update:** Phase 6.2 invitation manager. Do not implement it as part of Phase 6.1.
