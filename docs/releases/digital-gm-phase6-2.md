# Digital GM Phase 6.2 — Fog of War and Map Tools

## Features

- GM can enable fog of war independently on each existing static or looping MP4/WebM map. Older Phase 6.1 maps remain visible until the GM enables fog.
- Fog starts completely hidden. GM Reveal and Hide brushes (0–8 squares radius) support pointer/touch dragging, grid-normalized coordinates, reveal all, hide all, and one-step-per-stroke undo (up to 20 history entries).
- GM can preview the same shaded view players see, or turn off the preview to inspect the full map.
- Fog state persists in campaign battleMaps documents as a bounded string with one 0/1 cell per grid square (up to 80 × 80). This prevents unbounded payloads; changing grid dimensions remaps visibility.
- Published map listeners update the player map view after a GM saves. Hidden areas and the tokens covered by them are concealed by the visual overlay.
- Map ruler measures point-to-point straight-line distance in grid squares and metres; GM configures 0.1–100 metres per square.
- GM can place private note, hazard, and encounter pins with optional text. Private pins are stored separately in battleMaps/{mapId}/gmNotes/private, guarded by GM-only Firestore rules and never included in public map metadata or player rendering.
- All existing Phase 6.1 media formats, looping playback, upload limits, grids, public tokens, and private media permissions are retained.

## Privacy boundary

Fog is a visual tabletop overlay, not an encryption or a secret-content DRM mechanism. A campaign member who has already downloaded a map image/video may inspect the underlying media outside the visual overlay. Do not embed unrevealed spoilers, hidden traps, undiscovered corridors, or secret enemy metadata in public map media. Use GM-only pins for secret content. Public tokens still exist in player-readable map documents; use private pins for unrevealed encounters.

GM-only private note documents are inaccessible to players, non-members, and suspended members under Firestore rules. The GM explicitly saves public fog state separately from private-pin changes. Players cannot update, reset, or create fog state. Existing map media access and publication rules remain unchanged.

## Boundaries and deployment

- Phase 6.2 is fog, notes, and ruler tools. Phase 6.3 will handle turn-based combat integration, synchronized character/creature movement, and encounter token automation.
- Dedicated GitHub workflow runs the Phase 6.1 and 6.2 model tests, Firestore/Storage emulator suite, existing dashboard/combat regressions, lint, and production build. Final full Firebase and website checks must pass against committed compiled assets before merge.
- After merge, run GitHub Actions → Deploy Firebase backend (manual), select main, operation deploy, confirmation DEPLOY-ASTERIA-PRODUCTION. This publishes updated Firestore permissions; website assets are published by the existing Pages workflow.

## Live acceptance

1. GM selects an existing looping video map, turns on fog, and paints a small revealed area. Video continues looping behind the overlay.
2. GM presses Save map settings; a linked player sees only the revealed area and visible public tokens.
3. GM hides and reveals more grid squares; saving updates the player's map without reload.
4. GM uses Show entire map preview, Reveal all, Hide all and Undo, then saves.
5. GM measures two points, confirms the grid-distance calculation and changes metres per square.
6. GM creates a private encounter pin and saves private notes. The player cannot read the pin or its text via Firestore.
7. Verify suspended/non-members cannot read either the map or private notes; no player can change fog.

## Final release gate

The production website bundle is generated and committed to this PR branch. Confirm the full Firebase and website checks, both Universal Check regression workflows, and the dedicated Phase 6.1/6.2 verification all succeed at the final source-and-bundle commit. Deploy only after the verified PR is merged into main.
