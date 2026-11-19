# Phase 10.5 - Controlled live React/Vite cutover

The owner opted for live testing after publication. This does NOT waive release integrity checks or rollback.

## Staging (no publication)
1. Open and merge PR #329 only after the whole PR check suite passes.
2. The Phase 10.5 workflow runs on the merge commit on main, builds a production-configured React/Vite frontend, hashes it, and stages it on a NEW separate branch named react-vite-live.
3. The branch preserves CNAME, all legacy CSS and JavaScript, historic react-dist chunks and content. The old index.html remains unchanged on main for rollback.
4. The staged release includes assets/asteria-react-release.json with its exact source SHA. This is a file marker, NOT evidence that the site is live.

## Publishing - user action
Open GitHub repository Settings > Pages and inspect the existing deployment source. Only if it currently uses Deploy from a branch, main and /(root), change the branch to react-vite-live, keep /(root), and Save.
If Pages uses a GitHub Actions-based publisher, a different branch or an outside service, STOP and adapt the publication approach; do not assume changing this setting works.
After GitHub Pages finishes deploying, check https://asteriattrpg.com/assets/asteria-react-release.json and the new Home page. Verify login and route navigation with two owned test accounts.

## Rollback
If startup/login/navigation breaks, switch GitHub Pages back to the PREVIOUS VERIFIED publishing source (main / root only if those were the original settings). Old bundles and root index.html remain unchanged on main.
Wait for GitHub Pages publishing confirmation and verify the restored login and Home. Do not revert Firebase rules/data or delete assets as part of frontend rollback.

## Limits
The exact existing GitHub Pages source is not yet verified by a supported read-only tool. This workflow deliberately stops before changing hosting settings. The repository Firebase manual deploy action is unrelated to Pages and must not be run for this frontend-only cutover.
Legacy authenticated GM/player visual parity was not captured in prior CI; the owner has chosen post-publication testing.
