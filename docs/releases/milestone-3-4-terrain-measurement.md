# Milestone 3.4 — terrain, grids and measurement

## Branch and release control

- Feature branch: `milestone-3-4-terrain-measurement`, based on the verified Milestone 3.3 branch.
- Integration target: `Website-Build-Test` only, **after** PR #394 is merged.
- No merge to `main`, live deployment, Firebase production rule change or automatic publishing is authorised.
- Do not merge while GitHub Pages could publish the test branch to the live domain.

## Implemented foundation

### Terrain map model
- Map settings now persist `gridType: square | hex` and bounded sparse `terrainCells` keyed by `column,row`.
- Types: plain, difficult, wall, water, hazard, cover, stairs; optional elevation is -100 to +100 m to two decimal places.
- Maps retain existing square-grid scale and geometry if the new fields are absent.
- New maps open at 3 metres per cell; existing maps retain their stored scale and the legacy fallback.
- Resizing the grid remaps terrain by relative cell centre; the GM should inspect merged cells after shrinking.
- All terrain authoring is GM-only. Hazard labels are intentionally omitted from the public projection; all other public terrain is filtered against existing fog.

### Travel and map interaction
- Square traversal retains the alternating diagonal cost and no-corner-cutting rules from Milestone 3.3.
- Pointy-top, odd-row hex geometry uses six neighbouring cells, server-derived nearest-hex picking and matching centres and SVG polygons.
- Difficult terrain costs double horizontal travel for ordinary ground movement.
- Walls and deep/unapproved water block ordinary ground travel and landing. Swimming can enter water.
- Elevation differences over 1.5 m block ordinary ground paths unless a stair cell is involved. Vertical travel is included in the calculated range and must still be adjudicated for exceptional abilities by the GM.
- Flight, jump and teleportation retain their source-approved range and legal landing rules; terrain mechanics do not bypass the underlying action permission system.
- GM map editor supports terrain painting and height input. Combat-linked map geometry and terrain remain locked in the verified media adapter and legacy editor.
- The shared canvas renders square or hex grid outlines, mapped terrain, reachable cells and route overlays. Ruler uses hex-step distance for hex maps and the existing direct-distance model for square maps.

### Non-goals of this milestone
- Cover is a marker for GM adjudication and does not automatically modify attack rolls yet.
- Hazard damage and terrain effects require source-specific combat resolution; hazards are not an invented automatic damage rule.
- Automatic vision, line of sight and fog revealing belong to Milestone 3.5.
- Terrain maps are not a substitute for a redacted map artwork asset: published original images/videos must be safe for players.

## Verification and acceptance

- Test sparse validation, resizing, wall/water/difficult/elevation constraints, hex neighbour connectivity, coordinates and snapping, ruler geometry, public terrain filtering, and legacy square maps.
- Run combat and media integration tests, lint, Firebase integration and browser acceptance on the final head.
- Generate and commit matching frontend bundle assets before merge.
- Confirm full GitHub Actions success and verify test-branch publishing safeguards before retargeting/merging.
- Manual cross-browser and GM/player session tests remain required before production deployment.
