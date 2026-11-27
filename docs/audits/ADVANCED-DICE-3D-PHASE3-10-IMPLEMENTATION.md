# Phase 3.10 — Final visual effects, sound, graphics and QA
- Existing React/Vite Asteria dice renderer and server-authoritative Firebase roll only.
- Customisable critical success/failure effects, elemental themes, impact material sound packs, mute and volume.
- Automatic/high/balanced/performance graphics, system/user reduced-motion preference and responsive particle budgets.
- Uses existing single tray AudioContext; effects are bounded decorative CSS overlays, never gameplay or die physics.
- Device-local presentation settings, not Phase 3.7 account appearance records or Firestore rules.
- All towers remain experimental until physical stress matrix and owner approval.
- Production deployment requires explicit separate approval and green latest-branch CI.

## Final acceptance progress
- Phase 3.10 unit coverage: 8 focused tests including 112 deterministic confirmed results unaffected by effect/audio settings.
- Phase 3.10 Chromium visual integration: passed success/failure criticals, fire particles, mute, reduced motion and mobile checks, run https://github.com/GrayIronwolf/AsteriaTTRPG/actions/runs/45161672695
- The dedicated 112 REAL Cannon physics simulations passed 112/112 across all seven die types and all 18 tower configurations. These are not just precomputed numerical results. Run: https://github.com/GrayIronwolf/AsteriaTTRPG/actions/runs/45162105529
- The previous 109/112 stress test was release-blocking; the fixed bounded 48-attempt true-physics preflight successfully cleared those cases without changing official numbers.
- Existing React/Vite drawer and dashboard window resizing now clamps browser canvas dimensions to the parent. Normal tray and towers await faded dice removal before beginning the next roll.
- Final full branch regression, React/Vite bundle sync and website/Firebase test status must be verified on the *latest* commit, not stale source revisions.
- This CI acceptance does not substitute for manual desktop/mobile hardware and sound permission acceptance by the owner.
- All six towers remain experimental with no production enablement or Firebase live deployment.
