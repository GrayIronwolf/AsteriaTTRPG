# Phase 6.1 - GM Dashboard migration into isolated React/Vite

## Replacement boundary
This phase migrates the GM Dashboard route, GM permission verification, live campaign and party overview, and session lifecycle into the single React/Vite application. The deployed GM Dashboard at src/dashboards/GMDashboard.jsx is left intact until final cutover; the new app neither mounts nor imports it.

The #/dashboard route lists owned campaigns. The #/react/gm/{campaignId} route opens a server-authorised GM workspace with account-scoped subscriptions and a single CSS module style owner.

## Compatibility and server authority
- Reuse the existing Firebase Auth, Firestore, canonical profile and campaign records. No second Firebase app, global window.AsteriaFirebase bridge, new Firestore rules, backend or database schema.
- New flag VITE_ASTERIA_GM_DASHBOARD_ENABLED=true is required alongside Auth and Campaign Forge services; default remains off.
- Legacy v1 campaigns accept only ownerUid, gmUids or canonical roles[uid] == gm, exactly as the current rules. No legacy upgrade.
- Canonical v2 campaigns accept only the owner or active co-GM with an exact matching server-owned member record. The owner list is owner-scoped; co-GMs may use a shared direct campaign link.
- Project only name, level, class, HP/SP/MP from authorised roster snapshots. No GM-only private records are stored in the public app shell.
- The session start, pause, resume and end operations write the existing liveSession/current, sessions/{id} and events data transactionally with the same 10-hour expiry and audit event schema. Current security rules enforce writes.
- Signed-out, changed-account, denied access or failed listeners clear the data and dispose subscriptions. Cached initial snapshots never grant permission.

## Remaining dashboard roadmap
Phase 6.1 migrates the **GM shell and live session controls**, not all gameplay features. Phase 6.2 moves Player and Character dashboards. Phase 6.3 replaces dashboard layout editor. Phase 6.4 consolidates campaign management, presentation and video maps. Phase 7 migrates combat, checks, loot, rewards and other gameplay systems. Old panels are retained on the live website until parity, not layered into the new preview.

## Acceptance and cutover
- npm run site:check includes Phase 6.1 role, projection, routing and privacy tests.
- npm run site:gm-browser uses two real emulator accounts to test session lifecycle and mobile player denial.
- A dedicated CI workflow builds the flagged emulator site and then restores the guest preview with the GM feature disabled.
- Existing Firebase, website, release, source and visual checks must pass before merge.
- Production hosting deployment and activation are deferred until the complete 10-phase overhaul and owner-reviewed cutover.
