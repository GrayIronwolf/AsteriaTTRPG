# Milestones 1–3 — Cross-System Integration Audit

Target branch: `Website-Build-Test`
Baseline commit: `a7610c5153d33d796f5003e8a0d46d85870c04f7`
Scope: GM and player dashboards, canvas interactions, encounter management, published battle maps, combat, fog, presentation, hybrid viewers and recovery.

## Findings and corrective action

1. **Restricted viewer grant identifier hardening — corrected.**
   The hybrid-viewer identifier pattern accepted `__proto__`,
   `prototype` and `constructor`, which are unsafe as keys in
   JavaScript object-backed grant expiry dictionaries.
   The audit explicitly rejects these identifiers and adds regression checks.
2. **React asset consistency — corrected in the audit branch.**
   Changing runtime source requires synchronising committed `react-dist`
   artifacts. The dedicated audit asset build workflow commits the verified output
   before final merge checks.
3. **Cross-feature coupling — regression checked.**
   An additional test suite checks player-safe combat/party projection, restricted
   grant expiry, GM-private recovery boundaries, unique battle-map token IDs and
   required integration links between presentation, combat and recovery.
   Existing Milestone 2 canvas and dashboard suites, Milestone 3 combat/presentation
   tests, full application tests, Firebase tests and browser baseline remain in CI.

## Existing CI baseline

The baseline `Website-Build-Test` commit passed the four workflows:
Firebase and website checks, interactive browser baseline, React asset compilation
and Pages publishing isolation.

## Limits of this audit

Automated CI and source review cannot establish that *no error or conflict
exists anywhere* in a large website. In particular, the following require
separate acceptance evidence and are not certified by this PR:

- Real-device GM/player simultaneous sessions and extended reconnection.
- Physical-dice adjudication in the hybrid gameplay workflow.
- Per-player presentation visibility end-to-end.
- Production Firebase permissions, IAM and deployment behaviour, since no live
  service deployment is authorised.
- Hardware-specific touch/trackpad latency, long-session canvas FPS and memory.

If the final audit and repository-wide checks pass, the committed correction
and test suite can be integrated into `Website-Build-Test`. This is an
integration audit, not a declaration that every Milestone 1–3 feature has
passed exhaustive live acceptance.

No production deployment is authorised and `main` and recovery branches
must remain unchanged.
