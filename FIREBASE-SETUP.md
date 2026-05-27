# Asteria Firebase Setup

This build uses one Firebase Authentication account for every user. GM and Player permissions are not separate account types; campaign permissions are stored on each campaign.

## 1. Enable Authentication

1. Open Firebase Console.
2. Select the Asteria project.
3. Go to Authentication.
4. Enable Email/Password sign-in.
5. Add the deployed website domain to Authentication > Settings > Authorized domains.

## 2. Firestore Collections

The website writes these records:

- `users/{uid}` account profile and character list.
- `users/{uid}/characters/{characterId}` owned character records.
- `users/{uid}/campaigns/{campaignId}` campaigns created by that user.
- `campaigns/{campaignId}` shared campaign records for future invite/join workflows.
- `usernames/{usernameLower}` username-to-email lookup records.

## 3. Campaign Permissions

Creating a campaign stores the shared campaign document as `campaigns/{campaignId}` and includes:

- `gmId`
- `ownerUid`
- `gmUids: [uid]`
- `roles: { uid: "gm" }`
- `players`
- `characters`
- `chat`
- `guildBank`
- `settings`
- `inviteCode`
- `inviteLink`

A user can be GM for one campaign and a player in another using the same account.

The campaign object is shaped for this future structure:

```txt
campaigns/
  campaignId/
    gmId
    players
    characters
    chat
    guildBank
    settings
```

## 4. Suggested Firestore Rules Starter

Review before production, but this is a useful local starting point:

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function signedIn() {
      return request.auth != null;
    }

    function isOwner(uid) {
      return signedIn() && request.auth.uid == uid;
    }

    match /users/{uid} {
      allow read, write: if isOwner(uid);

      match /characters/{characterId} {
        allow read, write: if isOwner(uid);
      }

      match /campaigns/{campaignId} {
        allow read, write: if isOwner(uid);
      }

      match /settings/{docId} {
        allow read, write: if isOwner(uid);
      }
    }

    match /usernames/{username} {
      allow read: if true;
      allow create: if signedIn();
      allow update, delete: if false;
    }

    match /campaigns/{campaignId} {
      allow read: if signedIn();
      allow create: if signedIn() && request.resource.data.ownerUid == request.auth.uid;
      allow update, delete: if signedIn() &&
        (resource.data.ownerUid == request.auth.uid ||
         request.auth.uid in resource.data.gmUids);
    }
  }
}
```

## 5. Website Config

Firebase config lives in `js/firebase-auth.js`. If you create a new Firebase project later, replace the `firebaseConfig` object there and keep the rest of the auth module intact.
