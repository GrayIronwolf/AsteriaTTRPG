# GM Dashboard — Player Manager priorities 8–10

**Target:** `Website-Build-Test` only, React/Vite. No `main` merge, Firebase production deployment, campaign migration or activation of staged access features.

## Priority 8: Individual player tools

The existing `Campaign → Player Manager` now contains an **Individual Tools** view. Its target picker is built from **verified membership-owned campaign characters**, not from presence or an unvalidated character ID. Users can also open it directly from the Players & Party roster cards.

Per-character inspection includes class/level, XP, HP/SP/MP, conditions, skills, and inventory counts. It opens the existing character sheet, inventory/trading, quests, GM controls and reward workspace without duplicating the editor. Existing `ConditionsPanel` and `ResourceRulesPanel` are reused directly.

When an **active** member has an **editable** campaign session, the GM may adjust HP/SP/MP using the existing core-revision-aware `updateCampaignCharacterResource` backend and grant XP using `grantCampaignXP`. Both require an explicit confirmation; neither operation is automatically retried if the response is uncertain. The server retains final authority over revision, amount, membership, GM access and session state.

## Priority 9: Live GM-to-player interactions

The **Live GM Actions** view targets one verified campaign character and reuses `GMContextCheckLauncher` for skill, social and other established universal checks. The existing backend handles digital/physical dice, modifiers, GM review and player notification delivery. The existing full `GMUniversalCheckManager` remains available for group/opposed checks, resend, cancellation, acknowledgement and reroll paths.

Recent check status and results are read from the existing GM Universal Check subscription. Buttons use the established revision-safe `universalCheckAction` command handler and a stable operation ID for retry safety. No new check database or direct Firestore write is introduced.

Reward delivery, player inventory and item trades continue to use the existing GM Reward Tools and Inventory workspaces, preserving their previews, notifications, recipient checks and history. A player check does **not** automatically award loot, XP or items.

## Priority 10: Activity and history

The existing Player Manager Activity section now provides a **single read-only timeline** built from:
- GM-subscribed universal check requests and results
- Existing campaign XP/currency/loot/magic rewards
- Existing verified character inventory and trade records
- The separately gated server membership activity stream when authorized

The timeline supports text search, kind filtering, campaign or focused-character scope and a bounded newest-first list. It does not fetch or expose private Forge originals, hidden item details or arbitrary cross-campaign histories. A missing source feed is not treated as proof that no event occurred.

## Release boundaries and manual verification

The campaign migration and advanced roster, invitations, Co-GM, character-link and member-control flags remain unchanged and off unless separately approved. The implementation uses existing Firebase contracts with backend permission enforcement; no production gates are enabled.

Automated regressions: `npm run test:gm-player-manager`, `npm run test:gm-player-operations`, `npm test`, `npm run lint`, `npm run test:firebase`, `npm run build`, the React compiled-asset workflow and source-vs-bundle CI verification.

Before any production release, independently check real owner/Co-GM/active/inactive/outsider accounts, stale browser sessions, character ownership cross-links, concurrent resource-revision conflicts, duplicate XP confirmations, player dice submissions, group checks, private notifications, item reward claim/decline, audit scoping, and mobile/tablet layouts. **Do not equate GitHub checks with a Firebase live-account acceptance test.**
