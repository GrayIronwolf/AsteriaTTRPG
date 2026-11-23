# Asteria Advanced Dice — Phase 3.4 Watcher Dice

**Status:** Implemented on \`Website-Build-Test\`, dedicated tests and browser QA passed; final full-site release verification required on the synchronized React bundle.  
**Scope:** Watcher Dice only. Phases 3.5 (trays) and beyond are not started.  
**Firebase deployment:** None.

## Deliverables

- A Watcher Dice style selectable alongside the 12 core designs and Familiar Dice (14 total) in the current Advanced Dice Workspace.
- Translucent-looking PBR gel shell with coloured swirling material patterns and clearcoat. The implementation uses actual THREE.MeshPhysicalMaterial faces, adjustable opacity, reflections and geometry; it is **not** a ray-traced physically refractive gel or liquid simulation.
- An independent 3D eye rig is a child of each visible die mesh, composed of a sclera sphere, iris, pupil, halo and specular highlight. It is **not** a flat decal and is not a separate simulation object.
- Six eye types, five pupil shapes, 12 iris swatches plus custom HEX, six sclera swatches plus custom HEX, 16 gel colours plus custom HEX, four gel transparency presets, six swirl patterns, eye glow, four eye movement intensities, four blink frequencies and optional pointer tracking.
- The eye moves, blinks and reacts cosmetically to server-confirmed natural-1 and natural-20 results. Players can disable motion. Reduced-motion and lower-capability devices keep a static eye and simplified model details.
- Watcher visuals appear both in the dedicated Three.js die preview and during Open Dice 1.13 physics rolls. Rendering changes do not change collision bodies, die face values, dice history, RNG, resource accounting or server responses.
- Existing visual appearance configurations remain account-local/unpersisted until Phase 3.7; no new Firebase collections, storage or external services were introduced.
- Existing PBR materials, Familiar/cat customisation, numerical fallback, d4–d100 die types and GM/Player dashboard canvas integration are reused rather than rebuilt as another layer.

## Verification

[GitHub Actions dedicated dice build — run 45105417501](https://github.com/GrayIronwolf/AsteriaTTRPG/actions/runs/45105417501): **Success**.
- **62/62 unit tests passed**, including Phase 1, 2, 3.1, 3.2, 3.3 and 3.4.
- Phase 2 browser regressions: **10/10 passed**.
- Phase 3.2 browser regressions: **9/9 passed**.
- Phase 3.3 browser regressions: **12/12 passed**.
- Phase 3.4 browser checks: **14/14 passed**, including WebGL rig creation, all 14 design choices, eye controls, colour editing, d4/d100, reduced-motion, no preview-created roll, physics roll settling to a server-confirmed 25, resized canvas, mobile overflow, and zero uncaught exceptions.
- Lint and React/Vite build passed, with the compiled assets synchronized in a follow-up commit.

## Fixes made during verification
- Updated legacy test assumptions about Watcher being unavailable and the count moving from 13 to 14.
- Removed an obsolete Phase 3.2 guard that rejected Watcher before rolling.
- Fixed a lint error from that removed guard while retaining appearance validation.
- Added browser diagnostics for render errors and terminal states; verified final Watcher roll reaches \`settled\`.

## Performance and limitations
- The eye is a nested visual child, not a separate collider; 3D frames are drawn by the existing Open Dice scene.
- Low-memory/mobile modes simplify mesh geometry and avoid costly eye tracking/blinking.
- The shell is transparent PBR with readable 2D face numerals, not volumetric eye refraction through real gel. A physical hardware review may be useful before deployment.
- Do not start Phase 3.5 or deploy live Firebase until explicit owner approval.

## Release gate
Repository-wide Firebase + Website Checks must succeed on the **latest** \`Website-Build-Test\` SHA with synchronized React bundle, in addition to the dedicated tests above.
