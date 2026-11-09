# Asteria Account ID — Scoped Production Function Deployment

## Failure and cause
The first approved callable-only deploy (run #20) was blocked because the Secret Manager API was disabled. After enabling it, the approved rerun failed at source discovery with `secretmanager.secrets.get` denied for `ASTERIA_RESEND_API_KEY`. This key belongs to the **unreleased campaign email callable**, not the Account ID callable. Secret Manager currently has no secrets in the existing project. **Do not create an API key, placeholder Resend secret, or broad project-level IAM roles solely to deploy Account IDs.**

## Safe fix
The existing project `asteria-ttrpg`, source codebase `asteria`, and existing Cloud Functions remain unchanged.

Firebase CLI analyzes all functions exported by the configured entrypoint to discover runtime secrets, even when deployment selects a single function. The production workflow now generates an **ephemeral, runner-local entrypoint** containing only the exact `asteriaAccountIdentity` callable body from `functions/index.mjs`, with its Firebase Auth, Firestore and Functions SDK imports. A runner-local package.json points to this entrypoint **only after** full tests and Google Cloud authentication have passed. The original GitHub source remains unchanged.

The final deploy selector stays exactly `functions:asteria:asteriaAccountIdentity`. This approach avoids introducing a second Firebase project, second functions codebase or production service, and avoids querying campaign email/signing secrets. The preparation script fails closed if the callable source, original entrypoint, project, codebase or workflow context is unexpected. Its output exports exactly one function and preserves the original backend Account ID issuance flag and trusted Auth creation cutoff.

## Verification requirements
- `npm run audit:account-id-scoped-deploy` checks the isolated entrypoint without writing any files.
- `node --test scripts/account-id-scoped-deploy.test.mjs` checks source equivalence, single-export isolation, no Secret Manager references, project/codebase guards, CI-only preparer access and exact temporary write paths.
- The existing Account ID source audit asserts the production workflow runs the isolated preparer before the callable-only deployment.
- The existing CI suite must pass its full Node tests, Firebase emulator tests, lint, production source audit, build and bundle comparison before merge.
- The approved production deployment requires a **new manually dispatched** `account-id-callable-deploy` on branch `main` with `DEPLOY-ASTERIA-ACCOUNT-ID-CALLABLE`. Do not blindly rerun failed attempt #20, which used the previous workflow definition.

## Explicit scope boundaries
No new Firebase project, live account migration, campaign email secret, Secret Manager IAM grant, Firestore/Storage Rules change, website deploy, notification activation, email sending or Account ID issuance activation is performed by this PR. The environment remains fail-closed until a separate rollout approval. A passed CI build does not establish that the Cloud Function has deployed. After approved deployment, verify its Cloud Functions state and region in a new read-only inventory and review its runtime configuration before enabling the feature.

## Caveat for future changes
If the Account ID callable is moved or starts importing other deployed callables or secret definitions, this preparation must fail closed and undergo renewed review. Do not use this runner-local source substitution for unrelated production Functions deployments.
