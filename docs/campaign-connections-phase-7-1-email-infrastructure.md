# Campaign Connection Upgrade — Phase 7.1: Email Infrastructure

**Scope:** Prepare a secure, server-only transactional email transport, verified sending-domain configuration, and Asteria-branded invitation templates. **No live emails**, no public send callable, no Firestore trigger/queue, no delivery retries, no management UI, no Phase 7.2 or 7.3.

## Baseline audit

Baseline: `main` commit `9c6bcca665874c894aa28c9a9116b8172bf6479a` (Phase 6.3, PR #109). Existing Phase 6.1 invitations disclose a 256-bit bearer token **once**; the private server stores only an HMAC digest. Phase 6.2 lists and revokes invitation metadata without exposing tokens. Phase 6.3 accepts token-bearing links through manual GM-approved join requests. Nothing in Phase 7.1 changes those flows or existing campaign content, character/gameplay state, React dashboard visuals or published assets.

The website's canonical domain is `asteriattrpg.com` (`CNAME`). The email sender proposed for initial verification is **invites@mail.asteriattrpg.com**. Sending domain authentication is not currently known to be configured; no DNS checks or edits were performed. **Provider chosen:** [Resend](https://resend.com/docs/send-with-nodejs), using direct REST over server-side `fetch` and no new runtime dependency.

## Code changes

- `functions/campaignEmailTransport.mjs`: server-only Resend transport for a future authenticated Cloud Function. `deliverAsteriaInvitationEmail` refuses network activity unless `ASTERIA_EMAIL_DELIVERY_ENABLED=1`, validates sender domain and `ASTERIA_EMAIL_DOMAIN_VERIFIED=1`, and requires a valid server-supplied API key. A fixed provider URL, eight-second timeout, provider idempotency header, bounded values and sanitized error messages prevent secret leakage or accidental dynamic destinations.
- `functions/campaignEmailSecrets.mjs`: Firebase Functions v2 `defineSecret('ASTERIA_RESEND_API_KEY')` declaration and adapter for a **future** explicitly secret-bound server function. This file does **not** define, export or schedule a deployed callable/HTTP/background function. Future Phase 7.2 must wire this secret into the relevant Cloud Function using `secrets:[asteriaResendApiKeySecret]` and verify actor/recipient/invitation authorization server-side.
- `buildAsteriaInvitationEmail`: branded dark blue-grey/gold HTML email with plain-text fallback. Uses only inline CSS and no images or tracking pixels. Escapes campaign/GM display names; validates `https://asteriattrpg.com/#secure-campaign-invite=...` structure, matching campaign/invitation IDs and token length. Includes explicit GM approval/role warning, expiry and private-link notice.
- `resendIdempotencyKey`: stable opaque SHA-256 key binding campaign ID, invitation ID and normalized recipient. Does not contain raw email address or invitation token. This supports later retries; it does not create a delivery receipt or queue in Phase 7.1.
- `npm run test:email-infrastructure` is registered in `npm test`. No website `index.html` or existing Firebase feature flags changed.

## Provider setup (administrator action, NOT performed by this PR)

1. Create a Resend account for the authorized Asteria domain owner. Add and verify `mail.asteriattrpg.com` as the sending domain using the provider dashboard. Do **not** guess DNS target or record values. Copy the exact current provider-generated DNS records into the domain's authoritative DNS.
2. Configure the provider-requested **DKIM** record(s), the provider's **SPF / MAIL FROM / return-path** records, and a **DMARC** record aligned to the organizational domain/subdomain policy. Avoid overwriting an existing SPF record; SPF must not have multiple competing TXT policies at the same hostname. Prefer a DMARC policy that starts with monitoring and is tightened after verification. Confirm MX changes, if requested, affect only the intended sending subdomain.
3. Wait for verification in Resend and independently confirm the actual DNS records. Verify SPF/DKIM/DMARC **alignment** and sender reputation. A code flag alone does not prove DNS authenticity. Do not set `ASTERIA_EMAIL_DOMAIN_VERIFIED=1` until provider and DNS checks are complete.
4. Provision a restricted Resend **sending-only API key**. Store it in Firebase Secret Manager as `ASTERIA_RESEND_API_KEY`; never commit or place it in any `VITE_`/browser variable, GitHub workflow logs, local config file, Firebase Firestore or screenshots. Rotate/disable it immediately if exposed.
5. Backend configuration (not set by this PR):
   - `ASTERIA_EMAIL_FROM=invites@mail.asteriattrpg.com`
   - `ASTERIA_EMAIL_SENDING_DOMAIN=mail.asteriattrpg.com`
   - `ASTERIA_EMAIL_DOMAIN_VERIFIED=1` **only after external verification**
   - `ASTERIA_EMAIL_DELIVERY_ENABLED=1` **only during a separately approved Phase 7.2 sending rollout**
6. Before Phase 7.2 sending, review privacy and consent, quotas, bounce handling, deliverability, per-recipient limits, one-time token handoff and retries. Never retrieve/ reconstruct lost raw tokens from HMAC digests. Avoid sending raw bearer links through developer logs/telemetry. An actual client send route must be server-authorized and tied atomically to issuance/receipts; this is intentionally **not** part of 7.1.
7. Use a restricted, reviewed manual Firebase deployment and multi-account staging tests. Merely merging website code or passing emulator tests does not deploy Cloud Functions or verify the sending domain. Keep all existing production Firebase invitation/character flags disabled.

Useful provider references: [Resend domain setup](https://resend.com/docs/dashboard/domains/introduction), [Resend send email API](https://resend.com/docs/api-reference/emails/send-email), and [Firebase Secret Manager](https://firebase.google.com/docs/functions/config-env#secret-manager).

## Security and test contract

- **No live sending**: While disabled, the transport returns `{status:'disabled',provider:'resend'}` without validating credentials or making a network request. No deployed trigger/callable entry point invokes this module.
- **Privacy**: Owner/recipient emails, API keys, invitation links and rendered HTML are not logged; errors never include raw provider response bodies. A provider HTTP acceptance indicates only accepted submission, not mailbox delivery.
- **Template safety**: Inline CSS; no external assets/tracking pixels; HTML entities for user-controlled labels; strict HTTPS canonical-domain URL; both HTML and text, expiry and GM approval warning.
- **Provider safety**: Server-only fixed REST endpoint, bounded timeouts, stable opaque idempotency key, no automatic retries on ambiguous responses.
- **Verification**: Unit tests assert disabled gate, secret declaration, sender/domain validation, successful mocked HTTP request, no live outbound network, rejected/insecure links, HTML escaping, correct idempotency and sanitized provider failures. The full GitHub CI additionally runs `npm test`, `npm run test:firebase`, lint, content validation, dependency audit, production build and committed bundle parity. Real DNS, real-delivery and real-device tests remain outstanding by design.

**Next update:** Phase 7.2 — GM email invitation controls and actual delivery orchestration. Not started here.
