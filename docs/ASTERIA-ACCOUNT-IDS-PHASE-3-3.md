# Asteria Account IDs — Phase 3.3: Account Menu Reorganisation

## Scope
Consolidate the authenticated header Account navigation into three logical groups, without altering account creation, gameplay, campaign membership, or the approved visual asset system:
- **Account:** My Profile, Account Settings
- **Updates:** Notifications
- **Security:** Password & Security, Log Out

The old standalone Account Settings header button is removed; its real workspace route remains accessible through the Account dropdown. The existing mobile appearance drawer reuses the same Account control, and keyboard/escape interactions remain intact.

## Notifications
The Notifications action opens an account workspace Notifications section. This uses the already implemented authenticated `AsteriaCampaignNotificationsUI` component and Firebase Callable if and only if `campaignNotifications===true` and the account service is ready. When disabled, the section clearly explains that campaign notifications are not active, linking users conceptually back to existing Campaign Forge invitations. The account overview's former dead-end Notifications placeholder now opens this real section. No fake unread count is shown, no browser/local storage is used for notifications, and no notifications are activated by this update.

## Password & Security
A focused read-only security dialog identifies the current Firebase-authenticated email and requests a password-reset link via a new `AsteriaFirebase.sendAccountPasswordReset()` wrapper. The wrapper derives the email from Firebase Auth, checks that the authenticated UID still matches, and calls the established `sendPasswordResetEmail` method; the browser never accepts a selected target email. One request per dialog opening, with duplicate prevention and account-switch/signout dismissal. Users complete password changes through Firebase's normal email flow. No password, identity number or credential is cached.

## Compatibility and rollout
Account ID creation flags stay `accountIds:false`, and the backend `ASTERIA_ACCOUNT_IDS_ENABLED` is unchanged. Campaign notifications remain off by default. Existing verified Account ID display, copy, character and GM dashboards, account profile, campaign invitations and logout remain unchanged. No Firebase production deployment or flag activation.

## CI
Phase 3.3 source + security behavior regression tests are wired into `npm test`. Update the legacy navigation/button tests to reflect removal of duplicate Account Settings header access, without weakening their checks for approved button families, mobile navigation, or current account menus. All dependency audit, lint, automated Node tests, Firebase emulator, production build and bundle consistency checks must pass before merging.
