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
- `campaigns/{campaignId}/characters/{characterId}` stores the campaign-visible character dashboard snapshot used by the GM roster and player viewer.
- `campaignInvites/{ucn}` stores the active 12-digit UCN lookup record.
- `users/{uid}/campaigns/{campaignId}` stores that account's campaign copy.
- `users/{uid}/characters/{characterId}` stores an owned character.
- `users/{uid}/settings/appState` stores account workspace state.
- `usernames/{usernameLower}` supports username login lookup.

When a GM creates or saves a campaign, the website creates both the shared campaign document and its `campaignInvites/{ucn}` record. A player joining by UCN is added as a player while `ownerUid` remains unchanged.

When a player links a character, Asteria adds the character ID to the shared campaign party and writes its current sheet to the shared character subcollection. Later HP, SP, MP, XP, condition, and character-sheet saves update that same campaign snapshot. The GM client refreshes shared campaign data when the campaign dashboard opens and when the browser regains focus.

## Testing UCN Join

1. Sign in with a real Firebase account and create a campaign.
2. Wait for the cloud-save confirmation, then copy the 12-digit UCN.
3. Sign out and sign in with a different real Firebase account.
4. Open Campaign Forge, enter the UCN, and choose Join Campaign.
5. Link an existing character or forge a new character for that campaign.
6. Return to the GM account and reopen the campaign card. The linked character should appear with resource bars; double-click it to open the GM character view.

Campaigns created before this update gain their UCN lookup record the next time their GM signs in and the campaign is saved. Opening Campaign Forge and making any saved campaign change will trigger that migration.

## Security Model

- Users can read and write only their own account data.
- Campaign owners can update or delete their shared campaign.
- Authenticated users with an active UCN can add only themselves as a player.
- Campaign members can link only characters owned by their own account.
- Campaign members can read linked character snapshots; players can update only their own snapshots, while the campaign GM can update campaign-linked snapshots through GM controls.
- A joining player cannot replace the campaign `ownerUid` or grant themselves GM access.

Firebase config remains in `js/firebase-auth.js`. Replace that object only if Asteria moves to a different Firebase project.
