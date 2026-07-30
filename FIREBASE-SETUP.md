# Asteria Firebase Setup

Asteria uses one Firebase Authentication account per user. GM and Player are campaign roles, not separate account types.

## Required Firebase Features

1. In Firebase Console, select the `asteria-ttrpg` project.
2. Under Authentication, enable Email/Password sign-in.
3. Under Authentication > Settings > Authorized domains, add the deployed website domain and local test domains you use.
4. Create a Cloud Firestore database if the project does not already have one.
5. Publish the included `firestore.rules` before testing cross-account UCN joins.

The Test Login is browser-only. It cannot create or join campaigns across separate accounts or devices. Use two real Firebase accounts for UCN testing.

## Publish Firestore Rules

### Firebase Console

1. Open Firestore Database > Rules.
2. Replace the current rules with the contents of `firestore.rules`.
3. Click Publish.

### Firebase CLI

From the website folder:

```powershell
firebase login
firebase use asteria-ttrpg
firebase deploy --only firestore:rules
```

The included `.firebaserc`, `firebase.json`, and `firestore.indexes.json` already point the CLI at the Asteria project. No custom Firestore index is needed because UCNs are direct document IDs.

## Campaign Collections

- `campaigns/{campaignId}` stores the shared campaign.
- `campaigns/{campaignId}.characters[characterId]` stores the campaign-visible roster and dashboard summary used by the GM immediately after a player links a character.
- `campaigns/{campaignId}/characters/{characterId}` stores the optional full character-sheet snapshot used for live sheet hydration.
- `campaigns/{campaignId}/systems/itemEcosystem` stores shared party loot, loot tables, shops, direct trades, marketplace listings, shared storage, settings, and the item audit log.
- `campaigns/{campaignId}/systems/progression` is the authoritative real-time XP, level, CP, TP, and player-notification stream. Deploy the included `firestore.rules` before testing GM-to-player XP delivery on separate accounts or devices.
- `campaignInvites/{ucn}` stores the active 12-digit UCN lookup record.
- `users/{uid}/campaigns/{campaignId}` stores that account's campaign copy.
- `users/{uid}/characters/{characterId}` stores an owned character.
- `users/{uid}/settings/appState` stores account workspace state.
- `usernames/{usernameLower}` supports username login lookup.

When a GM creates or saves a campaign, the website creates both the shared campaign document and its `campaignInvites/{ucn}` record. A player joining by UCN is added as a player while `ownerUid` remains unchanged.

When a player links a character, Asteria first commits the member, character ID, owner link, and a sanitized dashboard summary directly to the shared campaign document. The optional full-sheet subcollection is written afterwards, so a missing or older subcollection rule can no longer leave the GM with an empty roster after the join appeared successful. Later HP, SP, MP, XP, condition, and character-sheet saves refresh the shared snapshot. The GM client refreshes authoritative campaign data when the campaign dashboard opens and when the browser regains focus.

Characters linked by an older build are repaired automatically the next time that player signs in to this updated build. Asteria compares the player's private campaign copy and saved character campaign name, then backfills the shared party, player membership, owner link, and character summary. After that repair, the GM can reopen or refresh the campaign dashboard.

The item ecosystem uses a dedicated real-time campaign system document. This is the canonical campaign-wide record for Need/Greed/Pass responses, shop stock, trade offers, listings, loot tables, and the audit log. It is not a second item database: item definitions still come from the Asteria Item Compendium, while character-owned item instances remain on character records.

## Testing UCN Join

1. Sign in with a real Firebase account and create a campaign.
2. Wait for the cloud-save confirmation, then copy the 12-digit UCN.
3. Sign out and sign in with a different real Firebase account.
4. Open Campaign Forge, enter the UCN, and choose Join Campaign.
5. Link an existing character or forge a new character for that campaign.
6. Return to the GM account and reopen the campaign card. The linked character should appear with HP, SP, MP, and XP bars; double-click it to open the full Character Dashboard.

Campaigns created before this update gain their UCN lookup record the next time their GM signs in and the campaign is saved. Opening Campaign Forge and making any saved campaign change will trigger that migration.

## Security Model

- Users can read and write only their own account data.
- Campaign owners can update or delete their shared campaign.
- Authenticated users with an active UCN can add only themselves as a player.
- Campaign members can link only characters owned by their own account.
- Campaign members can read linked character snapshots; players can update only their own snapshots, while the campaign GM can update campaign-linked snapshots through GM controls.
- Campaign members can read and update the shared item ecosystem used by multiplayer loot, shops, storage, and trade workflows. GM-only controls remain hidden and permission-checked by the application.
- A joining player cannot replace the campaign `ownerUid` or grant themselves GM access.

For a public production release, route high-value marketplace settlement and GM-only stock mutations through trusted Cloud Functions or another server authority. The current static build validates roles in the application, restricts the shared document to campaign members, and records every mutation in the campaign audit log.

Firebase config remains in `js/firebase-auth.js`. Replace that object only if Asteria moves to a different Firebase project.
