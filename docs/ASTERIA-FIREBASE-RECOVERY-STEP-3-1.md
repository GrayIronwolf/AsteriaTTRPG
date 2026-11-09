# Asteria Firebase Recovery — Step 3.1: Isolated Test Environment Preparation

## Status
**Repository preparation only: complete when CI succeeds. No sandbox project has been created. No production restore or export was attempted.** The GitHub production backup inventory and the synthetic recovery preflight have passed, but a real recovery remains unverified.

## Isolation policy
Production stays `asteria-ttrpg`, while the existing local emulator stays `demo-asteria`. Neither alias changes. The sandbox plan is intentionally non-deployable and lists **no real project ID**, location, bucket, service account, credentials, or connection strings. It cannot be used to provision infrastructure.

The proposed eventual sandbox must use a completely separate billing-enabled GCP/Firebase project with an independently verified project ID, distinct IAM identities, distinct Workload Identity configuration, distinct OAuth clients, distinct Storage buckets, no production web hosting, no transactional mail or webhooks, and no production Firebase config reuse. Review cloud project quotas, billing budgets/alerts, resource location, expiration and clean-up before creating resources. Billing alerts are not hard spending limits.

## Files
- `config/firebase-recovery-sandbox.plan.json`: explicit fail-closed synthetic-only sandbox plan, marked `unprovisioned` with all production-sensitive actions and approvals false.
- `config/firebase-recovery-sandbox/firestore.deny.rules` and `storage.deny.rules`: deny-all rule templates for a future sandbox. **Not** production Rules and not automatically deployed.
- `scripts/firebase-recovery-sandbox-plan.mjs`: read-only local validation. Checks exact sandbox policy, original Firebase aliases, existing Firebase emulator configuration, production deployment approval gate, disabled Account ID/notifications feature flags, and exact deny-all templates.
- `scripts/firebase-recovery-sandbox-plan.test.mjs`: tests fail closed on enabled flags, unsafe project names, changed/extra manifest fields, production project reuse, any permission grants in templates, or cloud-enabled manual workflows.
- `.github/workflows/firebase-recovery-sandbox-plan.yml`: optional workflow-dispatch **offline test only**. Uses no Google Cloud authentication, secrets, environments, or deployment commands. This is separate from production Firebase workflows.

## Future approval sequence (not part of Step 3.1)
1. Approve a new GCP/Firebase sandbox project separately. Agree on geographic residency and configure a budget with alerts; note that budgets do not automatically stop spend.
2. Establish restrictive service accounts and workload federation unique to the sandbox. No production credentials, runtime configuration, provider callbacks, notification email services, or Storage buckets may be shared.
3. Verify that the project is genuinely isolated. Explicitly approve deploying minimum deny-all Rules to the **sandbox only**; never use live Firebase config aliases for this.
4. Use synthetic identities, characters, campaign relationships and artwork in Step 3.2 to verify its functionality and access controls before any real backup handling.
5. Arrange a separate privacy/security review and explicit approval for any export/import of real backup data. Existing Firestore managed backups cannot directly restore to an unrelated project; exports, Auth identity recovery and Storage recovery require separate procedures.
6. Store non-sensitive evidence privately, define cleanup and revoke temporary access after testing.

## Stop conditions
Stop immediately if the destination project equals production, a resource or identity cannot be independently verified, the sandbox has production integrations enabled, costs/retention are unapproved, rules are permissive, or real account data is proposed without explicit approval.

## Interpretation
A green GitHub CI run means only that **the repository-only preparation passed**, not that a sandbox exists, has been isolated, or is authorized to handle real backup data. Both Account ID generation and campaign notifications remain disabled.
