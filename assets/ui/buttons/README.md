# Approved button layers — Phase 3

The ten images in `Asteria_Button_Phase3_Approved_Layers.zip` are preserved byte
for byte with their original filenames. The eight WebP files are the runtime
layers; the two `approved-original-*.png` files retain the approved source art.

| Family | Design size | Crystal | Metal frame |
| --- | --- | --- | --- |
| Small | 160 × 40 | `button-small-crystal.webp` | `button-small-frame.webp` |
| Standard | 220 × 48 | `button-standard-crystal.webp` | `button-standard-frame.webp` |
| Long | 360 × 53 | `button-long-crystal.webp` | `button-long-frame.webp` |
| Icon | 53 × 53 | `button-icon-crystal.webp` | `button-icon-frame.webp` |

`css/asteria-button-images.css` replaces the old procedural menu graphics after
the Phase 2 sizing stylesheet. Unclassified shared menu buttons use the standard
artwork while keeping their existing dimensions. Tiny gameplay controls are not
reclassified or resized. Panel header artwork remains separate.

The metal frame stays stationary and does not consume theme colour tokens. The
crystal is alpha-masked to its supplied silhouette and uses the existing colour
and glow settings. Native labels/actions, selection, focus, disabled states,
mouse/touch/keyboard presses and reduced-motion behavior remain supported.
