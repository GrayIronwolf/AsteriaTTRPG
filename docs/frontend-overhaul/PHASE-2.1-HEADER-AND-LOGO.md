# Phase 2.1 — Global Header & Wordmark Migration

**Project:** Asteria TTRPG | 18 November 2026

## Scope and production boundary

Replaces the new React/Vite preview header with the existing Asteria wordmark treatment and one React-owned header layout. All work remains in the isolated frontend, with no changes to production index.html, legacy css/js, Firebase rules, dashboards or deployment. This is **not** a live-site cutover or a claim of completed account integration.

## New component ownership

| Component | Responsibility |
|---|---|
| frontend/src/components/AsteriaBrand.jsx + .module.css | Official asset-backed 2048x682 Asteria wordmark; four precisely matched star clip paths; animated recolour; reduced-motion support |
| frontend/src/components/HeaderAccountControls.jsx + .module.css | Guest login navigation; verified-account image/initials display contract; properly sized profile portrait |
| frontend/src/components/headerIdentity.mjs | Data validation boundary for a future trusted authenticated user/profile adapter; rejects missing/unverified identity and unsafe avatar URL schemes |
| frontend/src/components/SiteShell.jsx + .module.css | One header/layout/nav owner, connected to the existing Phase 1 route registry and desktop/mobile menus |
| frontend/src/styles/tokens.css | Single authoritative header height, wordmark size, profile portrait size and star colours |

## Header visual and behavior requirements

- Solid blue-gray #162839 remains the default header surface, not a background image or overlay.
- Reuse the original asteria-wordmark.png. The four star windows match the legacy header SVG paths (two A-shaped and two lower line stars). Colour cycling is CSS only: blue, cyan, violet, gold. Reduced-motion preference disables the animation.
- Do not create independent duplicated CSS for button sizing; the existing scoped CrystalButton remains the only control treatment.
- The logo is positioned at the left, with responsive sizing and no cropping/overlap. Desktop navigation stays on one row from 1280px upwards; narrower displays use the existing accessible mobile disclosure. The Login/Account area remains separate from navigation.
- For guests, the header shows Login and **never** a fake profile. When a future verified identity adapter is connected, the profile image uses a square, cropped display with accessible navigation; image load errors fall back to the username initial.
- Account ID, unread notifications, authenticated dropdown and actual profile retrieval are **not** fabricated in this preview. They remain in the existing website until the later secure Account migration.

## Test and evidence

- scripts/site-header-phase2-1.test.mjs covers the official logo path, four star clip shapes, scoped CSS and token ownership, header link and account navigation, verified identity safety and production isolation.
- scripts/site-header-browser.cjs adds real Chromium checks for logo loading, star animation/reduced motion, solid header colour, 11 viewport widths (320, 360, 390, 430, 768, 1024, 1150, 1279, 1280, 1440, 1920), one-row desktop layout, account controls, no clipping, mobile navigation and direct Home/Login routing.
- All Phase 1.1–1.5 source/build/browser regressions still run. Prior tests are adapted to the actual SVG image-backed brand and new 1279px compact breakpoint.
- GitHub Actions uploads Phase 2.1 screenshots and the layout metrics JSON as a 30-day artifact. CI tests must pass before merge.

## Deferred requirements

- An authenticated browser baseline and real profile/notification user state.
- Exact live-site appearance approval at all widths.
- Mega-menu design and navigation cards (Phase 2.2).
- Home carousel and content cards (Phase 2.3).
- Account and theme settings integration (Phase 2.4 and later Account migration).
- Final removal of the original production header DOM handlers and conflicting CSS only after the replacement website passes comprehensive parity and final cutover.

**Deployment:** No Firebase deployment is required. The new header is not yet served by the live production root.
