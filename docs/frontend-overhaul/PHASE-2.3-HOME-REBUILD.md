# Phase 2.3 — React Home page, cinematic carousel and Forge cards

Asteria TTRPG | 18 November 2026 | Isolated React/Vite preview

## Implementation

Phase 2.3 replaces the temporary React Home layout created during Phase 1 with a standalone React page shaped by the **current checked-in production Home**. The production site, legacy Home script and all Firebase services remain unchanged. No deployment or production entry cutover occurs in this phase.

### Four-image Home carousel

The React Home uses the exact four live Home artwork assets and their current order:

1. Spider over the mountain city — `asteria-home-spider.webp`
2. Asteria logo against a storm-lit sky — `asteria-home-logo.webp`
3. Dragon above a moonlit kingdom — `asteria-home-dragon.webp`
4. Snowy Varkhyn — `asteria-home-varkhyn.webp`

One data owner: `frontend/src/home/homeContent.mjs`. It defines the slide roster, 15-second interval, Home actions and two Forge card destinations. The data is immutable. No legacy code imports.

`frontend/src/components/home/HomeCarousel.jsx` owns the active slide and timer; its CSS Module owns image fades, aspect/crop, edge treatments, progress line and transparent controls. Manual next/previous, four selection dots, arrow keys and horizontal touch gestures all change slides and announce manual navigation with an accessible live region. Only the selected slide is exposed to assistive technology. Dots use `aria-pressed` and all controls have 44px targets.

Autoplay pauses when any control has focus, the carousel is hovered, the page is hidden, the carousel is offscreen or reduced motion is requested. The only timer is a React effect with `clearTimeout`; document/media and intersection subscriptions are cleaned on unmount, including React StrictMode remounts. The first image is eager/high priority; others may lazy-load. CSS transition and scale effects disable on reduced motion.

### Page content and calls to action

`frontend/src/pages/HomePage.jsx` is the one Home composition owner. The approved page background, centred “Welcome to Asteria” introduction and two existing links are retained:

- Explore the World → `#/compendium?group=world`
- Open Handbook → `#/compendium?group=rules&category=handbook`

The old test preview panel is removed from the hero, and there is **no reinstated Welcome panel or World Map panel**. One small footer note accurately describes the preview's feature limitations.

### Forge cards

`frontend/src/components/home/ForgeCards.jsx` and its CSS Module own two large image-backed cards:

- **Forge a Character** → `#/character-forge?mode=create`, with existing Varkhyn artwork
- **Forge a Campaign** → `#/campaign-forge?mode=create`, with the approved existing map-book artwork

Each card is one semantic link, with images treated as decorative because the title and description fully describe the action. On desktop the cards sit side-by-side; on mobile they stack. Hover/focus animations are subtle, with a reduced-motion fallback.

These actions **do not create or access any actual characters or campaigns**. The current route feature registry deliberately keeps Compendium and Forge routes preview-only until authentication, privacy checks and data migration have been completed. The guest preview does not show a fake “My Characters” button.

## Architecture / no-overlay requirement

- Replaces `frontend/src/pages/HomePage.jsx` and its CSS Module rather than layering another stylesheet on top.
- New carousel and card components live in `frontend/src/components/home/` with independent CSS Modules.
- Shares Phase 1 design tokens and existing `CrystalButton` / `PageLayout` components.
- Does not import `js/asteria-aaa-upgrade.js`, `css/asteria-home-header-refresh.css`, `css/asteria-aaa-upgrade.css`, legacy `window.setView`, a new Firebase client or a competing router.
- Existing production `index.html`, current Home carousel DOM, Firebase rules/functions and dashboard runtime stay untouched. Legacy CSS/JS is retired **at final feature cutover**, after full parity is proven.

## Verification

- `scripts/site-home-phase2-3.test.mjs`: exact art roster, single 15-second cadence, DOM/animation ownership, event cleanup and reduced-motion safeguards, safe CTA/Forge routing, no fake backend access and production isolation.
- `scripts/site-home-browser.cjs`: Chromium verifies four slides, arrows/dots/keyboard, announcements, routing/history, images, 44px controls, cards at 320–1920px, 15-second auto-rotation under a virtual clock, and reduced-motion no-autoplay. Saves full-page screenshots at 390px and 1440px and a JSON metrics report.
- Dedicated GitHub Actions uploads `asteria-phase-2-3-home-evidence` (30-day retention). It also runs all previous Phase 1.1–1.5 and 2.1–2.2 build, CSS/JS, browser, isolation, legacy baseline and Firebase repository checks.
- Phase 1 placeholder-specific assertions are updated to check the real Home components instead of the removed placeholder.

## Remaining Phase 2

**2.4 — Settings, Appearance & Account Header:** migrate appearance and safe settings controls into React, preserving existing themes without inventing authenticated state.

**2.5 — Integration, regression testing and cleanup:** run site-wide navigation, responsive/visual/accessibility audits and remove obsolete preview leftovers. Production retirement and authenticated gameplay migration require later phases.

**User action:** No deployment required. The React/Vite preview remains isolated; the current public website and authenticated gameplay continue to use the existing implementation.
