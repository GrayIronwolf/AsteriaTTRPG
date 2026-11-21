# Phase 3 public shell and Compendium restoration

The original source revision is `cc4e78680c7482f9e105d655c50a7cc30a339d62`. Phase 3 starts from `df40fbc2b0005673aa85049af12d1360222ac03f`, which contains the approved Phase 2 baselines. [Original source](https://github.com/GrayIronwolf/AsteriaTTRPG/tree/cc4e78680c7482f9e105d655c50a7cc30a339d62) · [Phase 2 PR](https://github.com/GrayIronwolf/AsteriaTTRPG/pull/347)

## Restored workflows

| Workflow | Original behavior carried into React/Vite | Verification |
| --- | --- | --- |
| Public shell | Original solid navy, compact navigation through 1679px, 54/58/70px compact header, right-aligned drawer, and keyboard focus restoration. The verified account header shows the name, assigned Account ID or pending state, and Password & Security shortcut. | Header, routing, mega-menu, appearance, authentication, and cutover visual browser tests |
| Home and Forge | Four original carousel images and controls, direct Worlds and Handbook links, and signed-in My Characters. Forge menu links now open creation, owned lists, or the existing guarded invitation workspace. Create and list selection survive reload and browser history. | Home and two-account Forge integration browser tests |
| Version Log | The original patch notes are available by `#devLog`, `#/version-log`, and Open Version Log in the drawer. The page identifies the checks in the original local System Audit. | Routing browser and route registry tests |
| Public bookmarks | All 891 original canonical addresses retain their definition IDs. The set includes 226 class-qualified Talent addresses and four ambiguous bare Talent names that now offer choices. Domain and collection aliases, source references, and selected sections resolve through the same public router. | `site-restoration-compendium.test.mjs` and public entry browser tests |
| Catalogue | Six original groups, numbered categories, nested paths, metadata filters, search, category and name sorting, and 48-entry pages. Favourites, Favourites-only, and Recently viewed use the original browser preference keys, scoped to a verified account or guest. | Catalogue and discovery browser and Node tests |
| Public details | Original cover artwork and galleries, public metadata, related entries, racial and creature sheets, class talent tiers, Handbook Rules, Talent Ranks, bookmarks and reference choices. The publication checks verify original image bytes and every exported relationship target. | Entry browser, publication audit, and original artwork checks |
| Weapon Crafting | `/tools/weapon-crafting.html` ships at the original standalone address. Vite serves and emits the existing reference bytes. | Development, build, and release staging tests |

## Existing boundaries

The public publisher selects public records and sections, validates projected metadata and asset IDs, and generates a digest-named artwork registry. The new artwork adds 66 distinct PNG assets to the build. The catalogue and entry pages load only the needed images in the browser. [Publisher](../../scripts/site-compendium-presentation.mjs) · [Publication checks](../../scripts/site-security-publication-audit.mjs)

The Phase 2 signed-in fixtures and six approved dashboard references continue to cover Player, GM, and read-only GM. Full dashboard image matching belongs to Phase 9. The production build and release package can be checked locally with the existing staging commands. The owner controls deployment. [Dashboard reference setup](../../scripts/site-dashboard-reference-preflight.cjs)

## Restoration register

| Phase | Outstanding restoration |
| --- | --- |
| 4 | Account and social workflows, account appearance synchronization, joined campaign discovery, invitations and legacy join or relink, delegated Co-GM access, campaign artwork and lifecycle. |
| 5 | Legacy character assignments, compatible affinities, sparse journal records, original Forge and player-system behavior, and remaining dashboard data fidelity. |
| 6 | Original combat presentation and lifecycle, action and timer recovery, and the original encounter-clear behavior from the legacy System Audit. |
| 7 | Inventory, equipment and final AC, crafting, commerce and rewards. |
| 8 | GM tools, world and session systems, and historical session export. Any restored private Compendium access must use campaign permissions. |
| 9 | Dashboard artwork, original widgets and geometry, layout editing, presets, history and backups. Restore appropriate scope for the legacy checkpoint concept. |
| 10 | Consolidated parity, release staging and rollback, and owner-approved retirement of superseded original sources. |
