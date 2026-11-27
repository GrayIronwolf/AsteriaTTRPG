# GM Player Manager — Priorities 4–7 (Test Branch Acceptance)

**Scope:** `Website-Build-Test` only. No merge to `main`, Firebase production deployment, membership migration or feature-flag activation is authorized by this change.

## Changes delivered

1. **Unified Player Manager (4):** A dedicated `Campaign → Player Manager` React/Vite page. Shows authoritative account membership separately from linked character sheets, status, presence, active/inactive players and GMs, search, filters and GM-owned character tool shortcuts. The existing GM Toolkit and Party Management panel link to it.
2. **Joining and invitations (5):** UCN copy, player-capacity summary, GM approval/denial queue and optional campaign approval policy. Reuses the existing server-revision-validated join-review operations; secure owner-only invitation issue/list/revoke/expire uses the established one-time token format. No emails are sent and a request alone does not import a Forge sheet.
3. **Character linking and lifecycle (6):** GM approval/denial of verified character-link requests, read-only linked summaries and the authorized deactivate, restore and unlink operations. The original owner's private Forge sheet is retained; active gameplay archives are managed by the existing server service. Multiple approved characters are listed independently; the established server campaign capacity/per-owner limits still govern linking.
4. **Roles and membership administration (7):** Owner-controlled player/Co-GM promotion, explicit delegated capabilities, server-authorized suspend/restore/remove/ban controls, recorded reasons for remove/ban, current revision requirements, account-bound verification and read-only recent activity.
5. **Presentation:** Asteria panel materials, responsive cards, keyboard-accessible controls, visible unsupported/disabled states and clear loading/errors without replacing the GM canvas or duplicating the existing backend.

## Access and safety

- Existing authenticated Callable Functions are the only write path. The React view never directly writes to Firestore member, character-link or invitation documents.
- Canonical membership version 2 uses only active member documents; stale legacy GM UID arrays never authorize v2 access. Legacy campaigns retain a read-only overview.
- All controls need both the browser feature gate and an authorized server endpoint; server operations independently enforce owner/Co-GM role, capability delegation, current revision, capacity and state transition rules.
- Join approval, role/member moderation, character approvals/lifecycle and invitations remain individually off unless separately enabled after real Firebase testing and release sign-off.
- `index.html` flags for `campaignPlayerRoster`, `campaignMemberControls`, `campaignRolePermissions`, `campaignCharacterApproval` and `campaignCharacterLifecycle` remain `false`. Server environment gates are not modified.
- Invitation bearer credentials are displayed only for the immediate one-time response; no browser persistence, logging or storing credentials as part of member summaries.
- Membership state is not online presence. The latter is a non-authoritative session indicator.
- A successful build or emulator test is **not** evidence of live production access, end-to-end multi-account acceptance or approved campaign migration.

## Automated acceptance

- `npm run test:gm-player-manager`: six-section menu, version-aware role and flag enforcement, v1 read-only compatibility, verified owner/character counts and online presence, capacity/revision rejection, valid character lifecycle transitions, existing callable reuse and disabled flags.
- `npm test`: includes the Player Manager test; `scripts/hybrid-dashboard-navigation.test.mjs` recognizes 26 GM pages and checks the new Campaign destination.
- `npm run lint`, `npm run test:firebase`, `npm run build`.
- GitHub Actions: `Firebase and website checks` verifies source and committed bundle parity. `Compile React website assets for Website-Build-Test (no deployment)` is triggered by all Player Manager sources, styles, state and regression tests and commits only compiled artifacts, never a Firebase release.
- `pages build and deployment` may publish Pages previews as configured separately; it does not imply Firebase production activation.

## Required manual acceptance before enabling the controls

1. Owner, active Co-GM with/without individual delegations, active player, suspended/banned member and outsider accounts on real browser sessions; verify correct visibility and no unauthorized Callable/Firestore access.
2. Submit two joining accounts through the same UCN; confirm capacity at the upper bound, revisions, approvals, denial and no character auto-import.
3. Approve a private Forge character-link request; verify its owner, campaign ID, gameplay import, duplicate prevention, separate approval and allowed multi-character capacity.
4. Deactivate an active character, confirm complete gameplay archive, then restore and unlink while checking HP/SP/MP, XP, inventory, talents and ownership metadata; verify active encounter protection.
5. Test owner-controlled promotion and demotion, delegated review/moderation, suspend/reinstate, ban/owner restore and read-only audit events.
6. Check one-time invitation copy/QR/revoke/expiry, account switching, browser reload and leaked-token prevention. Confirm no email delivery occurs.
7. Test 360px mobile through desktop views, keyboard focus, network disconnect/reconnect, errors, and preservation of dashboard canvas/settings.
8. Review the separate campaign rollout plan, actual Firebase version/rules state, backup/restore evidence and owner-approved canary before enabling browser/server feature gates.

**Release decision:** Staged source only. No production promotion without independent, real-account acceptance and an explicit separate approval.
