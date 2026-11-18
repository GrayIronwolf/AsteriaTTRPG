# Phase 2.2 — React Dropdown Navigation and Menu Cards

Asteria TTRPG React/Vite overhaul | 18 November 2026

## Outcome and scope

Phase 2.2 replaces the *new isolated React preview navigation behavior* with one shared, accessible React mega-menu and canonical registry of the **seven** existing menu categories. It does not modify the root production `index.html`, legacy `js/asteria-aaa-upgrade.js`, Firebase backend, dashboards or legacy CSS. The current live website remains unchanged.

The Phase 2.1 solid blue-gray header, official animated wordmark, compact spear-tip crystal controls, responsive header sizing and guest Login remain intact.

## Architecture

- `frontend/src/navigation/megaMenuRegistry.mjs` is the **one source of menu card content and preview hash destinations**. It mirrors the 35 existing menu entries across Handbook (6), Worlds & Lore (8), Asteria Compendium (10), Character Forge (2), Campaign Forge (3), Friends (2), and Account (4).
- `frontend/src/components/NavigationMegaMenu.jsx` and `.module.css` render the same reusable search, title, browse-all link, cards, backdrop and close controls for all seven menus.
- `frontend/src/components/SiteShell.jsx` owns one active-menu state, the mobile disclosure, a reference to the opening control, scroll locking and one cleanup-safe Escape listener. The existing Phase 1 `useSiteRoute` location store remains the **only URL/event router**.
- Card links are real URL hashes, preserving browser history and refresh. Compendium cards carry their intended group, category and search filter. Forge, Friends and Account cards contain query parameters for the intended future feature mode, without activating unmigrated services.
- The approved `assets/menus/forge-campaign-map-book.avif` is reused for the campaign creation card; other cards use a restrained CSS art treatment, not unapproved placeholder illustrations.
- Desktop/mouse: clicking any of seven header links opens its menu, with a separate `Browse all` destination inside the panel. Ctrl/Meta/Shift/Alt click retains normal browser link behavior. Home always navigates directly.
- Keyboard: Space or Enter opens, focus goes to search, Tab/Shift+Tab are contained while the modal is visible, Escape closes and restores focus. Backdrop and close control dismiss the panel.
- Mobile: the existing Menu disclosure contains the same eight primary links. Clicking a category closes the disclosure and opens the shared menu panel. Destination navigation closes the panel.
- Navigation cards are **112–132px wide** on desktop with a 202–232px tall shape, and **108–128px wide / 204px tall** on mobile. This intentionally implements the prior request to narrow cards while retaining their height.
- Motion respects `prefers-reduced-motion` without an extra global CSS override layer. The site still uses Phase 1 design tokens and component-scoped styles.

## Security/feature boundaries

This phase wires navigation, **not feature availability**. Compendium content and indexed notes are not loaded in the isolated preview, and the account, friends, character/campaign creation and gameplay routes remain secure placeholder destinations. The legacy website continues handling those real features. No extra Firebase app, credential entry, realtime subscription or private data request is added.

## Verification

- `scripts/site-navigation-phase2-2.test.mjs`: verifies all 35 registered entries, exact seven categories, hash parsing, query intent, fail-closed feature gates, filter behavior, CSS ownership, focus contract and production isolation.
- `scripts/site-mega-browser.cjs`: Chromium covers all seven menus, open/dismiss, Escape/focus restoration, 35 cards, search and empty results, image loading, history, keyboard focus containment, browse-all, ten responsive viewport widths and reduced motion.
- Updated Phase 1 and Phase 2.1 browser tests navigate using the same user flow as the new menus (category trigger, then Browse all). Existing route parsing, security and legacy deep-link expectations remain unchanged.
- Dedicated GitHub workflow runs all source, Vite build, lint and browser suites, uploads Phase 2.2 screenshots and machine-readable metrics, then requires repository-wide CI before merge.

## What remains

Phase **2.3 Home Page Rebuild** integrates the approved art carousel and page cards. Phase **2.4** migrates appearance settings and account header interactions with secure adapters. Later feature migrations implement real Compendium content, authentication, campaign creation and gameplay. Final legacy CSS/JS retirement occurs only at approved production cutover; this change is **not a new live legacy overlay**.

**User action:** No deployment required after the isolated preview merge.
