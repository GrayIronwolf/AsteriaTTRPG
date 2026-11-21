# Share & Present — Improvement 5: Player Invitations

**Stack:** Phase 5 is based on Phase 4 PR #361, which is stacked on draft Phases 1–3. **No merge or deployment without owner approval.**

## Implementation

- Reuses the existing Firebase project, `hybridSessionControl/current`, `hybridViewerGrants/{uid}`, `presentationAssetAccess/current`, and the established safe presentation projection. No new email provider, invitation token, public URL credential, alternate session backend or campaign-member privilege.
- The GM can create a **pending** invitation for an exact authenticated Firebase UID and copy the existing restricted-viewer link. The link alone is not authorization.
- Recipients see a restricted invitation screen showing pending, accepted, declined, expired, revoked or closed status. They must sign in as that UID and explicitly **Accept** before their per-UID Storage manifest authorization becomes active. Declining never enables access.
- The dedicated recipient response callable validates the authenticated UID, invitation revision, current session epoch, pending state and expiry, then atomically updates the grant, session counts and media-byte manifest. It deliberately does not require normal campaign membership.
- Existing one-click legacy `grant` calls remain supported internally to avoid breaking earlier Phase 7.2 workflows. The improved GM interface uses `invite` for new invitations.
- GM can inspect invitation lifecycle and revoke pending or accepted invitations. Session closure and Phase 1 emergency stop remain the independent global revoke mechanisms.
- Session-level slot counting includes pending and accepted invitations, capped at 24, with revision checks and release on decline/revoke.
- No claim of connection heartbeat/presence: accepted means authorized, **not connected or watching**.

## Verification

- Phase 5 model/server integration tests, inherited Share & Present Phases 1–4 and 7.2/7.7 checks.
- Firebase emulator: pending UID reads own grant/session but not restricted stage; active can read approved stage; declined/revoked cannot; browser writes to grants are denied.
- React/Vite lint, build checks and tracked source-matched artifact verification.
- Manual two-account acceptance: exact UID invitation, copy link, wrong-account rejection, accept/decline, stale revision, expiry, session closure, emergency stop and GM revoke. Confirm original media bytes are inaccessible until accepted, and remain inaccessible after revocation.
- Verify 24 pending/active recipients maximum, quick re-invite after decline, retries after network interruption, no unauthorized dashboard/GM map reads, and player visibility only after explicit GM publish.
- Owner approval, reconciliation with the ongoing dashboard restoration and final integration CI are required before merge and deployment.

## Known limitations

- Recipient has to know their Firebase account UID, which remains a usability issue. Named contact search and safe identity discovery would require verified account-directory integration and privacy review.
- Link delivery is **manual copy/share**; the website does not send email or create a bearer-token invitation.
- Pending invitations are not connected viewers; the backend does not implement presence tracking.
- Expiration is enforced by server authorizations, but existing GM viewers may need reconnection to update UI status when no new snapshot arrives.
