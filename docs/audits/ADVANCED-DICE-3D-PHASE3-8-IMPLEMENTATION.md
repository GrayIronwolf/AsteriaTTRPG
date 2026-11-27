# Phase 3.8 — Castle Tower physics feasibility prototype

**Branch:** Website-Build-Test. **Scope:** Castle only. No other tower family or Firebase deploy.

## Design
- Procedural AAA-style stone castle, dark metal, bronze edging, battlements, four corner
  turrets, illuminated chute and real descending ejection ramp into the existing six-tray system.
- 10 identical THREE mesh / Cannon collision boxes: rear wall, two side walls, doorway wall,
  three staggered internal sloping baffles, physically sloping return ramp and two safety guides.
- The same Open Dice 1.13.0 physical prediction and playback are used. No additional renderer,
  physics engine, RNG source or new Firebase document.
- The castle is deliberately optional and marked *prototype* pending owner feasibility review.
- Up to six physical dice meshes per throw; larger pools stay server-authoritative and
  cannot be misrepresented as a working tower animation.
- Capture physical path telemetry from the physics recording to confirm real traversal and exit.
- Default 3D tray remains the production-safe mode. Trapped/incomplete/mismatched tower results
  retain the authoritative recorded number and report the physical failure.

## Exit gates
- 112 deterministic, authoritative roll sample fixtures (7 die types) at minimum.
- Browser-in-the-loop actual Cannon roll/face agreement and physical path validation.
- Reduced-motion/disabled WebGL, resize/mobile, repeated plays, no WebGL disposal leaks.
- No Phase 3.9 until owner feasibility review. Runtime replay face variance and trapped dice
  must be reported accurately instead of advertising a decorative model as interactive.

## Physics preflight and face consistency
The current experimental adapter pre-simulates up to eight actual Cannon trajectories and
accepts only one in which every die reaches the open tray. It does not alter Firebase's
recorded roll or create another gameplay roll. The engine replays that one complete physical
trajectory, then keeps dice asleep at their recorded settled pose so unrecorded sideways
gravity cannot change the visible face after the official prediction.
If no real physical exit is possible, it fails visibly and preserves the official numeric result.
This is not a claim that all types are production ready until the browser gate passes.

## Verified integration and release status (23 November 2026)
- Targeted Castle physics [run 45123824164](https://github.com/GrayIronwolf/AsteriaTTRPG/actions/runs/45123824164): successful 5 unit and 14 Chromium acceptance checks. Each tested die type d4, d6, d8, d10, d12, d20 and d100 reached the tray and matched its confirmed face in those runs.
- Full Phase 2-3.8 regression [run 45124237620](https://github.com/GrayIronwolf/AsteriaTTRPG/actions/runs/45124237620): successful after the legacy Phase 2 Playwright timeout fix.
- React/Vite generated assets synchronized in commit `d6cdbae5b49d76bc1e0b70ce713daa8b001e88e3`.
- Safety: no Firebase production deploy; Castle mode is opt-in experimental only. No selection in the normal dice studio and no additional tower families.
- Remaining acceptance: the 112 predetermined **server-result unit fixtures** are not 112 real physical Cannon simulations. A separate 100+ physically simulated roll matrix with all seven die types, criticals, face agreement, full d100 mesh-count, memory/disposal, mobile/reduced-motion and meaningful statistical reliability is still required before production enablement. Owner feasibility review is required before Phase 3.9.
