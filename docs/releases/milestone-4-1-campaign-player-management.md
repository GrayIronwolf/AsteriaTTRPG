# Milestone 4.1 — Campaign Player Management

Target branch: `Website-Build-Test`. No production release or Firebase deployment is authorized.

## Audited and retained

The existing GM Player Manager remains the separate management view within the GM dashboard. It already provides individual roster cards, character summary links, filters, pagination, join approvals, invitations, member moderation, role changes and activity reporting. The legacy roster continues read-only; canonical membership remains authoritative for all management operations.

## Added: GM-controlled attendance

Each verified active player receives a session-attendance selector with exactly these choices:

- Not Participating (default)
- In-person
- Remote

Attendance is stored separately under `campaigns/{campaignId}/attendance/{memberUid}`, never in membership roles, presence, combat, player resources or public presentation documents. It does **not** grant campaign access, add a character to combat or expose them on the second screen. The GM may explicitly change it; online status never changes it automatically.

The authenticated callable checks the current campaign, canonical active membership, owner or active Co-GM authority, valid mode and optimistic attendance revision in a Firestore transaction. The roster is bounded and refuses invalid records. The GUI hides stale privileged attendance after a failed request and refreshes on successful changes.

## Release gates (disabled by default)

Both the canonical website release manifest and the website's derived flags have `campaignAttendance:false`; this remains disabled until independently authorized. The server callable is gated behind `ASTERIA_CAMPAIGN_ATTENDANCE_ENABLED=1`. Roster administration retains its existing `campaignPlayerRoster` gate and `ASTERIA_PLAYER_ROSTER_ENABLED` gate. Production deployment and switching these flags on require a separate release decision.

## Automated verification

- `scripts/milestone-4-1-player-management.test.mjs` for GM authorisation, canonical membership, stale revisions, immutable role boundaries and control wiring.
- Existing roster, member moderation and GM player-manager regressions.
- Full repository lint, application build, Firebase and website checks and asset consistency.
- Browser baseline and publishing-isolation checks before integration.

Live account, mobile UI and production backend acceptance have not been established by automated CI alone. Do not claim this code is activated in production.

## Final branch verification

After the development-only asset synchronisation, the latest human-authored pull-request commit must pass all required CI workflows. Action-required checks on the bot-generated asset commit are not evidence of success. No merge may occur while checks are pending or failed.
