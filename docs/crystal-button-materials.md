# Themeable crystal button materials

The shared menu buttons use their existing semantic element as the shape and
focus container, `::before` as the fixed forged-metal bezel and `::after` as the
inset crystal core. Top controls retain their 88px height; other menu controls
retain their existing shared dimensions. Labels, navigation and event handlers
are unchanged.

The steel layer has fixed neutral metal tokens, bright bevel ridges, dark
recesses and a neutral cast shadow. The inset is 10px for top controls and 6px for
other menus. The core uses the neutral optical planes in
`assets/ui/crystal-facets.svg`, an independently tinted base, edge reflections,
dark edge shading and an inner glow. The SVG has no embedded theme colour.
No bitmap button assets, skulls, spikes or decorative ornaments are used.

| Existing colour control | Crystal token source |
| --- | --- |
| Top menu buttons | `--asteria-top-menu-button` |
| Dashboard menu tabs | `--asteria-dashboard-tab` |
| Compendium / other menus | `--asteria-menu-button` |
| Global glow slider | `--asteria-glow-intensity` |

Each menu element exposes `--button-crystal-color`, `--button-crystal-highlight`
and `--button-crystal-glow`. Only the inner pseudo-element consumes those values.
The bezel uses `--button-metal-dark`, `--button-metal-mid` and
`--button-metal-light`; those values are not changed by the theme controller.
Hover brightens the core and lifts the neutral shadow. Selected/open states
highlight the core edge. Pressing shifts the button inward and compresses its
height slightly. Keyboard focus, disabled controls and reduced motion remain
supported.

The existing global colour wheel now updates areas still following the previous
accent. Independently customized areas and the panel background retain their
own colours. Presets, per-area controls and storage keep using the existing
theme settings and storage key.

Changed files: shared menu CSS, the neutral SVG, theme controller, HTML cache
versions, lint configuration/command and UI regression tests. Header artwork,
layout, source content, React bundles and Firebase integrations are unchanged.

Verification: full existing test suite, lint and production build; three focused
theme regression tests; browser navigation/player/GM flows at 320–2560px;
independent blue/red/green/purple/orange crystal changes with identical computed
metal layers; global wheel, reload persistence, zero glow, pressed depth,
keyboard selection and reduced motion. Authenticated UI checks use the existing
local fixture adapter described in `menu-button-redesign.md`.
