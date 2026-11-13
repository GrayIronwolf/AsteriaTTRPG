# Digital GM Toolkit Phase 1.1 — Account Page Layout

Scope: account-page presentation only. No Firebase, authentication, dashboard, header, or account-data changes.

- Replaces the Account Settings card hub with the sketched two-column page: text-only vertical sidebar, faded divider, content area, and plain red Log Out at the bottom.
- Adds Profile, Account Settings, Appearance, and Password & Security sections. Keyboard arrow keys, Home, End, focus and tab visibility follow accessible tab behaviour.
- Preserves the existing Profile, Appearance, Security, Friends, Notifications and Logout actions. Embedding their existing forms directly in the page is reserved for Phase 1.2.
- Resets the selected account tab on sign-out/account switch; signed-out access continues routing to login. Other pages and the header are unchanged.
- Uses a narrow-screen stacked layout until the separate Phase 1.3 navigation redesign.

Validation: `node --check js/asteria-account-pages.js`, `npm run test:account-pages`, `npm run test:account-navigation`, `npm run release:check`, and PR website/Firebase CI. No deployment is triggered by this phase.
