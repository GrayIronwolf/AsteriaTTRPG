# Asteria Campaign Connection Upgrade — Phase 7.2: GM Email Invitation Controls

**Scope:** Owner-authorised email invitation sending, safe batch controls, visible provider submission status and new-token resend. Phase 7.3 in-app notifications and production activation are excluded.

## Repository audit

Audited `main` commit `4f4d8254b3771d1afd2c284e15085c79bd4eb8c7` (Phase 7.1). The live website uses `asteriattrpg.com`; Phase 6.1 invitation tokens are returned **once** and only HMACs persist. Phase 6.2 provides private owner-only invitation management. Phase 6.3 accepts a token into a **pending** GM join-review request. Phase 7.1's Resend adapter is already disabled and requires a verified sender domain/secret. This update preserves all prior behavior and artwork.

## Backend workflow

- New `functions/campaignEmailInvitations.mjs` adds **owner-only** bulk email issuance (1–5 addresses at a time), protected by existing schema-v2 ownership validation and the Phase 6.1 10-invitations-per-owner-per-24-hour quota. Addresses must be unique and valid; each invitation is email-restricted, single-use, and requires GM approval. An invitation offering Co-GM does **not** promote a recipient.
- The new `asteriaCampaignEmailInvitations` authenticated Firebase callable binds **both** `ASTERIA_SECURE_INVITE_SIGNING_KEY` and `ASTERIA_RESEND_API_KEY` using Firebase Secret Manager. The callable refuses all actions unless **all three** backend gates equal `1`: `ASTERIA_EMAIL_INVITATION_CONTROLS_ENABLED`, `ASTERIA_EMAIL_DELIVERY_ENABLED`, and `ASTERIA_SECURE_INVITATIONS_ENABLED`. They remain disabled by default.
- Each recipient uses a deterministic request ID derived from a caller-provided UUID and recipient index. Phase 6.1 performs the atomic issuance, with existing owner quota, signed token and recipient restrictions. The one-time token is used solely inside the server response and immediately passed to the private Resend adapter. It is not returned to the browser, logged, placed in Firestore, attached to a campaign root, or stored for future resends.
- A new transactional **sending reservation** checks the private invitation before contacting the provider, writing safe metadata on `campaigns/{campaignId}/invitations/{inviteId}`: `deliveryStatus`, provider, timestamp, and attempt count. After the provider responds, the record becomes `accepted` (provider accepted request) or `unknown` (provider/network state uncertain). `accepted` **never** means the email reached an inbox. The existing Firestore rules prohibit direct browser read/write access; the owner-only invitation manager returns limited metadata, with no raw token or HMAC.
- A repeated request ID returns existing safe metadata without sending again or consuming another issuance quota. If a provider response is lost, the original bearer token cannot be recovered; delivery is marked `unknown`, never silently retried. The owner can revoke and replace the invitation.
- **Replace and Resend:** for still-active, unused email invitations only, the owner supplies the source invitation ID and expected revision. The server issues a **new** credential, revokes the old credential before submitting the new email, and records `resendOfInviteId`. It never attempts to recover the original raw link. A changed/revoked/used invitation fails closed. If revocation conflicts, the new invitation is revoked where possible and no email is sent.
- Partial bulk failures are reported per recipient without exposing bearer links, secrets or provider error bodies. Provider submission is sequential, bounded to five recipients per request. No automated unknown-status retries occur. Delivery status is submission-only; bounce/delivery webhook confirmation requires a separately approved extension.

## Website / GM controls

- The existing schema-v2 owner's **Secure Invitation Manager** now has a **Send Email Invitations** control, up to 5 recipients separated by newline, comma or semicolon, role and duration selectors shared with secure invitations, and a summary of provider-accepted/unconfirmed/failed results.
- The owner-only invitation list displays the provider submission state and **Replace and Resend** for eligible email invitations, with a destructive confirmation. Failed browser requests retain the same request ID for safe, idempotent retries of the same recipient selection. No browser saves an invitation token.
- New frontend flag `window.AsteriaFeatureFlags.emailInvitationControls=false` is shipped **disabled**. The existing `secureInvitationManager` flag must separately be enabled during a controlled production rollout. Player/GM dashboard visuals, panels, buttons, header artwork, backgrounds and gameplay state remain unchanged.

## Security and limits

- This work does not activate the Resend account, domain DNS records or Firebase secrets. No real email is sent. Future activation must verify Resend domain authentication (DKIM, SPF, DMARC and alignment), send-only API permissions, Firebase Functions deployment, approved recipients and GM audit.
- Existing join approval, character link, combat, inventory, XP, membership and role logic are untouched. Email links remain subject to expiry, one-use checks, verified recipient email, manual GM approval and existing disabled invitation acceptance gate.
- The new Cloud Function has no independent access permission for Co-GMs. Only the canonical campaign **owner** may send or replace invitations in Phase 7.2. Co-GM delegation requires a separate reviewed policy.
- `deliveryStatus:'accepted'` confirms only HTTP provider submission. This phase cannot claim inbox delivery without verified provider webhooks. A later separately scoped webhook would require signature checking, recipient isolation, rate limits and its own rollout.
- No production DNS, secret value, Firebase Functions/Rules, feature flag or email service configuration was changed.

## Verification

`npm run test:email-invitations` covers owner and legacy-account restrictions, per-owner issuance quotas, 1–5 recipient batch limits, duplicate idempotency, provider failure isolation, safe unknown status, rotating resend, stale revisions, receipt privacy and pending GM approval boundaries. `npm test` runs it with all prior suites; Firebase emulator verifies status metadata cannot be read or forged by browser clients, token rotation and no campaign membership changes. GitHub Actions also checks lint, content, dependency audit, XP/data-sync regression, production build and asset parity.

**Next:** Phase 7.3 — In-App Notifications. Not started by this update.
