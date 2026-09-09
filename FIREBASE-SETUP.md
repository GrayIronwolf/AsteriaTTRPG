# Asteria Firebase setup

This version adds authenticated Cloud Functions for player gameplay and campaign invitations. **Deploy the backend and indexes before releasing this frontend. Do not merge this PR into an automatically published website until the production rollout is ready.** Repository changes do not change deployed Firebase rules.

## Local development without production access

Use Node.js 22 and Java 21, then:

```sh
npm ci
npm run emulators
```

In another terminal run `npm run dev`. Localhost, including a locally served static build, defaults to the `demo-asteria` emulators: Auth 9099, Firestore 8080, Storage 9199, Functions 5001. The Emulator UI is at `http://127.0.0.1:4000`. Create disposable accounts and campaigns there. No production credentials are needed. The existing `?reactFixture=1` mode remains an offline UI fixture; it does not test Firebase.

`.firebaserc` defaults to `demo-asteria`; `production` aliases `asteria-ttrpg`. `.env.example` documents `VITE_FIREBASE_MODE=emulator`. An explicit local `VITE_FIREBASE_MODE=production` opts into the real project when running Vite. Public static hosting uses the public production configuration in `js/firebase-auth.js`. Native static modules do not load `.env` files. Never put secrets in `VITE_` variables: they are browser-visible.

```sh
npm test
node scripts/test-xp-realtime-sync.js
node --test scripts/data-sync-regression.test.mjs
npm run test:firebase
npm run build
```

The Firebase suite uses disposable Auth, Firestore and Storage emulators. It exercises the real callable handler over local HTTP, including Firebase Auth token verification, without requiring the Functions emulator's Unix socket transport. The full Functions emulator remains configured for local development. No test uses the production project. Emulator tests do not establish whether production indexes have finished building.

## Architecture and trust

`js/firebase-auth.js` initializes the browser SDK once and exposes `window.AsteriaFirebase`. React uses `src/firebase/asteriaFirebaseService.js` and `src/sessions/useCampaignLiveData.js`. Players call `asteriaAction` for live resources, progression, inventory, shops, trades, rewards, rests and organizations. `functions/handler.mjs` checks authenticated membership, canonical ownership, input boundaries and request IDs inside transactions. `functions/commands.mjs` is the canonical implementation of those mutations and reuses the existing model code. `asteriaInvite` checks the supplied invitation code and returns a limited preview before membership is granted.

GM-authorized commands continue to use Firestore transactions governed by GM rules. Player cosmetic edits, party notes and chat use narrowly scoped rules. GM notes are in `campaigns/{id}/systems/gmWorkspace` and are GM-only. Rules deny direct player progression and shared trade writes; there is no permissive fallback when Functions are unavailable.

Asteria remains a cooperative TTRPG: owners import their initial sheet and can report their own resource changes, skill successes, currency adjustments and rests during an active session. These are not GM approval workflows or anti-cheat guarantees. Race and class changes after linking require a GM. Unknown talent/spell metadata must be corrected rather than accepted from a submitted payload. Older legacy dashboards cannot bypass the new live-state rules; use React for live gameplay.

## Production rollout — project owner action required

The current website is served independently of Firebase Hosting. This configuration deliberately does not introduce Firebase Hosting or change DNS.

1. Confirm the correct project is `asteria-ttrpg`; inspect Firestore Usage, billing, Authentication providers/authorized domains, and the deployed rule/index versions. Cloud Functions deployment requires the project's applicable billing/APIs and IAM setup. Set billing alerts; these do not enforce a spending cap.
2. Enable Email/Password authentication if not already enabled. Authorize `asteriattrpg.com` and only the other domains actually used. Login now uses email addresses. Usernames remain display names; the application no longer publishes an email lookup directory or guarantees globally unique display names. Existing Auth accounts do not need new passwords.
3. Back up Firestore through the project's authorized administrative workflow. Inspect existing character `ownerUid`/`sourceCharacterId` values and campaign membership. Do not bulk overwrite or infer missing owners from a browser's private character copy.
4. With authorized Firebase CLI access, deploy Functions first: `npx firebase deploy --project asteria-ttrpg --only functions`. This packages the shared server model code from the repository root. Functions use managed application credentials, not committed keys.
5. Deploy indexes: `npx firebase deploy --project asteria-ttrpg --only firestore:indexes`. Wait until both `events` indexes are ready. The new queries use target owner + creation time and target owner + acknowledgement status.
6. Coordinate a maintenance window for the rule and frontend change. Deploy `firestore:rules,storage` explicitly to `asteria-ttrpg`, then release the tested frontend through the website's existing deployment process. Older player clients will lose direct gameplay write access as soon as the rules tighten. Refresh both GM and player browsers.
7. Verify with two disposable production test accounts: invitation, character linking, start/pause/end session, resource change, GM XP, loot, shop purchase, item exchange, chat, gallery, reconnect, and logout. Remove only the test data you created.
8. Inspect existing `usernames` documents containing emails and delete/sanitize them through an authorized admin session. New rules block public/other-user reads, but cannot retract data that was previously downloaded. Similarly, existing Storage download-token URLs remain bearer links; rules do not revoke those tokens. Review exposed media URLs separately if needed.

Do not deploy earlier permissive rules to make a failed write pass. If rollout fails, pause live play and diagnose the specific error. Roll back to a reviewed compatible frontend/backend pair without reopening cross-account writes.

## GitHub and Codex

Keep browser configuration (public Firebase web API key/project IDs), source, Functions, rules, indexes, emulator configuration, `.env.example`, package lock, tests and workflows in GitHub. The web API key identifies the project; authorization comes from Auth/rules/server checks. It is not an Admin key.

Never commit service-account JSON, Firebase CLI refresh tokens, application-default credential files, private keys, passwords, `.env` files, emulator exports containing real users, or downloaded user data. `.gitignore` and the Functions deployment ignore list protect common names; they cannot detect every arbitrarily named secret. Review `git diff --cached` and enable GitHub secret scanning/push protection if available. If an actual private credential is ever found in history, revoke/rotate it first, review its use, then clean history with repository-owner coordination. Removing a file alone does not revoke its credential.

The checks workflow needs no Firebase secrets. For deployment, configure Workload Identity Federation bound to this repository and the protected `firebase-production` GitHub environment; restrict it to the intended branch/environment. Add environment **variables** `FIREBASE_WORKLOAD_IDENTITY_PROVIDER` and `FIREBASE_DEPLOY_SERVICE_ACCOUNT` (resource identifiers, not private keys). Assign the deployment identity only the IAM roles needed for Functions/rules/index deployment and service-account use; avoid Owner/Editor. Configure required reviewers and deployment branch restrictions in GitHub. The manual workflow cannot create those protections itself.

Use GitHub Actions Secrets or Google Secret Manager only for genuine server secrets introduced later. Prefer workload federation over long-lived JSON keys. Local administrative work should use secure CLI sign-in/Application Default Credentials outside the repository. Codex should work on branches with demo emulators, tests and PR review. GitHub repository access alone does not grant Firebase Console, billing or deployment access. Do not give Codex production Admin credentials merely to edit frontend code.

References: [Firebase emulator projects](https://firebase.google.com/docs/emulator-suite/connect_and_prototype), [Google GitHub authentication action](https://github.com/google-github-actions/auth), [Application Default Credentials](https://cloud.google.com/docs/authentication/application-default-credentials).
