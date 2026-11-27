# Advanced Dice — Phase 3.3 Familiar Dice

**Status:** Implemented on \`Website-Build-Test\`; dedicated dice and Chromium checks passed.  
**Phase scope:** Familiar Dice only. Watcher Dice remains Phase 3.4. Tray/tower planning is deferred to their own phases.  
**Deployment:** no live Firebase deployment initiated.

## Implemented
- New Familiar Dice PBR recipe with white-resin default, black cat motifs, gold numerals and metallic gold edging. Uses the existing Open Dice 1.13.0 public set registry, built-in face painting, dielectric clearcoat, texture maps, reflections and physics; no separate engine.
- Eight original cat pose silhouettes (sitting, curled, stretching, walking, pouncing, alert, perched, portrait) and eight coat markings (solid, tabby, tuxedo, calico, tortoiseshell, spotted, colourpoint, bicolour).
- Twelve preset cat coat colours, eight eye colours, twelve paw colours, twelve numeral colours, custom six-digit HEX colours, sixteen resin colours, four resin finish/translucency-look presets, twelve decorative motifs (including none). Separate coat, eye, paw, resin and number controls with swatches and live preview.
- Procedural SVG design texture composed from validated enum/HEX values. This texture is preloaded into the same WebGL PBR materials in the non-gameplay preview and in the server-confirmed animated roll. The host checks that textures genuinely loaded before displaying Familiar artwork.
- User-controlled optional CSS resin shimmer, off by default. Reduced-motion media preference disables the shimmer; no gameplay dice roll is triggered by customisation.
- Version-one Familiar schema accepts older appearance objects without the new optional decoration field and defaults them to paw.
- Existing d4, d6, d8, d10, d12, d20 and d100 rendering and face numerals preserved. Official Firebase results are unchanged.
- Existing saved gameplay dice presets/history are separate and unaffected. Saving appearance collections to accounts remains Phase 3.7.

## Realism scope and limitations
The existing Open Dice painter produces physically based 3D die materials, with glossy resin *appearance*, texture artwork, edge metal and face numbering. Cat figures are original **surface artwork motifs** and the resin is not an actual refractive gel volume. The motion is a subtle optional **highlight shimmer**, not a rigged moving 3D cat. No custom images, external model uploads, new Firebase services, tower physics or tray designs are introduced.

## Verification
Dedicated dice workflow: [GitHub Actions 45102030659](https://github.com/GrayIronwolf/AsteriaTTRPG/actions/runs/45102030659) **success**.
- 48/48 dice unit tests passed.
- 10/10 Phase 2 browser tests passed.
- 9/9 Phase 3.2 browser regression tests passed.
- 12/12 new Familiar Dice Chromium tests passed.
- Lint and React/Vite build passed.
- Browser QA verified the cat SVG image loaded into WebGL, eight poses/coats, colour controls, d100 preview, change-to-PBR preview, optional shimmer and reduced-motion preference, confirmed roll total, 350px dashboard canvas and 390px mobile viewport.
- Generated React/Vite bundle synchronized automatically on commit after the dedicated test.
- **Final repository-wide verification:** verify the latest \`Website-Build-Test\` commit in Firebase and website checks before declaring complete.

## Owner review gate
Phase 3.3 completion is independent of art sign-off. The owner can inspect the aesthetic in the test branch, request refinements, or approve Phase 3.4. Never begin Phase 3.4 without explicit approval.
