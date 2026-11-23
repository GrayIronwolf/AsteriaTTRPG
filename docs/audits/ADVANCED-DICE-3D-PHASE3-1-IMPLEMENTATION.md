# Phase 3.1 — Catalogue and Material Foundation: Implementation Notes

**Scope:** Catalogue data, validation and reusable appearance token definitions only. No realistic dice meshes, material textures, moving eyeball, cat artwork, tray geometry or dice tower physics are claimed to exist yet. This respects the owner's preference to plan trays and towers when their phases arrive.

- 12 core dice families and 2 special families (Watcher and Familiar).
- 6 unassigned tray design slots and 6 unassigned tower design slots. Slots do **not** define geometry, naming, materials or gameplay.
- 8 shared material definitions with basic physically based rendering parameters and unassigned texture channels. Texture maps are **not yet authored**.
- Versioned appearance schema; strict valid colour, enum and nested appearance checks; per-die-type material and colour overrides; a separate visual collection schema capped at 20 items for future use.
- Watcher: eye type, iris/sclera colour, pupil shape, motion, blink and transparency. Familiar: coat colour and pattern, eye colour, pose, paw colour and resin appearance.
- The existing \`openDiceAdapter.mjs\` now obtains its **unchanged** visual fallback colours through \`openDiceAppearanceOptions()\`. It still accepts server-confirmed dice records only; never computes or modifies gameplay rolls.
- No saved appearance collection UI or database writes in Phase 3.1. The later Studio and account-saving phases will build on these schemas.
- The current \`open-dice-dnd@1.13.0\` supports basic colours via its existing adapter; material PBR parameters and animated interior/complex tower assets need verified engine extensions during future phases.

**Regression tests:** Phase 1, Phase 2 and Phase 3.1 dice tests, lint, React/Vite build and Phase 2 browser QA. Final full-site Firebase checks must be green on a revision with compiled assets committed.

**Owner gate:** Phase 3.2 does not start until approved.
