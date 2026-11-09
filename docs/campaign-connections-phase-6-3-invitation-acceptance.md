# Asteria Campaign Connection Upgrade — Phase 6.3: Invitation Acceptance and QR Sharing

**Scope:** Authenticated link/QR invitation preview, verified recipient claim and canonical pending GM approval. Phase 6.3 does not send email, auto-approve, promote Co-GMs, alter artwork, activate production Firebase, or begin Phase 7.

## Audited baseline and boundaries
- Phase 6.2 merged on `main` commit `0a7f7521cc754e44847a17b88e5df00d319e557a` (PR #108).
- Phase 6.1 issues 32 random bytes once; only an HMAC digest is stored in private Firestore. Phase 6.2 creates links `#secure-campaign-invite={campaignId}.{inviteId}.{token}`, never allowing token recovery.
- The canonical join path is `campaigns/{campaignId}/joinRequests/{uid}`, manually approved via `reviewCampaignJoinRequest`. A UCN still locates campaigns but must never replace a secret token.
- Existing production gates remain off. This update introduces **only** `ASTERIA_INVITATION_ACCEPTANCE_ENABLED=1` and browser `secureInvitationAcceptance:true` as separate future activation steps, both disabled by default.
- The existing callable `asteriaSecureInvitation` uses Firebase Auth and Secret Manager `ASTERIA_SECURE_INVITE_SIGNING_KEY`, with new actions `preview` and `accept` only when the new server gate is enabled. Issuance and invitation management retain their independent gates.

## Server authorization and transactional acceptance
- `functions/campaignInvitationAcceptance.mjs` exports read-only `previewSecureCampaignInvitation` and transactional `acceptSecureCampaignInvitation`.
- The account UID and `email_verified` come exclusively from authenticated Firebase claims. The raw token must be exactly the supported base64url form, and its bound HMAC digest must match via timing-safe comparison. The server validates campaign identity, v2 schema, invitation status, exact expiration, capacity of token uses, recipient UID, normalized verified email and current join policy.
- Preview provides only public campaign name, offered role, expiration and GM-approval requirement; no private member, campaign secrets, or token digest is returned.
- Acceptance is a Firestore transaction reading all relevant documents before writes. It atomically writes:
  1. One **pending** canonical `joinRequests/{uid}` record, with source `secure-invite`, immutable invitation ID and an offered-role **hint**.
  2. One server-only `invitations/{inviteId}/claims/{uid}` receipt.
  3. One token-use counter/revision update, automatically marking exhausted invitations as `exhausted`.
  4. Existing `campaignJoinRequestThrottle/{uid}` daily quota and a non-sensitive immutable audit entry.
- Duplicate acceptance by the same recipient is idempotent, even if the invitation has since expired/revoked/exhausted: it only returns that recipient's existing request and never increments uses again. A new claimant is rejected if the invite has expired, been revoked, or been exhausted.
- Existing pending or terminal UCN/other-invitation join requests are not overwritten or reset. A removed, banned or suspended account cannot bypass sanctions. Existing active campaign members do not receive new permissions.
- The GM still approves/declines the canonical request using the existing guarded review flow. Approval has its existing capacity revalidation and creates a **player** membership only. An offered `co-gm` invitation is an invitation **proposal**, not automatic promotion. GM must separately manage role permissions after joining.
- **No acceptance path changes campaign party, saved Character Forge sheets, experience, inventory, resources, character identity, combat state, or dashboard layout.** A pending invitation does not confer read access to a private campaign.

## Browser and private QR sharing
- `js/secure-campaign-invite.js` validates the exact fragment link format. Client detects it before other routes, strips the fragment immediately using `history.replaceState`, and stores the bearer token **only in in-memory state for the current tab**; no localStorage/sessionStorage/account mirrors/analytics or URL query parameters.
- Signed-in, Firebase-verified users can choose **Review Secure Invitation**, see limited campaign details, and then explicitly confirm **Request to Join Campaign**. Responses display pending GM review. Malformed, expired, revoked, exhausted, wrong-recipient and unauthenticated cases have visible fail-closed feedback. Logging out discards the tab's token; after refresh or closing the tab the user must reopen the original invitation link.
- `js/vendor/qrcode.js` is a locally served MIT-licensed QR generator with retained license. QR codes are generated **in the browser**, without sending bearer links to an external QR website. Only newly issued one-time links can be copied or displayed as QR; existing invitation tokens cannot be recovered or resent. Possession of the QR/link permits submitting a request within all server restrictions, **not** direct campaign access.
- The UCN legacy lookup and permanent campaign identifier flows remain unchanged, as do the Asteria menu, button, background, panel and dashboard visuals.

## Release gates and limitations
The Phase 6.3 front-end flag `window.AsteriaFeatureFlags.secureInvitationAcceptance` remains `false` in `index.html`. Backend `ASTERIA_INVITATION_ACCEPTANCE_ENABLED` is undefined/off. This PR does not deploy Cloud Functions/Firestore Rules, set signing keys or migrate campaigns. A later coordinated Firebase rollout must verify the Secret Manager key, prior invitation issuance/management flags, v2 membership rules, real account email verification and end-to-end tests on mobile, tablet and desktop. Never turn on automatic GM approval as part of invitation acceptance.

## Verification
- `npm run test:invitation-acceptance`: URL parsing, preview privacy, canonical pending requests, denied/verified recipients, expiry, revoke, exhausted limits, one-use vs multi-use, tampered tokens, replay, preexisting requests, blocked members and Co-GM non-escalation.
- `npm test`, `npm run test:firebase`, `npm run lint`, `npm run audit:production`, `npm run content:check`, `npm run build` and committed asset parity in GitHub Actions.
- Firebase emulator tests explicitly prevent client reads/writes to private claim records and unauthorised approval, and exercise a real GM review after an authenticated claim.

**The next roadmap phase is intentionally not started.**
