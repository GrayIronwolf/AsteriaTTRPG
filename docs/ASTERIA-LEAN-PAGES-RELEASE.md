# Asteria lean GitHub Pages package — deployment audit and release gate

## Problem statement
PR #149 merged successfully, Firebase and application checks passed, and the old Pages artifact built correctly, but GitHub Pages publishing stalled for two attempts until its 10-minute backend timeout. Re-running an identical publication without diagnosis is not a fix.

## Approved safe first step
Build a deterministic, smaller production site snapshot without moving hosts or changing the user's live website. **No production deploy is triggered by this branch.**

The source repository remains unchanged. `scripts/build-lean-pages.mjs` stages browser runtime files in a separate folder:
- `index.html`, `CNAME`, optional site metadata;
- preserved `assets`, `css`, `js`, `data`, `react-dist` runtime output;
- public browser modules in `src`, and supporting `config`, `classes` and `creatures` paths;
- referenced Compendium *media* in `content` (original filenames and paths).

The package excludes raw Markdown authoring files, documentation, backend Firebase Functions, credential examples, tests, development scripts, full package dependencies, sourcemaps, and GitHub configuration. Nothing is moved into Firebase. No asset URLs are rewritten, no loss of artwork quality is introduced, and no Account IDs or production data are touched.

The verifier checks literal HTML image/script/style references, CSS URLs, and local JS module imports. It fails if a required static file is missing and emits a JSON size and reference report. Browser smoke and authenticated real-device checks are still required before any live publication.

## Release hold
Do not switch GitHub Pages settings, merge this branch, or publish the site until:
1. Its package audit reports a meaningful change in deployed size and zero missing references.
2. The full repository CI and targeted package CI succeed.
3. A practical deployment option is agreed that avoids merely retrying the same failing job.
4. The existing production site and DNS remain untouched until that release decision.

The last GitHub Pages release artifact was approximately 193 MB and the failed deployments were stalled at `syncing_files`; **artifact size has not been established as the cause**. If a trimmed artifact is still similarly large, the next option is separating public static images/content into a dedicated Hosting origin, planned independently and tested before changing production URLs.
