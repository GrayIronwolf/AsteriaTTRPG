# Top navigation and Compendium library

The permanent global Compendium sidebar is replaced by a full-width library at
`#/compendium`. Its six website browsing groups retain categories 00–25 and the
Asteria Handbook. These groups do not rename source categories or reinterpret
permanent definition IDs.

## Implementation

- `index.html`: one shared main navigation, independent Compendium index and
  disclosure actions, account controls and the existing menu/appearance dialog.
- `js/asteria-navigation.js`: library groups, source-backed search and filtering,
  breadcrumbs, local favourites/recent page IDs, route restoration, keyboard
  handling and responsive placement of the same navigation elements.
- `css/asteria-navigation.css`: full-width shell, reusable crystal-steel buttons,
  header artwork, library panels, responsive layouts and reduced-motion support.
- `js/universal-compendium-engine.js`: delegates only the library root route,
  adds a library return link and emits a viewed-page event. Existing definition
  routes and viewers remain authoritative.
- `js/asteria-core-shell.js`: keeps existing authentication/Forge/menu behavior;
  removes the superseded standalone mobile sidebar controller.
- `js/auth-bridge.js` and `js/clean-compendium.js`: account labels reuse Logout
  and the existing Account Settings workspace.
- `js/border-glow.js`: leaves crystal buttons' bevel layers under their own
  control; other gameplay controls retain their existing effects.
- `assets/header/asteria-header-desktop.webp` and
  `assets/header/asteria-header-compact.webp`: optimized supplied header artwork.
- `scripts/local-static-server.js`: serves WebP images with their image MIME type.
- `scripts/navigation-library.test.mjs`, existing smoke/UI/React checks,
  `package.json` and `eslint.config.mjs`: regression and lint coverage.

The library reads the existing viewer's visibility-filtered registry entries.
It stores only favourite/recent IDs in local browser storage, scoped to the
signed-in account or guest. It creates no Firebase collections or content copies.
Unavailable source categories are labelled rather than linked to invented pages.

## Artwork and responsive behavior

The supplied desktop PNG contains 1536 × 192 pixels, despite the 2560x320 name;
its 8:1 aspect ratio is preserved. The alternate strip is 1536 × 144 pixels.
WebP exports are 53,580 and 30,924 bytes. CSS uses proportional cover scaling,
dark overlays and a gradient fallback. At widths of 1200px and below, the compact
strip is cropped toward the figure and the existing hamburger opens navigation.
The separate HTML logo is removed; the supplied artwork itself is unchanged.

## Verification

- Full `npm test` suite, including new library tests: passed.
- `npm run lint`, `npm run content:check`, `npm run build`: passed.
- Live XP/loot synchronization check and all 59 Firebase emulator tests: passed.
- Generated Compendium data and committed React bundles remain unchanged.
- Browser widths: 320, 390, 768, 1024, 1100, 1200, 1201, 1280, 1366, 1440,
  1920 and 2560px; no horizontal overflow or duplicate navigation controls.
- Browser interactions: split disclosure keyboard/Escape, category navigation,
  global search, favourites, recent pages, detail bookmarks, back/forward, Home
  mobile menu navigation and selected states after Home/workspace changes.
- Local authenticated fixture: Account Settings, campaign gallery, Character
  Forge, new-character flow, dashboard resource/menu order, library and Logout.
  The existing fixture lacks `refreshCharacterSystems`; the browser harness
  supplies a no-op success response for that UI-only check. Actual persistence
  and permissions are covered by the Firebase emulator suite. No live account
  data was changed for verification.

Content validation reports zero errors and 98 pre-existing content gaps. This
navigation update does not fill or fabricate those missing source definitions.
