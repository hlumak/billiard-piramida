# Brand assets

Design sources — nothing here is served. Shipped assets live in `apps/web/public/`.

| File                | What it is                                                      |
| ------------------- | --------------------------------------------------------------- |
| `logo1–4.jpeg`      | Original supplied artwork (raster). `logo2` is the highest-res. |
| `logo-on-light.svg` | Lockup in the dark-green colourway, for light backgrounds.      |
| `logo-mark.svg`     | Emblem alone (arcs + crescent), gold, transparent.              |

The vector lockup was traced from `logo2.jpeg` and re-drawn against the site
palette (`--color-golden`, `--color-creme`, `--color-club-green`); the emblem's
ring, crescent and rules are analytic geometry rather than traced curves.

Derived, in `apps/web/public/`:

- `logo.svg` — lockup for club-green surfaces (used by `BrandLogo`)
- `favicon.svg`, `favicon.ico`, `favicon-{16,32,48}.png`
- `icons/apple-touch-icon.png`, `icons/icon-{192,512}.png`, `icons/icon-maskable-512.png`
- `og-image.jpg`

The icons use a **P monogram inside the emblem** — the full lockup is illegible
below ~128 px — and thicken the ring and crescent as the size drops.
