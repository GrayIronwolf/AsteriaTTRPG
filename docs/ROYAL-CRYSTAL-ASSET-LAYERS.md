# Royal Crystal dashboard — staged rollout

## Approved geometry
Asteria Player and GM customisable dashboards use three equal conceptual tracks on wide screens.
- Standard: 4/12 grid columns (one track)
- Long: 8/12 columns (two tracks)
- Full width: 12/12 columns (three tracks)
- At tablet widths, Standard occupies 6/12 and Long/Full 12/12.
- On mobile, all panels stack.
- Height grows with panel content; do not force a square ratio.

The resource bar, main navigation, GM sidebar, saved panel order, drag handles, add/remove library and panel content are not part of the reskin.

## Separate image layers
**A separate high-detail image asset pack was generated outside the repository. It must be uploaded before this design is considered visually finished.** The asset set includes:
- `button-steel-frame.png` fixed polished steel-and-gold outline
- `button-crystal-neutral.png` grayscale facet texture tinted using existing theme settings
- `header-steel-frame.png` fixed noninteractive header outline
- `panel-steel-frame.png` scalable thin panel frame (9-slice)
- `panel-obsidian-tile.png` separate interior
- original master image references and a sample `preview.html`

The HTML button is the semantic click target. The fixed frame and neutral crystal are decorative layers; live text remains HTML. The crystal and text should depress together in the frame on press, with mouse/touch/keyboard support. Headers remain noninteractive solid enamel with a dark centre and brighter edges. Existing header action buttons must not be suppressed.

## Unfinished deployment gate
- Upload actual layered PNG files into `assets/ui/royal-crystal/` and link them from a dedicated stylesheet/component.
- Check that metallic frame is fixed through every colour change.
- Use three-part scaling on buttons, nine-slice panels, and independent backgrounds.
- Compare screenshots at the same sizes as the approved reference and user mobile capture.
- Verify keyboard focus, press animations, layout editor, live website loading and caching.
- Do not merge a visual-only approximation or declare pixel match based on unit tests.
