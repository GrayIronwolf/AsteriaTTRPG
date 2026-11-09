# Asteria — Account ID Cloud Functions Release Architecture

## Root cause (verified)
The authorised Account ID deployment reached Firebase source packaging and failed in Run #22:
`Could not read source directory. ... TypeError: minimatch is not a function`.

The root workspace `package.json` forces `minimatch: ^11.0.1` across all dependencies, while the installed `firebase-tools@15.35.0` requires the callable `minimatch:^3.0.4` API. The root lockfile resolves `minimatch@11.0.4`. The preceding account-ID-only entrypoint resolved unrelated Secret Manager references but **did not isolate dependency resolution or the uploaded source tree**.

## Final packaging separation (same Firebase project and codebase)

**No new Firebase cloud project, hosting site, or secret is created.** Repository changes use an independent, ephemeral CI runner source package and a separately installed CLI.

`scripts/account-id-release-package.mjs` reads the authoritative function body from `functions/index.mjs` (fail-closed if it changes) and creates a source package in `$RUNNER_TEMP/asteria-account-id-release` with exactly:
- `firebase.json` mapping only `functions/` to existing codebase `asteria` and Node.js 22.
- `functions/package.json` with only `firebase-admin@14.5.0` and `firebase-functions@7.4.0` as runtime dependencies; no website dependencies, devDependencies, or broad npm overrides.
- `functions/index.mjs` containing only the verbatim Account ID callable from the production source and the minimal SDK imports.
- `functions/accountIdentity.mjs`, `accountIdentityProfile.mjs`, `accountIdentityIssuance.mjs`, each copied verbatim.

`firebase-tools@15.35.0` is separately installed under `$RUNNER_TEMP/asteria-account-id-cli`, with its own dependency resolution. `scripts/account-id-release-cli-verify.mjs` requires its resolved minimatch to be **a callable 3.x export**. The deployed CLI runs from the staged root; it does not scan the website workspace. The command retains the exact production project, codebase, function and approval string.

The previous runner-only root package modification and entrypoint generator are superseded and removed from the active deployment.

## No-cloud release verification before another production run

The standard pull-request CI now:
1. Installs root dependencies and runs production audits, content checks, lint, unit tests, Firebase emulator tests and gameplay/data sync checks.
2. Stages the six approved release source files to an isolated runner temp directory, reads no live data, and installs **only** production runtime dependencies.
3. Runs a source syntax check and `npm pack --dry-run --json` inside that isolated package, verifying the archive contains exactly five approved source files (the sixth approved file is the staging `firebase.json`).
4. Installs the pinned Firebase CLI into a separate runner directory and tests its actual `minimatch@3` API.
5. Builds the website and verifies that committed bundles did not change.
6. Requires successful CI and approved merge before any production manual workflow run.

The manual callable-only release also installs the isolated runtime package and CLI, checks pinned versions, checks that existing `asteriaAction` and `asteriaInvite` functions are present before proceeding, and checks all three functions after deployment.

## Operational boundaries

- Manual `account-id-callable-deploy` with exact `DEPLOY-ASTERIA-ACCOUNT-ID-CALLABLE` approval only.
- No broad Firebase deployment, Cloud Functions codebase rename, other functions, new Firebase project, real-account backfill, Firestore/Storage Rules, website activation, campaign emails or new secrets.
- Account ID backend remains gated by `ASTERIA_ACCOUNT_IDS_ENABLED` and the canonical Auth creation-time cutoff; account IDs remain disabled after backend deployment.
- **Successful CI confirms only packaging and source safety, not cloud IAM, Cloud Build or live deployment.** Check a new GitHub run and independent Cloud Functions inventory before claiming production success.
- Do not rerun Run #22. Its workflow used the previous packaging path.
