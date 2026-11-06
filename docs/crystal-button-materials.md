# Themeable crystal button materials

Phase 3 uses the approved layers from `Asteria_Button_Phase3_Approved_Layers.zip`.
The original filenames and bytes are retained in `assets/ui/buttons/`; see that
folder's README for the four frame/crystal pairs and their design dimensions.
The two approved source PNGs are retained alongside the eight runtime WebPs.

`css/asteria-button-images.css` loads after the Phase 2 sizing stylesheet. It
replaces the old generated bezel, SVG sidewall and procedural crystal painting
on shared menu buttons. The semantic elements, labels, event handlers and
navigation routes remain unchanged. Unclassified shared menu controls use the
standard image pair without being forced into a new size family; tiny gameplay
controls are not reclassified.

The `::before` layer contains only the supplied metal frame and stays stationary
above the crystal. The `::after` layer contains the supplied crystal image,
alpha-masked to its own silhouette. Luminosity blending preserves its facets and
highlights while the existing colour tokens tint only the crystal.

| Existing colour control | Crystal token source |
| --- | --- |
| Top menu buttons | `--asteria-top-menu-button` |
| Dashboard menu tabs | `--asteria-dashboard-tab` |
| Compendium / other menus | `--asteria-menu-button` |
| Global glow slider | `--asteria-glow-intensity` |

Hover and selected/open states brighten the crystal. Pressing moves the crystal
and label using the existing `--button-travel` token; the metal frame stays fixed.
Keyboard focus, disabled states, native Enter/Space activation and reduced motion
remain supported. Phase 2 remains responsible for responsive sizes; its minimum
height and inline-padding metadata take precedence over the old shared skin.

Panel frames and panel-header artwork use their separate existing stylesheets.
