# Asteria Friends — Phase 1 production activation / two-account canary

**Status:** Proposed controlled release. Existing `asteriaFriendAccountLookup` has been created successfully in `asteria-ttrpg` (GitHub run 42941014483). Do not claim the live search flow is verified until actual two-account testing succeeds.

## Important security semantics

- The **backend** `ASTERIA_FRIEND_LOOKUP_ENABLED` is a real authorization gate on the Cloud Function. It remains inactive unless exactly `1`.
- The **frontend** `?friends-lookup-canary=1` query parameter only enables the search controls in that browser. **It is NOT an access control and does NOT restrict callable access to a pair of test accounts.** When the backend is active, all eligible authenticated Asteria accounts can invoke the exact lookup API (including outside the UI). Existing server verification, privacy protections, and per-account limits of 10 searches in 15 minutes and 40 in 24 hours still apply.
- The website normally remains disabled for everyone else. No public account directory, non-exact searches, email lookup, friend requests, campaign member updates, private avatars or new Firebase projects.
- Every activation and rollback uses the existing `.github/workflows/firebase-deploy.yml` and deploys **only** `functions:asteria:asteriaFriendAccountLookup` in `asteria-ttrpg`. **No** Firestore/Storage rules, Hosting or other Functions are deployed.

## Activation — after this PR has passed CI and merged to main

1. Navigate to the GitHub Actions **Deploy Firebase backend (manual)** workflow, `.github/workflows/firebase-deploy.yml`.
2. Choose branch `main`. Set Operation to `friends-lookup-activate`.
3. Enter exactly `ACTIVATE-ASTERIA-FRIENDS-LOOKUP` in Production confirmation.
4. Start the manual workflow. Verify the single job **Separately approved Friends search activation or rollback** is green.
5. The job generates a clean, single-function Firebase source with `functions/.env.asteria-ttrpg` containing exactly `ASTERIA_FRIEND_LOOKUP_ENABLED=1\n`, deploys via the existing Google Cloud OIDC credentials, and verifies the Gen 2 function's environment using `gcloud functions describe`.
6. A successful job validates Firebase code/configuration deployment, **not yet** real-account runtime search. Continue only with the manual canary below.

## Two-account acceptance (use accounts that already exist)

1. On an Android/mobile browser, open `https://asteriattrpg.com/?friends-lookup-canary=1`. Sign in to account A (or refresh if already signed in), select Account → Friends. Search must be enabled.
2. Enter account B's exact current `Username#00000`. Verify its **username and Account ID only** appear. Ensure no email, internal UID, personal name or private avatar is visible.
3. Search a syntactically valid ID that does not exist; expect a clear no-match response.
4. Try malformed, partial or wildcard values; expect a validation message without a server search.
5. If account B has a prior username alias after renaming, searching the **old** ID should not find them, and searching the **current** ID should find them. Their five-digit number stays unchanged.
6. Sign out or switch accounts while a search is pending; ensure old results disappear. Sign in as B and search A's Account ID.
7. Repeat on desktop or desktop-mode browser to check keyboard, focus, headings and mobile responsiveness. Look for any errors after refresh.
8. Account search quotas are **10 per 15 minutes and 40 per 24 hours per UID**; avoid overtesting or using other users' handles. The emulator already tests these limits.
9. Verify `https://asteriattrpg.com/` without the query parameter still keeps search controls disabled. This is UI visibility only; it does not undo backend activation.

## Emergency rollback

From the **same** manually approved workflow choose branch `main`, operation `friends-lookup-deactivate`, and exact Production confirmation `DEACTIVATE-ASTERIA-FRIENDS-LOOKUP`. The job deploys only the same function with `ASTERIA_FRIEND_LOOKUP_ENABLED=0`, then attempts to verify the runtime flag. The canary URL will still display search controls, but backend requests will fail closed.

**Do not use** the broad `deploy` operation, hand-edit other Cloud Functions, modify Workload Identity providers, or enable the general `friendAccountLookup:true` browser flag to test this phase.

## Test acceptance and Phase 2

If both accounts can search one another without personal-data exposure or session leaks, record the results and separately consider globally enabling the front-end. If any check fails, first use the rollback operation above and investigate the exact failure. Do not claim Phase 1 production verification solely from green GitHub CI.
