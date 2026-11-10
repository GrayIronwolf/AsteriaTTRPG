# Asteria Header & Account Experience — coordinated release

## Scope implemented in PR #149
- The existing Asteria wordmark remains the Home action. There is no duplicate Home button.
- Compendium, Character Forge and Campaign Forge remain the central navigation. At compact widths, the existing navigation drawer contains only those destinations.
- The logged-in **Account** button stays accessible on the right at every width. Its My Profile, Account Settings, Appearance, Notifications, Password & Security and Log Out actions remain distinct and authenticated.
- The verified Account ID is presented alongside the profile name in the header. User profile images appear in a small circular frame and use a single, non-looping entry transition. Reduced-motion preference disables the animation.
- My Profile permits editing given/family/preferred display name. **No account username, UID, account number, account ID, assigned timestamp, registry key, email or role can be changed through the editor.** The existing unique Account ID registry retains ownership and duplicate protection.
- My Profile also permits uploading a square-cropped WEBP profile picture (up to 4MB input; 512px square output no more than 2MB), replacing it, or removing it. Firebase Storage rules restrict all operations to the currently signed-in owner.
- The unread envelope is only shown when the existing campaign notification backend is enabled and reports an actual unread notification. The menu never invents unread counts or activates notifications on its own.
- The existing appearance colours, background, typography and cross-device sync are reused. Appearance is reached from Account; the small-screen navigation button opens navigation rather than the unrelated theme controls.
- Firebase login, email verification, Account ID allocation, campaign membership, character progression, dashboard ownership and inventory are unchanged.

## Frontend/Storage coordinated release
**Do not publish this interface without its matching Storage rules**: the profile photo feature depends on the owner-only rule at `users/{uid}/profile/avatar`.

1. CI must pass for the reviewed PR: lint, full Node tests, Firebase Auth/Firestore/Storage emulator tests, production build, and exact committed bundle checks.
2. Confirm a recent Firebase Storage/Firestore backup and that owner-only profile permissions behave correctly in the emulator. No broad public avatar listing/reading is introduced.
3. Merge PR #149 only when ready to publish the website and deploy its one scoped Storage Rules change. The production deployment must be approved by the project operator.
4. In GitHub Actions on `main`, choose **Deploy Firebase backend (manual)** → `account-profile-avatar-rules-deploy`, enter exactly `DEPLOY-ASTERIA-PROFILE-AVATAR-RULES`, and approve the `firebase-production` environment when prompted. The job runs tests and deploys **Storage rules only**. It does not deploy functions, change Firestore or issue Account IDs.
5. Verify GitHub Pages deployed the same reviewed `main` revision. Test on mobile and desktop using one existing account and one newly created account: header identity, Home logo, navigation without unexpected logout, profile name edits, avatar add/remove and image persistence, Account ID unchanged, appearance access, password/security and intentional logout.
6. Confirm Account IDs before and after account switching. Check that no private avatar can be read by another user, and that notifications never display misleading unread indicators when the service is disabled.

## Rollback
A frontend revert does not require deleting accounts or regenerating permanent Account IDs. The private avatar rule may remain in place even when the frontend is reverted; it only authorizes a signed-in owner to access a fixed, account-scoped file and does not grant public access. For any detected access-control regression, halt avatar use and revert the scoped rule after reviewing the precise error.

## Deferred (separate upgrade)
Friends List, friend requests, blocking, privacy settings for friends, social notifications and campaign invitation integration are not part of this UI release. Registered **username changes** require a separately designed, server-authorized immutable-ID policy and are not enabled by editing a preferred display name.
