# Digital GM Phase 10.1 — Player-Facing Display

## Scope

Phase 10.1 introduces a dedicated, fullscreen-ready player presentation route for a separate monitor, TV, or projector, and a GM-only scene controller in **GM Dashboard → Player Display**.

The authenticated route is `#/react/presentation/{campaignId}`. Only current campaign members may view the server-maintained projection. GM controls live at `campaigns/{campaignId}/presentationControl/current`; players read only `presentationShared/current`. Both records are written exclusively through a trusted GM action, never directly from the browser.

## Scenes

- **Blackout:** immediate black screen with no previously displayed content.
- **Title and announcement:** manually entered GM-approved heading and caption.
- **Battle map:** an already published player-visible battle map, including image or silent looping video, fog, and published tokens.
- **World atlas:** an already published player-visible world atlas with permitted markers and routes.
- **Combat status:** round and current player turn, with secret enemy names, abilities and statistics omitted.
- **Party:** GM-selected campaign characters, names, classes and levels, with optional HP.

Map presentation selection is validated by the server: drafts or unpublished maps cannot be selected. A second screen updates whenever the GM saves a new approved scene.

## Security limitations

- The projector **does not offer anonymous/public sharing**. Sign in to a campaign member account in the viewing browser.
- The display reads only a server-maintained allowlisted scene projection. Private GM notes, hidden encounters, raw character inventories and private NPC data are never embedded in scene-control documents.
- Projected battle maps use the published player-safe map view without a raw encounter object; combat display intentionally hides enemy identities.
- A GM must explicitly select and publish a scene. Existing presentation displays can be blacked out immediately. If an underlying map is withdrawn, it disappears rather than falling back to a different map.
- Character HP is optional. Any character data used for the party scene is deliberately limited to approved fields.
- Projectors may show cached pixels briefly while reconnecting; sign out of shared displays when not in use.

## GM acceptance checklist

1. Open **GM Dashboard → Player Display**, then open the second-screen route and sign in as an active campaign member.
2. Select a title scene. Confirm it updates automatically on the second screen.
3. Test an announcement and blackout. Confirm title and caption disappear after blackout.
4. Publish an image battle map and a looping-video battle map, then display both. Confirm fog and published tokens render without GM-only notes.
5. Unpublish a selected map. Confirm that presentation does not switch to another map and no private media is loaded.
6. Publish a world atlas. Verify only public markers and routes appear.
7. Start combat. Verify the current player turn and optional round appear, without private enemy names or HP.
8. Select player characters and optionally reveal HP; confirm no inventory, secret equipment, spellbook or GM notes appear.
9. Revoke an account's membership and confirm that it loses presentation Firestore access.
10. Verify fullscreen on desktop/TV and responsive fallback on mobile.

## Deployment plan

As requested, **defer production deployment until Phases 10.1, 10.2 and 10.3 are all complete and merged**. Each phase is independently implemented, tested and merged to main. The final manual Firebase backend workflow deploys Functions and Firestore rules. The website frontend/hosting may require its existing separate publication workflow. No new credentials, servers, third-party services or migration are required.

## CI

Run `Digital GM Phase 10.1 — Player-Facing Display`. This verifies presentation unit tests, Firestore emulator access, prior Digital GM regressions, lint, dashboard tests and the React production build; the push workflow also publishes the verified compiled website assets into the branch before merge.

