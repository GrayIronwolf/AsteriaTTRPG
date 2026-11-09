# Campaign Connection Upgrade — Phase 7.3: In-App Notifications

**Scope:** Recipient-private in-app campaign alerts for GM join requests, player approvals/declines and invitation email submission (existing verified accounts only). Includes a feature-gated, paginated inbox and read/unread state. No push notifications, external messaging, new emails, campaign-role changes, or production activation.

## Baseline and audit

- Latest audited main commit: `6123214511c485b70c3945822dd9bb395b8c312d` (Phase 7.2, PR #111).
- Canonical account join requests already live at `campaigns/{campaignId}/joinRequests/{uid}`, authenticated Cloud Functions handle GM approvals/declines, and Phase 6.3 signed invitation acceptance creates a **pending** request. Phase 7.2 has email delivery status but does **not** know whether a provider-accepted email reaches an inbox.
- The website has an authenticated Account Workspace and Campaign Forge; existing Player/GM dashboards, artwork, panel headers, menu images, combat, inventory, XP and role systems are unchanged.

## Design and private data model

- New `functions/campaignNotifications.mjs` stores server-owned messages under `campaignNotificationInbox/{recipientUid}/items/{notificationId}`. IDs are deterministic SHA-256 of recipient UID and canonical event key; contents have only recipient UID, campaign ID, kind, generic title/body, createdAt and optional readAt.
- Server-generated events are `join-request`, `join-approved`, `join-declined`, and `email-invitation`. No raw invite token, link, HMAC digest, recipient email, private campaign note, player character sheet or role grant is embedded. Email-invitation notifications explicitly say to check the original email for the private link and **do not** replace a secure email invitation.
- Event creation hooks are opt-in through `notificationsEnabled` options supplied exclusively by gated Cloud Functions. Canonical UCN join requests, secure-token join requests and GM approval transactions enqueue the right recipient notification atomically **within the existing transaction**. Duplicate join request submissions and GM reviews do not enqueue duplicates.
- New email notices are emitted only after the Resend provider reports an **accepted submission**, and only if Firebase Admin Auth resolves the exact recipient email to an **existing verified account**. The notice does not claim successful mailbox delivery. Email notification failure is best-effort and must not trigger another outbound email.
- The new callable `asteriaCampaignNotifications` binds authenticated Firebase UID (never accepts a caller-supplied recipient), and supports `list` (25 per page, private opaque cursor) and `mark-read` (idempotent). Read acknowledgements update only the recipient's own item and never remove the record.
- Firestore rules deny **all browser read/write access** to `campaignNotificationInbox/{uid}` and children. The server callable is the only intended read/acknowledgment path, with a separate `ASTERIA_CAMPAIGN_NOTIFICATIONS_ENABLED=1` backend gate, default **off**.
- `js/campaign-notifications-ui.js` provides a small accessible, paginated, on-demand inbox in the existing account dashboard and campaign workspace for authenticated Players/GMs. Uses plain DOM, no added images, no changed panel dimensions, and clear read/unread states. The Firebase client bridge calls the restricted callable; no localStorage/sessionStorage/token caching or direct Firestore subscription is added.
- Frontend flag `window.AsteriaFeatureFlags.campaignNotifications:false` remains off. The previously approved feature flags and legacy behavior are preserved.

## Activation and deployment boundaries

1. Keep `ASTERIA_CAMPAIGN_NOTIFICATIONS_ENABLED` unset/off and `campaignNotifications:false` in production until a separately approved authenticated end-to-end rollout, account switch tests, and Firestore rule/Cloud Function deployment.
2. Existing Phase 6/7 invitations, join/review and email feature gates remain independent and disabled by default. Notifications cannot enable any of them and never grant membership, promotion or character access.
3. Verify notification visibility in desktop/mobile layouts with actual Player and GM accounts after backend deployment. Existing CI/emulator tests are **not** physical-device or real-user authentication tests.
4. Notification creation is tied to new events while enabled; no retroactive notifications, migration/backfill or delivery push service is introduced. The inbox is paginated, not a real-time push feed.
5. A verified email notification is a generic alert about **provider submission**, not an email delivery receipt; later provider delivery webhooks or system-wide notifications require new scoping and security review.

## Verification

- `npm run test:notifications` tests opted-out behavior, join request and GM decision integration, duplicate/replay idempotence, private pagination, read receipt, notification content safety, invalid input and syntax.
- `npm run test:firebase` validates Firestore client denial for owner, recipient, member and outsider; canonical GM/player pending/approved notification creation; role and gameplay preservation; read acknowledgment and duplicate prevention.
- Complete GitHub CI must also pass production dependency audit, content checks, lint, all unit tests, XP/data-sync regressions, production build and committed asset consistency.

**Scope boundary:** Phase 7.3 only. Do not start Phase 8 or activate production Firebase flags.
