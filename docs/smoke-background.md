# Smoke background artwork and lighting

The supplied `9933.png` attachment is actually a 1536 × 864 JPEG. Its source SHA-256 is `715e77bed4986ffd00b04166d61bc22c296753a3cd5cf4f02776eb1cac8f50aa`.

`assets/themes/asteria-smoke-9933.webp` retains the source dimensions and colours (WebP quality 90, method 6). The 960 × 540 mobile version preserves the same aspect ratio and crop. No artificial upscaling or replacement artwork is used.

Each corresponding light mask has white RGB and an alpha channel derived from that image's luminance: `round(255 × (max(0, luminance − 24) / 231)^1.45)`. The masks use lossless WebP so lighting follows the supplied bright smoke without independently drawn paths. Black areas remain transparent.

The neutral artwork and coloured light share one fixed viewport, `cover` sizing and centred crop, including on mobile. Only the light layer animates: opacity for Pulse, background position for Wave, both for Pulse + Wave. Still and reduced-motion keep static lighting visible. Existing theme accent, glow and visibility variables control the effect; the existing local theme storage and UI controls are retained. No gameplay or Firebase data is involved.

Production is served from the repository by GitHub Pages at https://asteriattrpg.com/. Merging to main invokes the configured Pages build/deployment. Firebase deploys only the backend and is unnecessary for these static assets. Verify the Pages run succeeds and the deployed CSS and four WebP assets match the commit, then test Menu & Appearance → UI Theme on the live page.
