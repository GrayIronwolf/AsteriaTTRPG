# Milestone 3.6 — Final Gameplay Integration and Acceptance

**Target:** `Website-Build-Test` only. `main`, recovery branches and production Firebase deployment are not in scope.

## Implemented changes

### Hybrid physical/digital dice

- The GM may enter witnessed d20 faces into the **same canonical pending combat roll** used by digital dice. The existing skill checks, advantage/disadvantage, attack vs AC, opposed checks, pending action and cost-resolution stages remain authoritative.
- Unentered secondary checks fall back to digital rolls; unused or malformed physical faces are rejected server-side.
- A separate **record witnessed physical die** command records d4, d6, d8, d10, d12, d20 or d100 observations in the encounter log, with validation, GM authorisation and combat revision control. This is **audit-only**: it deliberately does not apply damage, alter AP or cast a spell.
- Both paths remain subject to the same live-session, campaign GM and optimistic-revision safeguards. No automatic adjudication or mechanical rules were changed.

### Visibility and second-screen

- GM controls token visibility on inactive maps and on active encounter tokens through the authenticated combat command.
- Player-facing battle map adapter independently excludes GM-only tokens, even if passed a malformed or unexpectedly unsanitised map document; concealed active-token identifiers do not leak.
- Existing fog of war, automatic vision, role-scoped map projection, GM preview, Emergency Hide, camera and restricted-viewer grants are preserved.
- Existing GM party presentation character selection remains an independent shared-screen control; campaign membership remains separate.

### Reconnection and recovery

- GM and player combat workspaces now offer an explicit reconnect control. It discards stale data, disposes the old realtime listener and subscribes afresh using the existing authenticated backend.
- Encounter state remains persisted by the authoritative combat transaction; named recovery snapshots, private GM history, paused reopening and revision guards are retained.
- Recovery never reapplies resolved costs or duplicates reward delivery automatically.

## Automated acceptance

- `scripts/milestone-3-6-final-acceptance.test.mjs` validates physical roll bounds and evaluation, token confidentiality, reconnect lifecycle and recovery checkpoint integrity.
- Existing `scripts/milestone-3-6-hybrid-recovery.test.mjs`, cross-system, combat, Firebase and browser tests remain mandatory.
- A separate workflow builds and synchronises the committed React assets before branch integration.

## Verification boundaries

CI can confirm the implementation and isolated browser/backend fixtures, **not** that every possible device, multi-user network interruption or physical dice interaction has been manually experienced. Manual acceptance on actual in-person and remote devices should still verify GM/player sessions, reconnect, projected fog and dice entry. Do not declare production readiness without that evidence.

No code is to be merged until all required GitHub checks have passed, and no deployment of `main` or Firebase production resources is authorised.
