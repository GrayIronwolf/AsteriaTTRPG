# Asteria TTRPG — Phase 7 Update 4 acceptance and verification

## Automated scope

Source and built assets were audited for account/campaign-safe dashboard persistence, navigational restoration, Player and GM draft saves, collision/resize/lock bounds, responsive focus/touch affordances, and approved art preservation.

- Full UI and dashboard regression tests, all application tests and production dependency audit
- Firestore/Auth/Storage emulator rules, including owner-only dashboard-layout records and cross-account read/write denial
- Content validation, lint, XP/data synchronization tests and source-matching production build

**Release requirement:** merge only after the normal pull-request Firebase and website checks pass, then confirm the GitHub Pages deployment and post-merge checks for the exact merge SHA.

## Scope limitations

Automated source checks, deterministic browser fixture checks from previous updates, and Firebase emulator permission tests **do not constitute physical Android/iPhone/tablet testing** or a real Firebase-authenticated two-account session. Production authentication, network failure recovery, actual touch behavior, screen reader behavior and two-device concurrent saves require manual acceptance with consented test accounts.

## Physical-device acceptance checklist (not performed automatically)

Use two owned test accounts and one campaign GM account, without sharing passwords or enabling a public test login.

1. On Android, sign in as a Player and visit Player Dashboard > Dashboard Settings. Add one optional panel, move it, resize it, lock its position, and save settings. Reload the page and revisit the dashboard. Confirm exact visible panels, locked placement, resource strip and the approved frame/header artwork.
2. Sign into the **same Player account** on a second browser or device (tablet/desktop or iPhone). Confirm the saved layout is restored. Make one non-conflicting layout change there, save and return to Android; refresh and confirm the new saved layout appears.
3. With an unsaved Player draft open, have the other session save a layout; confirm unsaved edits are not silently replaced. Explicitly discard or save the draft and confirm the intended result.
4. Sign out of the first account and sign in as a different Player. Check that the previous account's panel draft, character details and saved layout are not visible. Sign back into the original account and confirm its settings remain intact.
5. Sign in as a GM and open a campaign. Check GM Main, Dashboard Settings and party sidebar. Add/remove, drag, resize, lock, save, reload and revisit a layout, while checking the fixed GM sidebar and resource controls.
6. Open a second campaign and confirm its layout is independent. Change accounts while browsing settings and confirm no previous campaign or user's layout is displayed.
7. Test Android portrait and landscape, a tablet (approximately 768–1024 CSS pixels) and desktop (1280–1920 CSS pixels). Check no horizontal page overflow, current tab visible after rotation, no clipped controls and full-screen editor overlay.
8. Test one-finger drag, resize handle, accidental second touch, cancel gesture, and tap without moving. Verify keyboard Tab, Shift+Tab, Escape and Alt+arrow movement/resize when hardware keyboard is available. Check readable focus indicators and 44px editor touch targets.
9. For all cases verify normal character/GM gameplay panels, HP/SP/MP, combat, quests, inventory and approved images behave as before; record any discrepancy with device/browser, route, account role, steps and screenshot.

**Expected:** no lost unsaved edits due to live data updates; no private account data bleed; layouts restore per account and campaign/character; invalid collision moves are blocked. A simultaneous save conflict between devices is not claimed to be automatically resolved; refresh the other device and inspect its draft before saving.
