# Asteria Phase 3 — approved button image layers

The two user-approved images are immutable visual masters:

- `approved-original-button-frame.png` (silver bevelled steel, gold pointed ends)
- `approved-original-crystal-centre.png` (blue gemstone, faceted highlights)

Both masters are supplied at 2172×724 PNG with an alpha channel. The eight optimized 4× WebP outputs were generated without changing the design:

| Family | Rendered CSS size | Frame | Crystal |
| --- | --- | --- | --- |
| Small | 160×40 | `button-small-frame.webp` | `button-small-crystal.webp` |
| Standard | 220×48 | `button-standard-frame.webp` | `button-standard-crystal.webp` |
| Long | 360×53 | `button-long-frame.webp` | `button-long-crystal.webp` |
| Icon | 53×53 | `button-icon-frame.webp` | `button-icon-crystal.webp` |

## Critical asset gate

These PNG and WebP files are prepared in the ChatGPT conversation artifact **Asteria_Button_Phase3_Approved_Layers.zip**, with all paths already under `assets/ui/buttons/`. The connected GitHub integration can write text/CSS/JS but cannot read local bytes directly or accept a local image filepath as a Git blob. **Do not merge this branch until the eight WebP files exist at the paths above**, otherwise the layered artwork will render missing.

The optional original PNG masters should also be committed to the same directory for future non-destructive resizing.

## Layer contract

- HTML retains existing real labels, click actions, keyboard focus and accessible text.
- The frame remains neutral steel/gold and is never recoloured.
- The crystal is an independent art layer, masked to its approved transparency, using the existing `--button-crystal-color` variable as a colour tint while preserving luminance and facets.
- Press transitions are visual only; active, hover, disabled and reduced-motion behaviours persist.
- Existing Phase 2 button sizes assign one of four image families via `data-asteria-button-size`.
- Preview and compare all four families on desktop and mobile before a release.
