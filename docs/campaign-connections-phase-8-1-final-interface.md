# Asteria Campaign Connection Upgrade — Phase 8.1: Final Interface

**Scope:** Final visual and usability polish of campaign joining, legacy and secure invitations, GM campaign management, roster and in-app notification surfaces. This is **Phase 8.1 only**, not Phase 8.2 data migration or Phase 8.3 production rollout.

## Audit baseline
- Base: `main` commit `755dd3ec755946b7c1d65ca804c78024d5899e46` (Phase 7.3, PR #112).
- Current campaign flows live in `js/clean-compendium.js`, notification inbox in `js/campaign-notifications-ui.js`, roster view in `js/campaign-roster-view.js`, GM manager in `src/dashboards/GMWorkspacePanels.jsx`, and their approved shared styling in `css/clean-compendium.css`.
- Existing Phase 6/7 flows stay independently disabled by default. The published website and Firebase backend are deployed separately.
- All approved art, panel headers, themes, dashboard customization, combat, characters, inventories, XP, storage rules, server callables and gameplay are retained.

## Interface work
1. Add `css/asteria-campaign-connection.css` as a scoped last-loaded stylesheet. Reuse current theme variables and approved buttons, no replacement assets or extra fonts. Preserve mobile touch sizes, focus visibility and reduced-motion preferences.
2. Give the joining card a three-step explanation tailored to the legacy or GM-approval lookup mode. The legacy system remains accurately described as immediate autojoin; the canonical flow describes request and later character linking. No joining permission or submission path is changed.
3. Correct old rollout language in the legacy email-ready invitation record and secure invitation manager; email-ready records are **not** sent emails, secure links do **not** independently grant membership.
4. Improve private notification inbox presentation: readable page/unread summary, clear unread/read state, semantic list items, localized timestamps, and busy-state indication. Retain authenticated server-only callable, account switch checks, pagination, safe `textContent` rendering and idempotent mark-read.
5. Improve GM roster sections with explicit item counts and descriptive keyboard-accessible member action groups. The server remains the sole authority for GM permissions.
6. Improve the existing React GM Campaign Manager presentation through scoped CSS only. The compiled React bundle and GM membership display logic remain unchanged; accounting fixes require a separately rebuilt artifact and regression review.

## Security and release boundaries
- Preserve `window.AsteriaFeatureFlags` **false** values in `index.html`, including `campaignNotifications`, `secureInvitationManager`, `emailInvitationControls` and join request/review flags.
- No Firestore rules, Firebase functions, Cloud Function deployment, DNS, secrets, sender integration, live email or production database writes.
- No new membership, ownership, role, invite acceptance, approval, character linking, gameplay or storage changes.
- Any later activation requires separate Phase 8.2/8.3 authorization, production backend review, multi-account authenticated checks and a rollback plan.

## Verification
- `npm run test:campaign-interface` checks scope, disabled flags, accessible markup, presence of responsive styles, and lint-safe Node syntax of touched legacy scripts.
- Standard CI runs production dependency audit, content check, lint, `npm test`, XP/data-sync regressions, Firebase emulator integration, production build and bundle consistency.
- GitHub Pages deployment confirms website assets are published after merge, but does not prove production Firebase function/rule activation or real-device multi-account behavior.
- Physical mobile/tablet/desktop and authenticated Player/GM end-to-end interactions remain separate manual acceptance requirements.

**Do not begin Phase 8.2 automatically.**
