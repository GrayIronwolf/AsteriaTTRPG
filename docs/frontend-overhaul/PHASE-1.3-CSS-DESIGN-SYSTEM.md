# Phase 1.3 — React CSS architecture and shared design system

Asteria website overhaul | 18 November 2026

**Scope:** The isolated React/Vite frontend only. **Production website:** unchanged.

## Replacement, not an override layer

The old frontend preview stylesheet, frontend/src/styles/foundation.css, was **deleted**. The new React entry imports exactly three global files:

- frontend/src/styles/tokens.css — canonical brand colours, typography/spacing, appearances, surface and control tokens.
- frontend/src/styles/reset.css — native defaults, box sizing, focus accessibility, reduced motion.
- frontend/src/styles/typography.css — minimal body/heading type defaults.

All page, navigation and component styles live in locally scoped .module.css files imported by the corresponding React component. No legacy css/styles.css, page-template CSS, current dashboard CSS, or old JS controller is imported in the new frontend. Nothing was added to the live website.

## Shared React components

| Component | Single owner |
|---|---|
| CrystalButton (+ CSS Module) | Gunmetal bezel + inset crystal, elongated spear-point hex, nav/primary/secondary, compact/regular/wide |
| PageLayout (+ CSS Module) | Width variants, responsive gutters, consistent max-width |
| SurfacePanel (+ CSS Module) | Obsidian Stone, Stone Slate, raised surfaces |
| Typography (+ CSS Module) | Eyebrow, display/page headings, body text |
| SiteShell (+ CSS Module) | Blue-gray header, wordmark, desktop single-row links, mobile menu, skip link, footer |
| HomePage (+ CSS Module) | Hero artwork, fade/overlay, welcoming page presentation |
| RoutePreviewPage (+ CSS Module) | Honest migration placeholders, no private account/game data |

The central token values currently include black page background (#000000), blue-gray header (#162839), Obsidian panel (#060D15), warm off-white text, 44px minimum tap targets, accessible focus and motion preferences. The shape and size controls avoid the duplicate large-button overrides that previously disrupted the live header.

Named background contract: black default; dark-gray, light-gray, dark-blue and forest variants via root data-asteria-background tokens. Account preference persistence and visual theme picker are intentionally deferred.

## No conflicting CSS/JS

- One CSS token owner; no independent page-specific brand palettes.
- No !important, global button/nav overrides, or imported legacy styles.
- Components use scoped CSS Modules; responsive sizing lives alongside the actual component.
- The current React routing hook retains exclusive navigation ownership in the preview.
- Existing production dashboards and src/styles are not altered. They will later consume the shared tokens/components when migrated, rather than receiving another legacy CSS overlay.
- Actual account, friends, Compendium, Forge, GM and player features are not activated in the preview until later feature migration and permission parity testing.

This is **not** a promise of full pixel-for-pixel visual parity with the current live website yet. Full user/profile controls, animated logo embellishments, and complex dashboards still belong to later feature-specific migration work.

## Verification

Source regression checks enforce CSS ownership, deletion of the old preview stylesheet, absence of legacy imports, correct token values, component reuse and unchanged production entry. Browser tests check actual computed colours, hexagonal buttons, real Asteria artwork, one-row desktop navigation, responsive menu/tap targets at 320–1920px, theme token variants, surface rendering, reduced motion and return Home.

Existing Phase 1.1 and 1.2 checks were updated to test the same real behavior through semantic and stable test identifiers, not the removed global CSS class selectors. GitHub's dedicated React/Vite workflow plus repository-wide checks must pass before merging.

## Next

Phase 1.4: consolidate JavaScript ownership and shared service boundaries in the new React architecture. Phase 1.5: integrated smoke/regression and visual acceptance. No user-triggered Firebase deployment is required for Phase 1.3, since it does not change the root site entry or existing Firebase deployment.
