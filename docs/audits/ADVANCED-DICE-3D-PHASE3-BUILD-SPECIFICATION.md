# Asteria TTRPG — Advanced Dice 3D, Phase 3 Build Specification

**Status:** Approved catalogue counts and special-set concepts incorporated into the build roadmap. **Planning only**; Phase 3 implementation has not started.  
**Branch:** \`Website-Build-Test\`  
**Current foundation:** React/Vite Advanced Dice Workspace; \`open-dice-dnd@1.13.0\`; Firebase/server-authoritative dice actions; Phase 2 3D table.  
**Approval policy:** Complete and validate *one numbered phase at a time*. Await owner approval before the next numbered phase. No live Firebase deployment without separate approval.

## 1. Agreed catalogue

- **14 dice design families:** 12 core + 2 special.
- **6 realistic 3D tray families** with 6 base shapes.
- **6 realistic 3D tower families**, beginning with one playable Castle Tower prototype.
- **20 personal saved dice collections** initially (proposed cap, subject to validation and owner approval).
- **Basic** and **Advanced** edit modes in one studio.
- All designs: editable preset data, shared material library, 3D preview and accessible fallbacks.
- Critical rule: the **Firebase saved roll remains authoritative**. Replays, tower collisions, decorations, colours and sounds must never change the game's result.
- Existing dice pool types: d4, d6, d8, d10, d12, d20, d100. Existing roll maximum: 40 dice; Phase 2 WebGL preview budget: 24 rendered meshes, with numerical fallback for larger pools.

### 1.1 Core dice presets (12)

| ID | Display name | Default look | Notable editable details |
|---|---|---|---|
| dice-obsidian | Obsidian | Black polished volcanic glass, silver edge, icy numerals | Shine, rim metal, glow, stone mottling |
| dice-forged-steel | Forged Steel | Brushed gunmetal, steel bevels, engraved white numerals | Brush direction, finish, wear |
| dice-sapphire | Sapphire | Deep-blue translucent gem, silver detail | Tint, clarity, refraction-look, edge |
| dice-emerald | Emerald | Green translucent gem, gold detail | Tint, clarity, gold trim |
| dice-ruby | Ruby | Deep red translucent gem, bronze detail | Tint, clarity, engraved numerals |
| dice-celestial | Celestial | White stone/gold, star motifs, soft gold glow | Stars, trim, glow |
| dice-infernal | Infernal | Black stone and ember fissures, dark iron | Crack colour/intensity, wear |
| dice-ancient-bronze | Ancient Bronze | Aged bronze, carved numerals | Patina, ageing, metal polish |
| dice-marble | Marble | Polished stone with natural veins, metal inlay | Vein palette, inlay metal |
| dice-frost-crystal | Frost Crystal | Icy translucent crystal, silver edges | Frost, mist-look, icy tint |
| dice-nature | Nature | Dark carved wood, leafy vines, green inlay | Wood grain, leaf palette, emblem |
| dice-arcane | Arcane | Violet gem, silver runes, subtle illumination | Rune patterns, glow hue |

**Shared controls:** 8 material families; 16 base colour swatches + custom validated HEX; 12 number colour swatches + HEX; 8 readable numeral styles; 6 edge materials (iron, steel, bronze, silver, gold, none); 5 finishes (matte, satin, polished, brushed, weathered); 12 patterns; 12 special-face symbols; glow off/subtle/medium/strong; 4 wear levels. Display compatible controls only (e.g., brushed only on suitable surfaces). Each dice type may override a collection's base appearance.

### 1.2 Special dice 13 — Watcher Dice (animated eye-in-resin)

- **Asset:** translucent/gel-like resin die with a distinct eye inside (not merely a flat decal for the high-quality mode).
- **Eye type (6):** human, feline, dragon, reptilian, eldritch, celestial.
- **Iris:** 12 colour swatches + custom HEX; separate **sclera:** 6 defaults + HEX.
- **Pupil geometry (5):** round, vertical slit, horizontal slit, diamond, eldritch.
- **Eye glow:** off / subtle / medium / strong.
- **Resin body:** 16 colour swatches + custom HEX, transparency 4 settings, tint/finish and six internal swirl palettes.
- **Motion:** off / subtle / normal / lively; blinking off / rare / normal / frequent; cursor tracking off / on. Natural 1/20 reactions are cosmetic only; react **after** server result arrives.
- **Accessibility/performance:** respect reduced-motion, disable tracking when unfocused, static-eye or simplified translucent-look fallback on mobile/low GPU.
- **Feasibility gate:** Open Dice's published design API does not by itself guarantee independently moving interior 3D geometry. Prototype custom eye meshes, attachment transforms, depth/refraction/transparency and per-face readability before committing to live-in-die animation. Do not mislabel a flat texture as a true animated eye. If the test fails, retain a static Watcher preset and schedule animation in a distinct renderer-extension follow-up.

### 1.3 Special dice 14 — Familiar Dice (custom cats)

- **Default:** translucent clear/white resin, black feline motifs, metallic gold numerals, paw-print accent, inspired by the owner's supplied photo.
- **Cat coat palette:** 12 preset fur colours + custom HEX.
- **Coat pattern (8):** solid, tabby, tuxedo, calico, tortoiseshell, spotted, colourpoint, bicolour.
- **Eye colour:** 8 presets + custom HEX.
- **Cat pose motifs (8):** sitting, curled sleeping, stretching, walking, playful pounce, upright alert, perched, face portrait.
- **Paw-print colour:** 12 swatches + HEX.
- **Resin body:** 16 swatches + HEX and 4 transparency options; number colour 12 swatches + HEX; decorative icons 12.
- **Cat effects:** six candidate presets (paw sparkle, moonlit glimmer, tiny paw trail, soft halo, cat-eye wink, shimmer), all optional and subject to performance testing.
- **Animation:** off/on for restrained face/portrait animation; prevent visibility or numbering loss. These are **personalised artwork motifs**, not a generated moving miniature cat unless separately engineered.
- **Privacy/content constraints:** custom uploads not part of initial launch; preset motifs and editable colours only. Future personal artwork uploads must get asset validation, content moderation, ownership and permission checks.
- **Familiar linkage:** save the custom cat coat/eyes as a reusable visual profile; no new gameplay familiars or character statistics are introduced.

## 2. Realistic tray collection (6)

| ID | Design | Shape | Default materials |
|---|---|---|---|
| tray-obsidian-hexagon | Obsidian Hexagon | Hexagon | Obsidian frame, forged-steel bevel, slate/felt interior |
| tray-walnut-octagon | Walnut Octagon | Octagon | Walnut frame, midnight felt/velvet interior |
| tray-knights-iron | Knight's Iron Tray | Rectangle | Riveted iron, black leather |
| tray-arcane-circle | Arcane Circle | Circle | Carved slate, arcane centre engraving |
| tray-royal-marble | Royal Marble | Square | White marble, gold inlay |
| tray-hunters-leather | Hunter's Leather | Oval | Tooled stitched leather, timber core |

**Tray fields:** default family, shape (6), frame material (8), interior material (10), interior colour (16 + HEX), trim style (8), engraving pattern (12), centre emblem (16), lighting style (5), glow tint (12 + HEX), wear (4), impact sound material (6), size compact/standard/expanded. Permit shape overrides only where geometry supports them; do not claim every decorative family can be reshaped without rebuilding geometry.

**Realism:** physically based materials (PBR), albedo/base colour, normal detail, roughness, metallic values, environment reflections, bevels, contact shadows, appropriate soft/felt lighting, wear masks and collision sounds. Prefer shared texture atlases/LOD over unique heavy textures per combination. No purely flat CSS tray marketed as a physical 3D object.

**Physics gate:** current Open Dice default physics table does not automatically expose arbitrary tray-wall collision bodies. Prototype a controlled adapter or contained physics extension, with target-face verification and numeric fallback. Cosmetic tray frames may launch independently of physical wall collisions only when visibly labelled/displayed as a cosmetic stage.

## 3. Realistic tower collection (6)

| ID | Design | Default structure |
|---|---|---|
| tower-castle | Castle Tower | Stone turret, stairs/baffles and arched exit |
| tower-dragon | Dragon Tower | Dragon sculpture, scaled surface, mouth exit |
| tower-wizard | Wizard Tower | Arcane spire, rune windows and magical details |
| tower-dwarven-forge | Dwarven Forge | Stone/steel, gears, baffle plates, forge light |
| tower-nature | Nature Tower | Hollow tree, branches, roots and wood channels |
| tower-celestial | Celestial Tower | Marble columns, gold trim, luminous crystal |

**Tower fields:** structural family (6), geometry variation (standard/detailed/grand), base material (8), accent material (8), colour swatches (16 + custom), decorative trim (8), motif/engraving (12), magical lighting (6), glow colour (12 + custom), wear (4), impact sound family (6), connected tray preset (6). One tower+tray visual collection can reuse the shared material library.

**Physics gate:** develop playable \`tower-castle\` first, then validate deterministic replay of server faces after collisions, lifecycle cleanup, framerate, draw calls, mobile. Replacing Open Dice internal physics may require a custom extension. Do not mark other towers fully playable until verified; if native tower physics proves incompatible, keep the official result independent and provide a visually honest non-physics cinematic sequence or defer full towers to the later Asteria engine.

## 4. Shared customisation studio contract

### Modes
- **Basic:** choose saved preset, choose primary/secondary colours, toggle effects/animation, match tray+tower palette, preview and save.
- **Advanced:** compatible material controls, number fonts, inlays, physical finish, ageing, individual dice type overrides, eye/cat-specific controls, effect/audio details, graphics quality and tray/tower details.

### Visual preview
- Reusable render adapter; orbit/rotate and zoom **preview-only** (not roll result).
- Material/appearance preview must not trigger an official roll or change private history.
- Buttons: Restore preset, Undo/Redo local edits where feasible, Save/Save As, Duplicate, Delete (with confirmation), Make Default, Assign to Character.
- Show unsupported-feature and low-performance fallbacks clearly.
- Reuse existing dashboard canvas behaviour; do not add another independent resizable window system on top.

### Persistence
- New **versioned and validated preference records**, separate from authenticated roll history and the existing 24 gameplay dice presets.
- Initially **up to 20 saved appearance collections per account**; optional character override; account default; GM remains owner of GM display/permissions but not other users' private customisations.
- Use existing Firebase services and security rules; no new backend provider.
- Keep material IDs/configuration as data, never opaque executable objects. Validate/normalise allowed fields, value ranges, entity ownership and maximum serialized document size server-side; support future migrations.
- Distinguish *dice expression presets* (existing gameplay) from *appearance collections* (new visuals).
- User-created styles must never affect true die geometry, roll odds, authoritative RNG, criticals or resource calculations.

## 5. Proposed numbered build phases (one approval at a time)

### 3.1 — Catalogue definitions and material engine
- Deliver: schema, 14 dice/6 tray/6 tower preset IDs, compatibility rules, colour/font/pattern catalogs, PBR material definitions, versioned renderer adapter; concise technical feasibility audit.
- Tests: catalogue schema, defaults, invalid values, existing Phase 2 regressions.
- **Exit gate:** no breaking changes to Firebase dice, 3D existing rolls or UI. Owner review before 3.2.

### 3.2 — Twelve core realistic dice designs
- Deliver: all 12 core designs across d4/d6/d8/d10/d12/d20/d100, 3D previews, editable colours, numeral readability, trim/finish, realistic PBR.
- Tests: per-face geometry/textures, critical-face visibility, WebGL cleanup, mobile quality tier.
- **Exit gate:** designs do not change official results; no unexplained WebGL regressions.

### 3.3 — Familiar Dice (cat)
- Deliver: resin + 8 coat patterns, 12 coat colours, 8 cat eye colours, 8 poses, paw motifs, custom HEX, optional restrained visual animation.
- Tests: unique combinations, face numbering, contrast, mobile mode, reduced motion.
- **Exit gate:** 1 realistic featured Familiar preset plus editable variants verified.

### 3.4 — Watcher Dice (eye)
- Deliver: resin/gel style, editable eye type/iris/pupil/sclera and motion; build independently moving eye prototype only if compatible with the existing engine.
- Tests: face correctness after eye motion; translucency depth; performance, reduced motion, motion toggle, cursor interaction.
- **Exit gate:** demonstrated true 3D eye on supported devices *or* transparently defer animated interior and ship static fallback after approval.

### 3.5 — Six realistic 3D trays
- Deliver: 6 tray models, surface and material choices, matching palette presets, adjustable styles/sizes, ambient/contact shadows and appropriate impact audio.
- Tests: tray boundaries where supported, no clipping, physics correctness, resize, mobile LOD.
- **Exit gate:** truthful label and fallback for any purely cosmetic frames; server result preserved.

### 3.6 — Dice Customisation Studio
- Deliver: Basic/Advanced tabs, live camera controls, interactive previews, contextual special-set controls, colour pickers, visual presets and matching dice/tray/tower selections.
- Tests: accessibility/keyboard/touch, no horizontal overflow, no new rolls from previews, restore/undo behaviour.
- **Exit gate:** all planned user-visible selectors mapped to actual supported parameters (not decorative-only controls).

### 3.7 — Accounts, collections and assignments
- Deliver: up to 20 appearance collections, Save/Save As/duplicate/delete/default, per-character selection, Firebase permission checks, migrations, GM/player isolation.
- Tests: Firestore rules and emulator, cross-device persistence, schema migrations, owner isolation, no interference with historical dice presets/records.
- **Exit gate:** no new external services and no accidental global or campaign disclosure.

### 3.8 — Castle Tower interactive physics feasibility
- Deliver: detailed Castle Tower prototype, realistic PBR surfaces, internal chute/baffles and exit tray. Physics extension only if verified safe.
- Tests: >100 authoritative predetermined sample rolls covering all dice types, face agreement, memory, disabled effects, accessibility, mobile and critical rolls. A visual tower shell alone does not qualify as playable physics.
- **Exit gate:** independent owner review of feasibility before building the remaining five.

### 3.9 — Five remaining tower families
- Deliver: Dragon, Wizard, Dwarven Forge, Nature, Celestial towers, their three shape/decoration variations where feasible, tray pairing and shared physics adapter.
- Tests: geometry/physics per tower, result integrity, performance, cleanup and quality presets.
- **Exit gate:** support verified; partial tower availability must be clearly distinguished from completed interactive towers.

### 3.10 — Effects, audio, graphics and final QA
- Deliver: critical celebration/failure visuals, elemental effects starter set, configurable sound packs/mute, adaptive quality (high/balanced/performance and reduced-motion), final accessibility/performance review.
- Tests: all unit/browser/Firebase tests + physical desktop/mobile acceptance; production bundle sync; backward compatibility; no unintended deployments.
- **Exit gate:** fully green checks on latest \`Website-Build-Test\`, owner approval required to deploy.

## 6. Release and development rules

1. **Owner approves each numbered phase** before the next. Phase 3.1 is the first build; creating this document does not start it.
2. Work only on existing \`Website-Build-Test\`. Prefer targeted replacements/refactors; remove obsolete code in the same change rather than stacking systems.
3. Preserve Phase 1/2 and original Advanced Dice behaviour; do not alter UCRS, Combat Command Centre, critical, d10/d100, Firestore dice source or authoritative roll history without distinct approval.
4. Pin and validate external open-source library versions; keep licence/third-party notices.
5. CI: complete implementation, commit React/Vite generated assets, then run final repository-wide checks on that **same commit**; do not mark complete on a source commit whose generated bundle is still out of sync.
6. Never run live Firebase deployment without separate owner approval.
7. No timer-based assumptions or fabricated support: when advanced animated-eye or tower physics integration is infeasible, document the limitation and require owner sign-off for a fallback/deferral.

## 7. Pending art decisions

Catalogue names and counts above are a proposed working specification based on the approved 12+2 designs and six trays/six towers. The owner may still refine individual palette, motifs, eye types, cat poses, tower topology and art direction during the relevant approved phases. All final texture/model designs need 3D preview and sign-off before shipping.
