# Asteria Website Interface Overhaul — Implementation Plan
Status: in progress (started 2026-11-05). This is a working plan, not a claim of deployment or test completion.

## Locked intent
- Improve existing Player and GM dashboards, including all panels, menus, mobile layout, and accessibility.
- Preserve established gameplay rules, Firebase data models, character ownership, and existing authored content.
- Preserve the approved smoke artwork, fixed black/grey smoke layer, and the existing separate coloured lighting and motion effects.
- Keep the four-part Asteria ID Index Code stable through Compendium navigation changes.
- Review each modification through tests, a pull request, and deployment verification.

## Build sequence

### 1. Dashboard and panel behaviour
- [x] Add a safe fallback for character dashboard tabs that are unavailable after campaign changes.
- [x] Recover GM roster selection when the selected character disappears.
- [x] Add targeted state regression tests to the dashboard test command.
- [ ] Audit Player Dashboard overview, character, talents, skills, spells, inventory, quests, journal, party, gallery and settings.
- [x] Keep the selected dashboard tab visible when horizontally scrolling between sections.
- [ ] Audit GM main, PC inventory, news, quests, notes, economy, crafting, tools, gameplay and world panels.
- [x] Replace GM roster double-click-only access with separate keyboard and touch-accessible Select and Open Character controls.
- [ ] Verify modal focus, empty/loading/error states, horizontal overflow, scroll restoration and form save feedback.
- [x] Replace Player overview double-click-only quick-item/spell gestures with accessible confirmation controls and keep Inventory navigation available.
- [x] Clear GM title edit drafts on character changes; restore busy state and show errors after thrown GM save failures.
- [ ] Validate 320px, 390px, tablet and desktop layouts with screenshots and browser tests.

### 2. Shared navigation and Compendium
- [ ] Unify button/menu states, keyboard behaviour and touch target sizes.
- [ ] Verify Home, Compendium, Character Forge, Campaign Forge and account settings routing.
- [ ] Retain full-text search and direct links to exact canonical four-part IDs.
- [ ] Review 25 Compendium top-level categories for a clear, searchable index with progressive disclosure.
- [ ] Verify deep links, back navigation, mobile menu layout, and category page counts.

### 3. Theme architecture
- [ ] List all current canonical classes and existing preset naming aliases before adding presets.
- [ ] Implement class-based default theme selection for the active character.
- [ ] Define explicit precedence: individual area override > character custom primary/accent > active class default > global fallback.
- [ ] Ensure every supported themed area (header controls, Compendium buttons, panel borders/backgrounds, dashboard tabs, decorative lighting, and focus state) reads coherent tokens.
- [ ] Allow per-area custom colours, revert individual area to class default, and reset all customisations.
- [ ] Preserve existing browser-stored settings through an explicit versioned migration; avoid silent loss.
- [ ] Consider characters with multiple classes: allow explicit primary theme class choice, otherwise use the established primary class order.
- [ ] Keep the fixed smoke/background image colour unchanged; animate only transparent light overlays.
- [ ] Test colour contrast, reduced-motion preference, loading, and persistence across character changes.

### 4. Graphics and polish
- [ ] Inventory existing logo, background, header, menu and dashboard art; avoid overwriting approved sources.
- [ ] Polish existing steel-bezel / faceted-crystal buttons and press states without flattening them.
- [ ] Ensure artwork assets are compressed responsively but retain proportions and sufficient quality.
- [ ] Check that theme lighting changes never recolour the underlying black-and-grey smoke.

### 5. Verification and deployment
- [ ] Run npm test, lint, content checks and build on the final integrated change.
- [ ] Run authenticated Player and GM workflows against permitted test data.
- [ ] Verify smoke/theme/menu and dashboard behaviour at mobile and desktop breakpoints.
- [ ] Verify production deployment and document actual live results separately from local test results.
- [ ] Record any unresolved issues with reproduction steps and prioritised next actions.

## Release strategy
Use focused, independently reviewable pull requests. Do not automatically merge or deploy the whole overhaul just because a navigation patch passes. The first PR is #44, which introduces dashboard navigation state recovery. All later checkbox completions require actual implementation and verification.

## Release note — PR #45
The follow-up patch includes source-level UI changes. The existing CI verifies that committed `react-dist` bundles match the source. Regenerating and committing those bundles is required before this patch can be merged with all checks passing; source-level changes alone are not an acceptable release. Full responsive browser visual QA and live deployment remain outstanding.

## Security and Firebase compatibility repair — PR #46
On 5 November 2026, the isolated repair workflow passed content validation (891 canonical entries), lint, the full npm test suite, Firebase emulator tests, production build, and the unmodified production dependency security audit. The CLI was pinned to Firebase Tools 15.35.0 and the index-deployment fixture was updated to match its API normalization; compatible transitive overrides and lockfile security fixes were applied. The updated production React bundle and generated Compendium files were committed from the verified build. The temporary repair workflow was subsequently removed from the branch. Regular PR checks and production deployment must still be confirmed before marking the overhaul release complete.

## Panel reliability patch — PR #47
First audit pass focused on touch/keyboard access to Player Quick Items and Active Spells, confirmation before resource-consuming actions, and GM title/Armour Class save recovery. These changes require automated UI regression tests, committed source-matching React bundles, and Firebase/emulator and production security verification. A comprehensive panel-by-panel responsive visual audit remains open.
