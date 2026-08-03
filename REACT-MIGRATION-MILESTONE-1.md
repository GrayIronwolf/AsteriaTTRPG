# Asteria React Migration - Milestone 1

## Scope

This milestone incrementally replaces the GM and Character dashboard renderers with React while preserving the existing static website, compendiums, Character Forge, Campaign Forge, content databases, authentication, inventory rules, and gameplay systems.

The static `#gm` and `#player` views remain in `index.html` as explicit fallbacks. React routes are:

- `#/react/gm/{campaignId}`
- `#/react/character/{campaignId}/{characterId}`

Campaign and character cards route to React when the compiled bundle is available. `window.AsteriaReactMigration.openLegacyGM()` and `openLegacyCharacter()` return to the static views.

## Architecture

- `src/main.jsx`: React mount and migration routing bridge.
- `src/app/AsteriaReactRoot.jsx`: hash route selection.
- `src/components/WorkspaceUI.jsx`: shared panels, tabs, resource bars, modal, status, and workspace shell.
- `src/dashboards/GMDashboard.jsx`: party roster, sessions, XP, loot, encounter entry point, and preserved GM system tabs.
- `src/dashboards/CharacterDashboard.jsx`: live character snapshot, resources, dashboard panels, XP notices, loot resolution, and preserved character tabs.
- `src/firebase/asteriaFirebaseService.js`: adapter to the existing Firebase singleton. It does not initialize Firebase.
- `src/sessions/useCampaignLiveData.js`: lifecycle-safe campaign, character, event, session, and presence subscriptions.
- `src/state/liveEventReducer.mjs`: idempotency, event merging, session transitions, and resource patch helpers.

## Live Data Rules

The canonical character remains `campaigns/{campaignId}/characters/{characterId}`. A transaction updates that document and creates a small event in `campaigns/{campaignId}/events/{eventId}`.

- XP is applied once with the existing `AsteriaProgression.grantXP` rules.
- Loot event IDs are also reward IDs, allowing one atomic character/reward/event resolution.
- Resource updates are clamped and transactional.
- Player event acknowledgement is persisted so notices do not reopen after reconnecting.
- Live session state and presence are separate from canonical character sync. XP, loot, and resources still work outside a session.

## Development

```powershell
npm.cmd install
npm.cmd run dev
```

Vite serves the current static site and loads React from `src/main.jsx` in development.

For a local QA dataset that does not connect to production campaign records, use:

- GM Dashboard: `http://127.0.0.1:5173/?reactFixture=1#/react/gm/demo-campaign`
- Character Dashboard: `http://127.0.0.1:5173/?reactFixture=1#/react/character/demo-campaign/kael`

The fixture adapter is development-only and is not included in `react-dist/asteria-react.js`.

## Production Build

```powershell
npm.cmd run build
```

This creates stable assets in `react-dist/asteria-react.js` and `react-dist/asteria-react.css`. The static `index.html` loads those files through `src/dev-entry.js`, so the full folder can still be hosted as a static website.

## Tests

```powershell
npm.cmd run test:react
npm.cmd run test:smoke
```

The focused milestone test covers duplicate XP prevention, reconnect event merging, loot terminal states, one-popup behavior, acknowledgement persistence, session transitions, resource clamping, singleton Firebase use, transactional API presence, static fallbacks, and production route assets.

Browser QA also covers 1440px desktop and 1024px tablet layouts, live session pause state, instant XP delivery and acknowledgement, one-time loot delivery, and resolved-loot route remount protection.

## Firebase Deployment

Publish the included `firestore.rules` before cross-account live testing:

```powershell
firebase login
firebase use asteria-ttrpg
firebase deploy --only firestore:rules
```

No additional Firebase application or content database is required. The current Firebase project and Email/Password authentication remain the source of truth.

## Compatibility Notes

- The compiled React bundle requires a web server; opening `index.html` directly with `file://` is not supported by browser module security.
- Existing static dashboard code is retained during migration, but its full-render calls are gated while a React dashboard route is active.
- Existing non-dashboard GM and Character systems continue to open in the static workspace until migrated in later milestones.
