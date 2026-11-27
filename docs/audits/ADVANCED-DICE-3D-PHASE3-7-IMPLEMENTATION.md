# Phase 3.7 — Account Dice Collections

Branch: Website-Build-Test. Firebase production deployment is not authorized.

- Versioned \`users/{uid}/diceAppearances/current\` private Firestore document.
- 20 validated dice + tray appearance pairs; saved separately from existing roll history.
- Save, Save As, Duplicate, Delete, account Default, per-owned-character Assign and Unassign.
- Transactional revision conflict detection, schema validation, ID and payload limits.
- Ownership checked against \`users/{uid}/characters/{id}.ownerUid\` in callable.
- Firestore rules deny every browser write and cross-account read, including nested paths.
- Reuse the existing \`asteriaAdvancedDice\` callable; no new provider.
- Version-1 dice-only visual library migration to version-2 dice+tray form.
- Existing UCRS, roll history, dice-pool presets, combat and critical rules untouched.

Tests: \`scripts/dice-engine-phase3-7.test.mjs\`,
\`scripts/dice-engine-phase3-7-emulator.test.mjs\`, Phase 2–3.6 regression checks,
React/Vite build and repository-wide Firebase checks.

**Deployment gate:** Firestore rules and the callable must be explicitly deployed by the owner
after a separate approval. No production deployment has been triggered.
