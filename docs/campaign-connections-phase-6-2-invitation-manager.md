# Campaign Connection Upgrade — Phase 6.2: Secure Invitation Manager

**Scope:** Owner-facing invitation manager in Campaign Forge and restricted backend listing and lifecycle management. This update builds on the Phase 6.1 signing-key-protected issuance system; it **does not** implement acceptance, membership grants, QR scanning, email sending, or invite-URL handling (Phase 6.3 and Phase 7).

## Audited baseline

Latest `main` at `00a98d6d7f7fde7f33aca698280f9c567ff8f23b` (Phase 6.1 PR #107). The permanent UCN remains a campaign lookup identifier. Phase 6.1 only discloses raw secure bearer tokens **once**; it is impossible and unsafe to retrieve, re-send, or regenerate the raw token for an existing invitation. All security features and status changes must run on a server owned by Firebase Auth, not local campaign copies.

## Changes

- New `functions/campaignInvitationManager.mjs` provides bounded 25-row paginated `listSecureCampaignInvitations` and transactional `changeSecureCampaignInvitation` actions (`revoke`, `expire`).
- Reuses `asteriaSecureInvitation` Callable and Firebase Secret Manager for issuance. List/change require **separate backend flag** `ASTERIA_INVITATION_MANAGER_ENABLED=1`; issuance still requires `ASTERIA_SECURE_INVITATIONS_ENABLED=1`. Both remain disabled by default.
- Every request revalidates the authenticated campaign **owner UID**, v2 membership schema, invitation record identity, immutable owner and campaign reference, revision, and server-owned credential fields. Current Co-GM permission policy has no `manage-invitations` capability, so no Co-GM can independently manage secure invitations.
- List only safe operational metadata: invite ID, role offered, type, state, uses, expiry, revision, recipient email/UID (owner only). **Never** returns bearer token, HMAC digest, signing key, private character sheet, or user membership records. An expired/exhausted active invitation is presented with its effective status without a client write. Pagination uses private invitation IDs and Firestore document-snapshot cursors.
- Revocation and manual expiry are server-side **atomic** updates to status and revision with one immutable audit event. Repeating an identical completed action is idempotent; changed or stale revisions fail closed. Revocation prevents Phase 6.3's future validation from accepting an old token; neither action removes any current campaign members, party characters, inventory, or gameplay.
- Campaign Forge displays a new **Secure Invitation Manager** only when the account is the actual server owner of a schema-v2 campaign and browser flag `secureInvitationManager=true`. It provides type, role, duration (1–30 days), uses (1–25), optional email recipient, secure creation, owner-only paginated listing, refresh, explicit revoke/expire confirmation, safe error/status messages.
- Copy/share: the one-time token can be copied as an invitation URL **immediately after issuance only**, and may be cleared in the UI. It is never persisted to local storage, Firestore browser writes or campaign root. The URL format is deliberately reserved for Phase 6.3; it is **not currently redeemable**. Existing tokens cannot be recovered/resend, so a lost token requires creating a replacement invitation; the previous invitation can be revoked.
- Legacy (v1) email-ready invitation UI is retained **only for legacy campaigns**. The v2 campaign UCN URL is relabeled **Campaign Lookup Link** rather than suggesting it is a secure bearer credential. Existing artwork, panel headers, menu crystals, gameplay state and dashboard layout are untouched.

## Non-goals

- No acceptance route, token redemption, per-user claims, new membership, auto-approval, join request modification, email integration, QR-code generation or production Secret Manager configuration.
- No owner-controlled Co-GM invitation-management delegation until a separate permission model is approved. Co-GM role offers are *proposals* only, and cannot elevate a recipient through this phase.
- No automatic resend. Storing/recovering prior raw credentials would contradict the Phase 6.1 security contract.
- No live Firebase Functions, Rules or flags are enabled by this code merge. The browser flag stays **false** in `index.html`, and backend flags have no enabling default.

## Verification

Run `npm run test:invitation-manager`, `npm test`, `npm run test:firebase`, `npm run lint`, `npm run audit:production`, `npm run content:check`, `npm run build` and GitHub Actions committed-bundle consistency. Tests cover owner/nonowner access, email privacy, pagination, revocation and expiry, replay, stale revisions, no gameplay/membership writes, and Firestore browser access denial. Real authenticated multi-account testing and invitation-acceptance checks remain for the later staged production rollout.

**Next roadmap update:** Phase 6.3 — Invitation Acceptance and Share/QR Handling. Do not begin it from this PR.
