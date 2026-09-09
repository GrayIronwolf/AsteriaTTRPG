# Character ownership and GM access

## Root cause

Character Forge is still rendered by `js/asteria-gameplay-systems.js` alongside the React dashboards. The Firestore account query was scoped to `users/{uid}/characters`, but the client did not enforce the same ownership boundary:

- `data-sync.js` included the selected dashboard character and profile/account character IDs in its owned-character export, even when `ownerUid` belonged to someone else.
- React's `mirrorCharacterSnapshot` selected the viewed character as the account's personal character, including GM visits.
- `firebase-auth.js::saveCharacter` wrote any submitted character into the signed-in user's private collection and overwrote its `ownerUid`. This could create a mislabelled duplicate without changing the player's original private sheet.
- Forge and the workspace selectors trusted cached account lists and several legacy aliases. Edit/Delete callbacks had no independent owner check.

The production examples have not been read directly from Firestore in this workspace. These are confirmed code paths, not a claim that a particular production document has been inspected.

## Ownership and data access

`ownerUid === Firebase Auth UID` is the character ownership rule. A campaign's `ownerUid` describes the campaign owner, not the owners of its player characters.

Private sheets live at `users/{ownerUid}/characters/{sourceCharacterId}`. Linked live sheets live at `campaigns/{campaignId}/characters/{characterId}` and retain `ownerUid` and `sourceCharacterId`. Current linking uses the same character ID in both collections. Forge now queries only the current UID's private collection with `where('ownerUid', '==', uid)`.

On account load, linked private results are checked against their live campaign sheet's owner and source ID. Mislabelled or unverifiable copies are excluded from the owned-character cache; the console identifies excluded IDs. No cloud documents are deleted or reassigned. Cached account/profile arrays, selected characters, email aliases and GM permissions never establish ownership. Forge waits for the account ownership load before displaying cached characters.

Both autosave selection and Firebase save methods reject foreign ownership. Shared campaign data remains available separately for GM and party interfaces. Dashboard snapshot mirroring no longer selects somebody else's character as the account's personal character.

## GM access and navigation

GM authority remains campaign-specific: authenticated UID matches the campaign owner, `gmUids`, or a `roles[uid]` value of `gm`. The roster-to-dashboard workflow also checks that the live character's owner agrees with the campaign's stored link/character summary or player character list. Conflicting links are rejected.

The GM roster still opens linked player dashboards. Only that workflow records a return context in browser history. The Character Dashboard revalidates the UID, campaign, character and GM relationship before displaying **← Back to GM Dashboard**. The return restores campaign, GM tab, selected player and scroll position. Normal owner navigation clears previous GM visit context; account changes and revoked GM roles cannot reuse it.

A GM visit to a player's dashboard is read-only for player resource controls, inventory, rewards, gallery and settings. Existing GM management tools retain their campaign editing authority. Forge edit, delete, colour and open callbacks independently reject another owner's character. Existing Forge deletion remains a local card/link operation; this change does not introduce permanent cloud deletion.

## Security rules and backend

Firestore changes:

- Private character create/update requires the signed-in path owner and matching `ownerUid`. When a referenced live sheet exists, a private mirror must agree with its owner/source ID.
- The general recursive user-data rule explicitly excludes the character collection so it cannot override these checks.
- GM updates to live campaign characters preserve `ownerUid`, `sourceCharacterId` and document `id`.
- Private reads/deletes remain restricted to the account path owner. A GM cannot access another user's private collection. Campaign-scoped reads still require actual campaign membership. The existing separate GM ability to remove a campaign sheet is retained; it does not delete a player's private sheet.

`asteriaAction` already verifies campaign membership and the live sheet's canonical `ownerUid` inside a transaction. A GM cannot use it to impersonate a different player. No Function changes are needed. Firebase initialization, project/region, authentication providers, Storage rules and deployment configuration are unchanged.

No composite index changes are required: the private owner query is a single-field equality query in an account-scoped collection. Existing Live Sync event indexes are unchanged.

## Legacy records and rollout

- Correctly owned current records need no migration.
- Existing duplicate private mirrors are quarantined on load, not deleted. Their original linked sheets remain accessible through the GM workflow.
- Records missing `ownerUid`, using only aliases, with conflicting source IDs, or whose linked campaign can no longer be verified require an explicit administrative review. They are not automatically claimed by the current viewer. In particular, a formerly linked owner sheet can be quarantined if campaign access was revoked; preserve the record and verify its ownership/link before repairing it.
- Any later repair must back up records, verify the original private owner and live link, then update only confirmed records. Do not infer ownership from names, campaign ownership or the account currently viewing the sheet. No production migration was performed here.

Deploy the updated `firestore.rules` to `asteria-ttrpg`, publish the matching frontend through the existing GitHub Pages process, and refresh both GM and player browsers. No Functions, Storage or index redeployment is needed for this patch. Review active old clients during rollout: obsolete clients attempting a foreign save will now receive a denial.

## Validation

`npm test` includes the ownership tests, actual Forge callback rejection, Firebase save rejection, contaminated-cache reconciliation, navigation state, rendered React access controls and autosave/listener regressions. `npm run test:firebase` uses disposable Auth/Firestore/Storage emulators and verifies private queries, cross-account isolation, legitimate GM campaign access, owner edit/delete, GM identity preservation and authenticated gameplay updates. `npm run build` produces the committed Pages assets.

Emulator and component results do not constitute an authenticated production browser test. After rollout, use separate GM/player test accounts to open the same campaign, confirm Forge ownership, open/return from a linked dashboard, change HP as the player and verify the GM sees the snapshot update.
