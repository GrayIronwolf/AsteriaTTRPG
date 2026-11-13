# Universal Check Requests — Phase 1 release verification

## Scope delivered in PR #250

- GM Tools composer supports single, group (2–10), and opposed (2) player check requests.
- Each target character is linked to the campaign, owned by an active member, and revalidated by the Cloud Function.
- Characteristic scores use Asteria characteristic tier modifiers (not raw characteristic scores).
- Approved eight-rank names map from Untrained (−2) to Grandmaster (+5); ambiguous legacy numeric ranks require a GM-approved explicit rank selection. The existing combat rank system is unchanged.
- Automatic active equipment, talents, conditions and other check effects are captured as a frozen modifier breakdown, alongside GM situational modifiers; paired advantage/disadvantage cancels. Exhaustion at 0 SP supplies disadvantage for physical checks.
- Digital dice are cryptographically generated on the backend. Physical d20 rolls and manually reported outcomes are marked player-reported; physical advantage/disadvantage requires two dice. Opposed checks require numeric dice.
- Group success threshold defaults to half rounded up (GM configurable); opposed checks compare totals, break differences by criticals, and retain exact ties.
- The GM sees incoming results and history, can resend pending requests, cancel, acknowledge, override with a reason, and request rerolls. Participant check history retains prior attempts; multiplayer rerolls restart all participants.
- Player sees own pending popup with DC/roll/modifiers, can submit dice or manually report a result, dismiss and reopen pending requests, and review history.
- All mutations are server-only and transactional; durable operation UUID receipts prevent duplicated requests and rolls on retries.
- Firestore rules restrict request reads to the GM and the request owner. Group aggregates are GM-only and command receipts cannot be read by clients.

## Verification

Dedicated verification workflow: `.github/workflows/universal-check-phase1.yml`, running the named-rank/d20 model tests, lifecycle/authorization/idempotency tests, Firestore rules emulator including concurrent opposed submissions, lint, existing dashboard/combat regressions and production React build. The validated frontend output is committed to `react-dist/` on this PR branch.

The repository's `Firebase and website checks` workflow is the final integration gate, covering `npm test`, the Firestore/Auth/Storage emulator suite, release/compendium audits, production build and comparison with committed `react-dist/`. **Do not merge until both workflows show success for the final PR head.**

## Deployment after merge

GitHub → Actions → **Deploy Firebase backend (manual)** → **Run workflow** → branch `main` → operation `deploy` → production confirmation `DEPLOY-ASTERIA-PRODUCTION` → **Run workflow**.

This existing workflow deploys Firebase **functions, Firestore rules/indexes and Storage rules** to `asteria-ttrpg`, and does not itself publish the website frontend. Publish the checked-in website frontend through the existing website publishing process separately. Verify that both GM and player accounts receive and resolve a check on the live website after deployment.

## Safeguards and limitations

- There is no automatic production deployment or migration.
- Conditional effect rules remain GM situational choices rather than being silently interpreted from prose.
- Old seven-rank numeric skill progression is not migrated or reinterpreted automatically.
- Manual dice and manual outcomes are explicitly non-authoritative player reports.
- Old cached React chunks remain in the build output to preserve active clients.
