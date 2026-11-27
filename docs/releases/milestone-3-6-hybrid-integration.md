# Milestone 3.6 — Hybrid Presentation & Recovery Integration

Target: `Website-Build-Test`. Production (`main`) and recovery branches remain out of scope.

## Implemented in this change set

- Server-authorized emergency blackout using the canonical presentation revision,
  including when the GM interface has an outdated revision.
- Removal of stale restricted combat data when the GM changes presentation scenes
  or opens/closes a hybrid viewer session.
- Safe projection synchronization: hidden restricted scenes publish an empty
  combat summary rather than retaining off-scene combat details.
- GM preview of selected title, battle map, world atlas, combat, party and
  published media scenes before publication.
- Regression tests for stale blackout, viewer-grant lifecycle, restricted
  projections, recovery checkpoints, snapshot save/restore and unauthorized access.
- A milestone-specific check and generated asset synchronization workflow.

## Existing functionality retained

- Authenticated and time-bounded restricted viewer grants, GM revoke and close.
- Digital GM combat and map projection, fog/automatic vision, GM and player views.
- Live encounter persistence, manual recovery snapshots, completed encounter
  history and reopening with conflict/roster safeguards.
- Isolated player presentation routes and Firebase permission checks.

## Verification gates

- `node --test scripts/milestone-3-6-hybrid-recovery.test.mjs`
- Production React build and bundled output verification.
- Lint, combat tests, digital GM integration, repository-wide npm test and
  Firebase checks.
- Development publishing isolation.
- All required pull request checks green before integration.

This record documents the implementation in PR #397; it does not independently
certify all hybrid gameplay acceptance scenarios or authorize a production
deployment. In-person physical-dice adjudication and per-player presentation
visibility require separate end-to-end acceptance evidence before the full
Milestone 3.6 can be declared complete.
