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
