# Digital GM Phase 6.3 — Live Combat Maps

## Implemented

- GM Dashboard Battle Maps can link an active encounter to a specific map after the existing combat system starts.
- The active encounter's `combatId` and authoritative combatant IDs bind map tokens, rather than inventing a second initiative or combat engine.
- Linking automatically creates creature and player combat tokens. Existing linked-character markers retain their map positions. Subsequent encounter roster updates automatically add/remove matching combat tokens. Map positions are shared by the existing Firestore map listener.
- GM and player map viewers highlight the current initiative actor, show round/current turn, and display combatant markers over static/looping video maps with fog-of-war still applied.
- The GM selects a combatant and clicks a destination. An atomic existing `combatCommand` transaction validates that the combat is active, actor belongs to this encounter, the current turn is correct, and an approved movement action has positive remaining distance. The same transaction deducts travelled metres from the combat action's movement budget and saves the token position.
- GM-only reposition mode requires an audited reason for forced movement or correction. This does not invent AP costs or alter character resource totals.
- End/clear combat unlinks the scene, clears combat-bound tokens, and retains manual markers and previous map media.
- A linked map's combat-owned tokens cannot be modified or deleted directly through normal client Firestore writes. Active combat maps cannot be deleted until combat ends. Existing secure map privacy and private GM annotations are preserved.

## Movement interaction

1. Begin an encounter via GM Main → Campaign Encounters and confirm initiative is established.
2. Open GM Dashboard → Battle Maps and select the scene. Click **Link active combat to this map**.
3. Select the character or creature in the encounter roster. If the current participant has already declared and resolved a movement action, the GM may choose **Approved movement action**, then click a destination grid square.
4. The backend checks movement distance against the remaining approved metres and updates the encounter and map atomically. After the turn advances in the existing combat panel, the current-turn highlight updates automatically.
5. If correcting a forced or accidental placement, switch to **GM correction / reposition**, enter the reason, and click the destination. A separate audit entry is appended to combat history.

## Scope and constraints

- Phase 6.3 reuses the established AP and GM adjudication mechanism, including source-specific movement distances. It does not silently approve movement, allow players to bypass GM moderation, or introduce new independent rolls.
- Existing fog is a visual layer: linked combat markers stored on published maps remain client-readable even if visually covered by fog. Keep secret creatures GM-only until revealed, and do not upload maps containing unrevealed spoilers.
- A maximum of 60 total map tokens (including manual markers) applies. Reduce unused tokens before linking an exceptionally large encounter.
- Movement uses straight-line Euclidean grid distance multiplied by configured metres per square. The GM adjudicates obstacles, elevation, terrain, opportunity attacks and nonstandard movement before approving the action.
- A map may be bound to only one currently active encounter. End combat before starting and binding a new encounter to that map.

## Verification and deployment

- Dedicated Phase 6.3 workflow executes all Phase 6.1/6.2/6.3 model and Firestore/Storage emulator tests plus lint, dashboard/combat regressions and the React production build.
- Publish the verified `react-dist` bundle on the PR branch, then confirm the final full Firebase/website checks and both Universal Check regression checks pass before merging.
- Once merged, run GitHub Actions → Deploy Firebase backend (manual) on `main` with operation `deploy`, confirmation `DEPLOY-ASTERIA-PRODUCTION`. Confirm the separate GitHub Pages publishing workflow succeeds.

## Live acceptance

1. Start a GM encounter with two PCs and an enemy, then link an existing looping MP4 battle map.
2. Verify player and enemy tokens appear with initiative/current-turn highlights in both GM and player maps.
3. Confirm a movement action is declared, GM-approved with a distance, resolved, and then execute a valid GM map move. Confirm the remaining distance decreases and the player sees the new position.
4. Attempt a move for a noncurrent participant, an unauthorized player, and a move longer than the remaining budget. All must be rejected.
5. Test a forced move with a recorded GM correction reason and verify it appears in the combat history.
6. Advance initiative and confirm the highlight follows the live encounter, then end combat and verify token cleanup while private notes and static markers persist.
