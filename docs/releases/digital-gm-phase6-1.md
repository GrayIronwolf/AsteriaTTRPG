# Digital GM Toolkit — Phase 6.1: Battle Maps and Looping Video

## Delivered

- Dedicated **GM Dashboard → Battle Maps** manager and **Character Dashboard → Battle Maps** player tab.
- Upload a static PNG, JPG, WEBP or GIF (up to 8 MiB) or a moving MP4/WebM scene (up to 48 MiB). Videos render muted, inline, continuously looping with play/pause control and a manual restart option for blocked autoplay.
- Firebase Storage stores the asset at a unique immutable scene UUID. Firestore holds campaign-scoped metadata, name, description, path, dimensions, grid, sharing and manual marker placement. Newly uploaded maps are GM-only by default.
- GM controls grid rows/columns (1–80), opacity, grid visibility and player/creature/marker tokens. Click the map to position a selected token; placement snaps to the grid when visible. Explicit Save is required.
- Player view uses a real-time Firestore query of published scenes only. No player editing or uploading.
- Browser preview reads authenticated Firebase Storage blobs and creates temporary local browser object URLs; no public Firebase download tokens are generated.

## Scope boundaries

- Phase 6.1 is the map manager/media foundation, not a full multiplayer VTT.
- Phase 6.2 adds fog of war, private annotations and distance tools. In Phase 6.1 every saved marker on a shared map is player-visible.
- Phase 6.3 adds turn-by-turn combat token movement and synchronization.
- Media is not transcoded. For best browser support, encode MP4 with H.264 video. Keep videos short and optimized: up to 48 MiB must be downloaded before playback.
- In-session local blobs may remain visible to someone who already loaded the media until their view unmounts. Revoking campaign membership or map visibility prevents new authenticated reads, not erasure of their local copy.

## Security

- Map documents: campaigns/{campaignId}/battleMaps/{mapId}. Firestore read to GM, or to campaign members when visibility is explicitly set to players; player list queries filter visibility.
- Media path: campaigns/{campaignId}/battleMaps/{mapId}/scene.{png,jpg,webp,gif,mp4,webm}. Storage get requires GM or active campaign membership and a published Firestore document. Storage create and delete are GM-only, MIME and size bounded, and update is disallowed.
- Existing v1/v2 campaign GM/member rules are reused; no new Firebase Function or external video service.

## Verification and deployment

- The branch verification workflow runs model and dashboard tests, Firebase Firestore/Storage emulator permission tests, lint, dashboard/combat regressions and production React build, then checks in generated react-dist assets.
- The full Firebase and website checks must pass on the final committed branch head before PR merge.
- After merging, go to GitHub Actions → Deploy Firebase backend (manual) → branch main → operation deploy → confirmation DEPLOY-ASTERIA-PRODUCTION, then Run workflow.
- Confirm the separate GitHub Pages website publication succeeds on the merge commit. The backend workflow does not publish the website.

## Live acceptance tests

1. GM uploads a PNG map and a short MP4 map and checks the video loops silently.
2. GM configures rows/columns, adds a linked character and creature marker, clicks to position them and saves.
3. Player cannot read or see either unpublished map.
4. GM publishes the animated map. Player sees the same video, grid and markers in Battle Maps.
5. GM makes it private again. Player map disappears, and new authenticated downloads are denied.
6. Confirm a non-GM cannot upload/replace/delete scenes or view private maps.

## Release gate

The tracked website bundle is built and committed on this PR branch. Verify the full Firebase and website workflow against the latest branch head after the bundle commit, then mark the PR ready and merge only if all checks are green.
