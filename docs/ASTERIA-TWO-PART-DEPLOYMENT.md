# Asteria two-part deployment — coordinated release

## Goal

Preserve `https://asteriattrpg.com` and its existing Firebase project. Publish account navigation, dashboards, scripts and Compendium data as a small GitHub Pages artifact. Publish only pre-existing **public** artwork and Compendium media from the **same Firebase project** as an independent secondary Firebase Hosting site: `asteria-ttrpg-media`.

No separate Firebase project is created. Firebase Auth, Firestore, Cloud Functions, Storage rules, character/campaign membership and Account ID allocation remain untouched.

## Architecture

| Part | Host | Contents |
| --- | --- | --- |
| Asteria application | Existing GitHub Pages + `asteriattrpg.com` | `index.html`, CNAME, CSS/JS, React runtime, generated Compendium data, necessary browser modules |
| Public artwork | `https://asteria-ttrpg-media.web.app` (secondary site in `asteria-ttrpg`) | `assets/**`, public image/font/video files under `content/**` |
| Private uploads | Existing Firebase Storage | User profile photos, character galleries, campaign artwork; **not copied into Hosting** |

Asteria's original media filenames and quality are retained. The split happens in CI from a clean clone and does not change the source images, generated gameplay definitions, production Firebase services or DNS.

The public media origin is fixed in the release code. This is not a user-supplied URL; it cannot be redirected to an arbitrary host.

## GitHub release procedure

**Do not attempt release until every check passes** and there is a recent backup of the website's working revision.

1. On the draft PR, run `Verify two-part Asteria deployment (no publishing)` and `Firebase and website checks`. Both must pass. Review the split report and ensure the Pages artifact is approximately tens of MB, the media artifact approximately 180 MB, and the correct media origin is used throughout.
2. Review the split with real browser tests: open Compendium categories, race portraits, item cards, inventory/shop images, header, login/account profile, new account registration, desktop/mobile dashboards. Validate private Firebase Storage URLs remain unchanged. If images or CSS fail, **do not merge or publish**.
3. Merge only the reviewed implementation into main when ready to release. No Firebase deployment happens automatically.
4. Create the secondary Hosting site **one time** in the existing project via the [Firebase console](https://console.firebase.google.com/project/asteria-ttrpg/hosting), or GitHub Actions **Deploy Asteria public media (manual)** with operation `create-site` and confirmation `CREATE-ASTERIA-MEDIA-SITE`. This site ID is `asteria-ttrpg-media`; do not select or overwrite any existing default Hosting site. If the ID is unavailable or IAM denies it, **stop** and adjust the audited site ID consistently rather than substitute another one silently.
5. Run **Deploy Asteria public media (manual)**, operation `publish-media`, confirmation `PUBLISH-ASTERIA-PUBLIC-MEDIA`. Its `firebase-production` environment approval and workload identity are reused. Only `hosting:publicMedia` is deployed through `firebase.public-media.json`. The workflow verifies the uploaded header logo at `https://asteria-ttrpg-media.web.app/assets/header/asteria-wordmark.png`.
6. Check representative published links for race portraits and Compendium images. Confirm that public Hosting serves images, not user-uploaded private Storage data. Check cross-origin permissions/CSP on browsers.
7. Run **Publish Asteria compact website (manual after media release)** on main, enter `PUBLISH-ASTERIA-COMPACT-WEBSITE` and approve `github-pages`. This uploads only the small Pages artifact to the existing `asteriattrpg.com` site. It does **not** change DNS, Firebase Functions, Firestore, Storage rules or Firebase Auth.
8. After a successful Pages deployment, test live account login/logout/session restoration, Account IDs, profile editing/avatar upload, Compendium images and gameplay navigation on mobile and desktop.

The public-media and Pages workflows are intentionally separate so a failed Pages upload doesn't require resending the art collection. If GitHub Pages still reports `syncing_files`, investigate service status rather than rerunning blindly.

## Revert

The previous Pages deployment can be restored using the last known-good commit/artifact. The new public Hosting media may remain published without touching Auth/Firestore and can be disabled later once references are no longer in use. Reverting frontend code should not delete user data or change Account IDs.

## Verification boundaries

- The repository CI validates static rewritten strings and package sizes; it does not prove that live Firebase Hosting site creation, IAM permissions, remote image access or authenticated browsers work.
- Firebase Hosting's secondary site is not the existing Storage bucket and is not where private profile photos or campaign uploads go.
- A Hosting site ID is globally unique and has to be available; its existence and accessibility must be verified before deploying the compact Pages site.
- Firebase Hosting can have limits or billing charges. Review current Firebase plan and traffic estimates before publishing a new large media site.
- The new split workflow is **manual only**. Never switch to automatic publication until both parts have been verified in production.
