# Phase 4.5 — Account Security, Permissioned Compendium & Integration

## Final security boundary for Phase 4

The standalone React/Vite preview has migrated Firebase authentication (4.1), profiles and settings (4.2), Friends (4.3), and private notification views (4.4). This phase consolidates their **account-scoped checks**, tests the public Compendium build output, and records what must remain private before Phase 5.

### Account security
- A page requiring private account data now checks the current authenticated account **and** that the Firebase Auth UID/email has an owned canonical profile. A query-string UID, guessed Account ID, local role, or synthetic display name does not activate a private data service.
- Firebase Auth and Firestore/Storage rules remain the true authorization boundaries. A front-end route guard is a second safety check, **never a replacement for server authorization**.
- Friends and notifications remain independently opted into only when their existing backend gates permit them; sign-out and user switching clear private state and invalidate stale responses.
- Full Phase 4.1/4.2 Auth, Storage avatar, profile, account-ID, sign-out, session restoration and negative-login browser regressions remain required.

### Compendium publication access
- The Compendium is still the **single existing authoring source** in `content/` and canonical `data/compendium-parts` builds. No new or duplicated source database has been introduced.
- All static public catalogue, full-entry and search generators now share `isPublishedDefinition`: only entries explicitly marked `visibility: public` and not flagged GM-only, secret or private are published. Generated projections are strictly allowlisted; unknown private metadata causes an audit failure.
- The React browser loaders validate their JSON projections and fail closed on extra private fields, bad domains, malformed sections or restricted section headings.
- Every published ID in the three asset families must exactly match the explicitly public IDs in the canonical source. The new `site:security-audit` is a mandatory part of the Vite site build and its CI verification.
- GM-only or campaign-private definitions are **not exposed** from an unprotected static site. The current Asteria content metadata `gm-only` is not cryptographic secrecy, as documented by `content/README.md`.

### What is not being misrepresented as complete

A real online **GM/private Compendium reader** requires a dedicated verified owner/membership server endpoint, server-side content storage outside public hosting and an independently approved authorization model. No such secure endpoint was previously present in this isolated site migration. Phase 4.5 deliberately denies this access rather than add an unsafe browser-only GM role toggle or put restricted Markdown in a public JS bundle.

This phase does **not** deploy new Firestore or Storage rules, Cloud Functions, migrate campaign content into another database, activate notifications/Friends, or switch production hosting. Campaign Forge and dashboard privileges remain protected until subsequent phases. Real-owner multi-account acceptance, GM-role revocation and production-cutover performance checks remain required when the protected content delivery endpoint and Forge are implemented.

## Verification gate

- Phase 4.5 tests: forged roles, guest/owner session changes, exact public projections, generated shard equality, rejection of private fields, disabled GM content access.
- Existing React browser regression, Auth/Firestore/Storage emulator acceptance, Firebase security rules, source tests, lint and production build parity checks.
- Merge only once the required GitHub Actions checks pass. No production deployment is triggered by this phase.
