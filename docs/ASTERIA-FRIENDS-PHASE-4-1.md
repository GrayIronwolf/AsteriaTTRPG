# Asteria Friends — Phase 4.1: server-side private notifications

## Boundaries
Phase 4.1 adds **server-side events only**, not a notification UI, push service, email, campaign integration or new cloud project. All notices remain disabled until a separately approved backend activation. The current website is unchanged; Phase 4.2 will add the account Notifications UI.

## Data, events and privacy
- `friendNotificationInbox/{recipientUid}/items/{sha256Id}` is server-owned; direct Firestore browser get/list/create/update/delete are explicitly denied even for the owner. The collection is separate from `campaignNotificationInbox` and has no shared enablement.
- Only the authenticated `asteriaFriendNotifications` callable supports `{action:"list",cursor?}` and `{action:"mark-read",notificationId}`. It always derives the recipient from the Firebase Auth context. The standalone `ASTERIA_FRIEND_NOTIFICATIONS_ENABLED` must be `1` or it fails closed; the default is off.
- Each event is created in the **same Firestore transaction** as its authenticated canonical friend relationship transition. The database transaction must succeed as a unit. IDs use SHA-256 over a domain-separated recipient UID, immutable pair ID, relationship revision and kind. Re-running the same event cannot mint another notice.
- Event kinds: incoming request to the recipient; accepted/declined request to the requester; cancelled request to its recipient; neutral friendship-ended event to both parties; blocked/unblocked management confirmations **only to the actor**. No non-actor block alert can reveal a private block, and neither an unblock nor a notification restores friendship or bypasses the seven-day cooldown.
- Notification documents store `schemaVersion`, hashed `notificationId`, `kind`, fixed generic `title`/`body`, `createdAt`, and nullable `readAt`. They never store a Firebase UID, private/public Account ID, username, counterpart profile, email, avatar, invitation token, pair ID, campaign membership, or block actor.
- 25 entries per page with a validated existing-recipient cursor; stale/missing/wrong-recipient cursors fail closed. Read marks are transactional and repeat acknowledgements are idempotent.
- The request backend only emits these new events when `ASTERIA_FRIEND_NOTIFICATIONS_ENABLED=1` is set on its deployment. The existing independently scoped request release package includes the new helper but defaults the notification gate off. No old production deployments are retroactively enabled.

## Testing and release
- `npm run test:friends-phase4-1`: event coverage, allowed recipients, event ID deduplication, privacy-safe schema, strict query envelopes, idempotent read and source gate checks.
- `npm run test:firebase`: Firestore emulator test proves own/other/anonymous browser operations are forbidden, private list/read behavior, atomic request event creation, no notices on disabled/stale actions, and privacy-preserving block/remove outcomes.
- Retain full CI, lint, content checks, build and bundle verification before merge.
- **Do not deploy** a full Firebase backend or Firestore rules automatically. The new callable requires a future reviewed **single-callable** deployment mechanism, a reviewed Firestore rules rollout, and explicit approval before the flag can be activated; deploying only the original request callable would not deploy the new social inbox callable.
- Real two-account Android/desktop verification remains pending until separately approved deployment and activation. The Phase 3.2 live Remove Friend test also remains pending until an eligible accepted friendship exists; do not bypass the cooldown.
- Phase 4.2 account notifications presentation and Phase 4.3 reliability acceptance remain separate.
