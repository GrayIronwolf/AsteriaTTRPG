# Phase 5.4 — Character Forge × Campaign Forge Integration, Compatibility & Mobile Acceptance

## Scope and delivery
This phase completes the **isolated React/Vite Forge migration** (Phase 5.1–5.4), not a production website cutover or an automatic legacy campaign data conversion.

The Character Forge now provides an explicit entry point to campaign invitations. After a signed-in player is approved as a canonical v2 campaign member, the campaign invitation page provides the player's **verified owned characters** and a read-only status check before any link request. Requests use the current `asteriaCampaignJoinReview` Cloud Function (`character-link-status` and `character-link-request`) with `sourceKind: owned`. All character sheets remain in the owner's private account until the GM explicitly approves a link.

The Campaign Forge's v2 owner-only manager now provides a separate GM character-link queue. GMs may approve/decline pending links and deactivate, restore, or unlink approved gameplay characters using existing callable actions. The server's canonical membership, account projections, source ownership checks, capacities, revision checks, encounter safeguards, archives and gameplay mirroring stay authoritative. The React client never copies gameplay sheets, directly grants permissions, or writes campaign character/link/member documents.

## Existing data, legacy campaigns and rollback
- **v1 legacy campaigns** are never upgraded automatically; their original membership flow and characters remain unchanged. The integrated character manager is disabled for legacy records.
- **v2 canonical campaigns** require verified owner/member status, the independent feature flag, and independently enabled server Functions. A join approval alone is not a character gameplay link.
- The owned character remains editable in Character Forge after GM approval; the canonical backend archives linked gameplay on deactivation or unlink and preserves its restoration rules.
- If any callable fails, the frontend shows the actual error and does not update state optimistically. Stale revisions are rejected by the backend. No security rule, campaign schema, runtime service or Firebase project change is introduced.
- Feature flags default **off**, and the default offline site preview is rebuilt and tested after all emulator workflows. No production deploy or migration is part of this pull request.

## Rollout gates
To activate in an isolated test environment, enable **all four** React environment flags:
`VITE_ASTERIA_AUTH_ENABLED`, `VITE_ASTERIA_CHARACTER_FORGE_ENABLED`, `VITE_ASTERIA_CAMPAIGN_CONNECTIONS_ENABLED`, `VITE_ASTERIA_FORGE_INTEGRATION_ENABLED`. Campaign Forge is independently controlled by `VITE_ASTERIA_CAMPAIGN_FORGE_ENABLED`.

The Cloud Functions still require their existing backend flags:
`ASTERIA_CAMPAIGN_V2_CANARY_ENABLED`, `ASTERIA_CHARACTER_LINK_REQUESTS_ENABLED`, `ASTERIA_CHARACTER_LINK_APPROVAL_ENABLED`, `ASTERIA_CHARACTER_LIFECYCLE_ENABLED`, and the existing joining/invitation backend flags. Do not activate these flags for existing data without the separately reviewed canonical v2 cutover procedure.

## Tests
- `npm run site:check` includes `scripts/site-forge-phase5-4.test.mjs`, checking owner projection, forged role/ID rejection, correct action names and legacy fail-closed behaviour.
- The new `site:forge-integration-browser` uses two real Firebase emulator Auth accounts on desktop and narrow mobile: create v2 campaign, issue one-time invite, accept as player, GM approve membership, create a saved character, request/approve its link, verify the source remains in Forge, deactivate, restore, unlink, and verify final ownership isolation.
- All Phase 1.5–5.3 source and browser tests remain active. The CI rebuilds the **offline guest preview** at the end and verifies its baseline to prevent this isolated feature from leaking into the production bundle.

**Owner action:** After merge, normal GitHub workflow deployment remains the owner's separate action. This PR does not run it. Any real v1-to-v2 migration requires a separate backed-up and reviewed runbook.
