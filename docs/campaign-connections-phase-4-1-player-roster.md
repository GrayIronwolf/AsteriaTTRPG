# Asteria Campaign Connection Upgrade — Phase 4.1 Player Roster

**Scope:** GM-only, read-only campaign player roster covering active members, pending applicants, inactive members and verified linked-character summaries. No suspend, restore, remove, ban, role changes or character linking.

## Implementation

- Server callable `asteriaCampaignJoinReview({action:'roster',campaignId})` dispatches to `listCampaignPlayerRoster`, using the **Firebase Auth caller UID**. `ASTERIA_PLAYER_ROSTER_ENABLED=1` is required server-side; otherwise access fails closed.
- **V2 campaigns:** Owner or active canonical Co-GM can read. The roster is generated exclusively from `campaigns/{id}/members`, not legacy `gmUids`, `playerUids`, or `roles`. Only verified active/inactive membership and minimal pending request records are returned. Banned, suspended, removed and malformed canonical GM memberships are denied.
- **V1 campaigns:** Existing Owner/GM role authorization and `legacyMembershipPlan` are used. Legacy membership and status remain intact; no v2 request queue is assumed and no migration is performed.
- Output sections: Active Members, Pending Requests, Inactive Members; active player/GM counts, inactive and pending totals, verified linked-character count, UID, display-name snapshot, member role/status, joined date, and minimal character ID/name/level.
- Linked-character summaries are included only when a campaign character owner matches the member UID and a matching player character-link field or roster character-ID list exists. Conflicting ownership is excluded. No XP, spells, inventory, coins, email, secrets or complete character sheets are returned.
- Membership status is **not** session presence or online status. Pending applicants are separate and receive no campaign membership.
- The browser renders the roster with `textContent`, never raw untrusted HTML.
- The Campaign Forge > Manage Campaign page gains a *Player Roster* section with a Refresh control, using the approved existing panel style. No React build assets, dashboard grid, campaign artwork or gameplay systems are modified.
- The `window.AsteriaFeatureFlags.campaignPlayerRoster` flag remains **false by default**.

## Safety and limits

- The canonical member list is bounded to 100; oversized rosters fail closed rather than present an incomplete authoritative list. Pending requests are limited to 100 displayed with an explicit truncated message.
- Browser and Firestore security rules are unchanged, and browsers cannot write canonical membership or join request state. The read-only server function does not mutate campaigns, accounts, characters or permissions.
- A server-side GM authorization check occurs before reading any roster collection. The authenticated user, not a request-supplied UID, determines authorization.

## Verification

Run Node roster regressions, Firebase emulator role/access tests, the complete `npm test`, lint, build and committed-asset verification through GitHub CI. Check that anonymous users, players and inactive Co-GMs cannot list the roster. Confirm v1 compatibility, v2 canonical denial, no data mutation, pending applicant isolation, stale character-link filtering and mobile responsive rendering.

## Production activation

This PR does **not** deploy Firebase backend services or activate the roster. Deploy and verify Cloud Functions (and the prior Phase 2.3–3.3 backend/rules) first. Only then enable `ASTERIA_PLAYER_ROSTER_ENABLED=1` and, after authenticated owner/Co-GM testing, set `window.AsteriaFeatureFlags.campaignPlayerRoster=true` in a separate reviewed website release.

## Deferred

Phase 4.2 implements Suspend, Restore, Remove and Ban. Phase 4.3 implements editable roles, delegated permissions and expanded activity logging. Phase 5 implements character-link administration. Nothing beyond Phase 4.1 is activated in this update.
