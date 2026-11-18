# Phase 5.3 — Campaign Invitations, Joining & Membership

## Delivery
The isolated React/Vite Campaign Forge now provides a membership panel for **verified owners of canonical v2 campaigns**. The player invitation page provides explicit UCN lookup, join-request status, secure link preview and acceptance. Authentication uses the existing Firebase instance.

### Server-owned trust model
All membership and invitation actions invoke the existing `asteriaCampaignJoinRequest`, `asteriaCampaignJoinReview`, `asteriaSecureInvitation` and `asteriaCampaignUCN` Cloud Functions. No React code grants or revokes membership by editing Firestore directly, and no client role string is accepted as permission evidence.

- Secure credentials are generated and checked by the trusted backend. An invitation token is displayed only once. The incoming URL fragment is stripped synchronously before React renders and held in module memory until claimed.
- UCN lookup is only a preview. Legacy UCN lookup does not automatically join a campaign.
- Secure invitation acceptance creates a **pending join request**, never automatic membership.
- Owner / delegated GM approvals are server-validated with an expected revision and live capacity check. The server controls automatic approval availability.
- Owner roster actions use server-returned allowed controls and expected revision/status; the backend independently verifies owner or delegated active Co-GM permissions, and prevents owner transfer.
- The invitation manager lists only safe metadata, supports revoking/expiring tokens, and never returns signing key or token digest.
- Activity history is server-filtered, limited and owner/active-Co-GM protected.

### Rollout boundary
For a new canonical v2 campaign the isolated preview requires `VITE_ASTERIA_CAMPAIGN_CONNECTIONS_ENABLED=true` and the existing backend `ASTERIA_CAMPAIGN_V2_CANARY_ENABLED=1`. Other backend features are independently enabled; where disabled, the UI reports a server error and fails closed. Legacy v1 campaigns remain unchanged; the existing migration/cutover mechanisms are not silently invoked.

No new services, Firebase project, schema version, public content origin or live website deployment are introduced. Phase 5.4 remains the cross-feature cutover, mobile and existing-data compatibility validation.
