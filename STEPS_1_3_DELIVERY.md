# Asteria Modernisation Steps 1-3

## Completed

1. Audited framework, routes, state, listeners, storage keys, CSS conflict surface, and legacy dependencies.
2. Established the official React architecture for routes, application context, legacy boundaries, Firebase calls, live subscriptions, shared contracts, and sync states.
3. Established the reusable Asteria design system with central tokens and shared shells, panels, navigation, status, resource, currency, loading, modal, and state components.

## Important Files

- `UI_REACT_MIGRATION.md`: architecture and safety contract.
- `css/asteria-design-tokens.css`: canonical visual tokens.
- `src/app/AsteriaAppContext.jsx`: application provider.
- `src/app/asteriaRoutes.mjs`: official React route parser/builder.
- `src/app/legacyBridge.js`: temporary static compatibility boundary.
- `src/types/asteriaContracts.mjs`: shared route/session/sync contracts.
- `src/state/liveSyncState.mjs`: consistent live-sync presentation.
- `src/components/WorkspaceUI.jsx`: reusable component library.

## Deletions

No files were deleted. The audit identified legacy systems that are still active and must remain until their routes are migrated and verified.

## Compatibility

Public compendiums, authentication, Character Forge, Campaign Forge, theme settings, stored-data keys, Firebase contracts, and content files remain compatible. React live dashboards continue to use the existing Firebase singleton through one service adapter.
