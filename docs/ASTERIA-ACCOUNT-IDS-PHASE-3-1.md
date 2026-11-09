# Asteria Account IDs — Phase 3.1: Account Button and Menu Navigation

## Scope
Create a minimal signed-in **Account** navigation menu, using the existing header and the same account control on mobile. No new profile editor, Account ID display/copy control, friend list, social actions, notification centre, security settings or changes to campaign invitations.

## Behaviour
- Signed-out visitors continue to see Login, and the existing registration entry is unchanged.
- Signed-in visitors see **Account** instead of the former top-right Logout label. This opens a keyboard-accessible menu containing **Account Settings** and **Log Out**.
- Account Settings opens the existing workspace settings. Log Out calls the existing Firebase signout path, preserving established session cleanup and private account caches.
- Outside click, focus departure, Escape, browser history navigation, resize and sign-out close the dropdown. Arrow Up/Down, Home and End focus menu actions.
- Below 1680px, existing JavaScript moves the shared controls into the mobile appearance drawer. The account dropdown flows inside that drawer rather than opening behind it or closing the parent before use.
- The old direct Account Settings button remains for compatibility until the later menu consolidation phase.

## Security / rollout
The Account ID website feature flag remains `accountIds:false`. No backend, Firestore rule, migration, production deployment, login or invitation behaviour changes. Do not show unverified `Username#00000` values; verified ID display is scheduled for Phase 3.2. Account names, UID and email are not used to construct a public Account ID in Phase 3.1.

## Verification
`npm run test:account-menu` checks keyboard navigation, sign-in/out, menu actions, responsive containment, close behaviour and source safety. `npm test` includes these tests; existing full GitHub CI checks lint, tests, Firebase emulator, build and bundle consistency. Merge only after a successful CI result.
