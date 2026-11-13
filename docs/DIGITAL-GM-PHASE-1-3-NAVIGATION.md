# Digital GM Toolkit Phase 1.3 — Header Navigation

Scope: the top navigation and its responsive presentation, following the
Phase 1.1/1.2 account-page updates. No Firebase, account data, Friends data,
Compendium definitions, gameplay or account-panel changes.

- Header destinations follow the hand-drawn layout: **Asteria Handbook**,
  **World & Lore**, **Asteria Compendium**, **Character Forge**,
  **Campaign Forge**, **My Friends**, then the separate **Account** button
  and existing profile portrait.
- Handbook and World & Lore link directly into the current source-backed
  Compendium library, using existing group/category filters, search, visible
  entries and route restoration. No duplicate pages or data collections.
- Compendium quick-navigation disclosure remains keyboard-accessible.
- Header buttons retain approved forged-metal/crystal artwork, selected states
  and profile placement. Desktop widths at or above 1680px fit one row.
- At narrower widths, the *same* navigation elements move to the existing
  drawer; Account and profile remain on the header. No second navigation copy.
- Friends remains a distinct signed-in page, outside Account Settings. Login,
  Account, logout, username/profile and notifications logic is unchanged.

Validation: `npm run test:navigation` (including Phase 1.3 tests),
`npm run test:mobile-header`, `npm test`, `npm run lint`,
`npm run build`, and existing GitHub CI. Firebase production and website
deployment remain exclusively manual. Do not begin Phase 2.
