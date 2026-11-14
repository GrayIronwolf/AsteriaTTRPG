# Digital GM Toolkit — Phase 8.3 Interactive World Map

## Completed functionality

- Separate **Interactive World Atlas** in the GM Dashboard and a **World Map** tab for linked players.
- Private world-map image uploads: PNG/JPG/WEBP/GIF, up to 8 MB and 8192 px per dimension, 24 active atlases/campaign.
- Image-backed zoomable map with markers positioned by image-relative percentages, 50–400% zoom, scroll-to-navigate, and route overlays.
- Up to 100 locations/pins, with type, title, description, position, private or player-visible designation, and optional GM-only reference IDs.
- Up to 50 routes between real pins, with GM-defined advisory travel days; routes involving GM-private pins are automatically excluded from published player projection.
- Explicit **save, publish, withdraw, archive** and optimistic revision checks. Uploads start as private drafts.
- Player reads receive only a separate allowlisted map document containing public pins and routes, never source record IDs, hidden markers, GM notes or actor IDs.
- Firebase Storage authenticated `getBlob` only. The underlying published image is readable to campaign members, but draft images are GM-only. No public download URL is generated.
- The map view reads campaign date from Phase 8.1 and approved regional forecast from Phase 8.2. This does not advance time or invent travel costs or weather mechanics.
- Existing Battle Maps, Combat Command, NPCs, world state and campaign journals remain separate and unchanged.

## Important map-security boundary

Published players can inspect the **image pixels themselves**. Never bake undiscovered settlements or secret routes into a player-visible image; hide those as GM-only pins on a player-safe base image. Editing the visible overlays cannot conceal secrets already in image bytes.

## Release verification

- `npm run test:world-atlas`: model, public projection allowlist, location/route validation, GM action and UI wiring.
- Firestore/Storage emulator tests: GM/private/published roles, image read revocation, create-only media uploads and protected map collections.
- Phase 6–8 regressions, dashboard/combat tests, lint, full Firebase integration, production React build and checked-in generated bundle consistency.

## Single consolidated Firebase deployment after Phase 8

Once PR 8.3 has merged and all checks pass, deploy **once**, from latest `main`:
1. Open GitHub → Actions → **Deploy Firebase backend (manual)**.
2. Choose `main`, operation `deploy`, confirmation `DEPLOY-ASTERIA-PRODUCTION`.
3. Run the manual production workflow, then confirm Firestore and Storage rules deployment as well as callable backend success.
4. Verify Phase 8.1 calendar, Phase 8.2 private and shared forecast, and Phase 8.3 atlas upload, publishing and player permissions.

The frontend may publish automatically between merges; backend features require this final manual deployment.

## Acceptance

Upload a draft image; create a public settlement and private ruins, a public two-town road and a secret ruins route. Preview privately, publish and verify the player sees only the settlement and public road, while the image itself is player-safe. Withdraw and verify player document and image bytes are denied by security rules.
