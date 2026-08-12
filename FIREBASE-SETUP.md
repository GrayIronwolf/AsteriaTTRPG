# Asteria Firebase Setup

Asteria uses one Firebase Authentication account per user. GM and Player are campaign roles, not separate account types.

## Required Firebase Features

1. In Firebase Console, select the `asteria-ttrpg` project.
2. Under Authentication, enable Email/Password sign-in.
3. Under Authentication > Settings > Authorized domains, add the deployed website domain and local test domains you use.
4. Create a Cloud Firestore database if the project does not already have one.
5. Publish the included `firestore.rules` before testing cross-account UCN joins, XP awards, or item rewards.

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
- `campaigns/{campaignId}/characters/{characterId}` is the canonical live character record used for XP, levels, resources, dashboard notices, inventory rewards, and full-sheet hydration.
- `campaigns/{campaignId}/liveSession/current` stores the active, paused, or ended live-session pointer.
- `campaigns/{campaignId}/sessions/{sessionId}` stores preserved session state and timestamps.
- `campaigns/{campaignId}/sessions/{sessionId}/presence/{uid}` stores lightweight online/away presence for connected GM and Character dashboards.
- `campaigns/{campaignId}/events/{eventId}` is the single campaign event stream for XP, loot, resources, notifications, and session lifecycle events. Gameplay rewards and mutations require an active live session.
- `campaigns/{campaignId}/systems/party-workspace` stores the shared party notes and campaign quest workspace.
- `campaigns/{campaignId}/partyChat/{messageId}` stores the live party chat stream for campaign members.
- `campaigns/{campaignId}/systems/itemEcosystem` stores shared party loot, loot tables, shops, direct trades, marketplace listings, shared storage, settings, and the item audit log.
- `campaignInvites/{ucn}` stores the active 12-digit UCN lookup record.
- `users/{uid}/campaigns/{campaignId}` stores that account's campaign copy.
- `users/{uid}/characters/{characterId}` stores an owned character.
- `users/{uid}/settings/appState` stores account workspace state.
- `usernames/{usernameLower}` supports username login lookup.

When a GM creates or saves a campaign, the website creates both the shared campaign document and its `campaignInvites/{ucn}` record. A player joining by UCN is added as a player while `ownerUid` remains unchanged.

When a player links a character, Asteria commits the member, character ID, owner link, and dashboard summary to the shared campaign, then writes the full record to `campaigns/{campaignId}/characters/{characterId}`. All live XP and direct item-reward updates use that same character document. The player subscribes to it through both campaign membership and the character's saved campaign links, so a stale account workspace cannot prevent delivery.

The older `campaigns/{campaignId}/systems/progression` document is no longer part of the active sync path. Keeping XP, notices, resources, and inventory on the same canonical character stream prevents late autosaves from racing a second progression system.

The React milestone does not initialize another Firebase application. `src/firebase/asteriaFirebaseService.js` adapts the existing `window.AsteriaFirebase` singleton from `js/firebase-auth.js`. XP, loot, resources, encounter state, and magic reward resolution use the shared Firebase service; React components contain no raw Firestore calls. Deploy the included rules so only the campaign GM can write `campaigns/{campaignId}/systems/encounter`, while campaign members can read it and targeted players can accept or decline their own reward events.

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

## Testing Live XP And Item Delivery

1. Publish the included `firestore.rules`.
2. Refresh the website on both the GM and player devices so both load the current cache-busted scripts.
3. Open the linked campaign on the GM account and the linked Character Dashboard on the player account.
4. Apply an XP award. The GM success message must say the XP was delivered to the live player dashboards.
5. Confirm the player's XP bar and notification update without refreshing.
6. Send a direct item reward. The GM success message must say the reward was delivered, and the player's reward window should open without refreshing.
7. Accept, equip, or decline the reward. Refresh the Character Dashboard and confirm that the resolved popup does not return.
8. Start a live session and confirm that both dashboards show the same active session, countdown, and online presence.
9. End the session and confirm CP, TP, spells, resources, inventory, shops, trades, quests, journal, party notes, and chat controls are locked.
10. Leave a test session active and confirm it becomes read-only when its 10-hour limit is reached.

If Firebase rejects a listener or write, Asteria now shows `Cloud delivery blocked by Firestore rules` instead of reporting a false delivery. Re-publish `firestore.rules`, then refresh both devices.

## Security Model

- Users can read and write only their own account data.
- Campaign owners can update or delete their shared campaign.
- Authenticated users with an active UCN can add only themselves as a player.
- Campaign members can link only characters owned by their own account.
- Campaign members can read linked character snapshots; players can update only their own snapshots, while the campaign GM can update campaign-linked snapshots through GM controls.
- Campaign members can read live-session and presence records. Only campaign GMs can start, pause, resume, or end sessions.
- Live sessions have a fixed 10-hour wall-clock expiry. The Character Dashboard derives its lock from the shared session record, and an expired session is finalized when a GM dashboard is connected.
- Campaign GMs create campaign events. Target players can read only events addressed to their own Firebase UID and may update only acknowledgement/resolution fields.
- Campaign members can read and update the shared item ecosystem used by multiplayer loot, shops, storage, and trade workflows. GM-only controls remain hidden and permission-checked by the application.
- A joining player cannot replace the campaign `ownerUid` or grant themselves GM access.

For a public production release, route high-value marketplace settlement and GM-only stock mutations through trusted Cloud Functions or another server authority. The current static build validates roles in the application, restricts the shared document to campaign members, and records every mutation in the campaign audit log.

Firebase config remains in `js/firebase-auth.js`. Replace that object only if Asteria moves to a different Firebase project.
