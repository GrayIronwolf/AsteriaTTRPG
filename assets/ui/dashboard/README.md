# Asteria dashboard image layers

The seven production images are intentionally separate from content and controls.

Copy the seven WebP files from `Asteria_Dashboard_Assets_20261105.zip` into this directory **before merging PR #53**:

- `panel-frame-3x3.webp`
- `panel-frame-3x6.webp`
- `panel-frame-6x3.webp`
- `panel-frame-9x3.webp`
- `panel-backdrop-obsidian.webp`
- `panel-backdrop-slate.webp`
- `panel-backdrop-arcane.webp`

The supplied frames have truly transparent centres. They are intended to overlay CSS backgrounds, with live HTML header labels and panel contents above the texture. Frame size changes are keyed to `data-panel-size`; global and individual backdrop selection is keyed to `data-panel-background`.

**No placeholder artwork is allowed:** the exact approved reference assets must be used. Check appearance against original desktop and Android screenshots. Do not merge with any file missing, or if the frame is blurry or stretched.

Mouse-following BorderGlow files have been removed; other button presses and static effects remain.

## Approved panel headers

- `10004.png` is the original transparent blue centre fill.
- `10006.png` is the original transparent steel-and-gold header frame.

Both PNG files are preserved byte for byte. `css/asteria-panel-headers.css` layers
the fill inside the metal artwork and keeps the title as live, centred HTML text.
The visible header centre straddles the top panel rail; its right tip ends just
left of the panel midpoint. Header artwork is decorative and non-interactive;
existing header actions remain separate controls.
