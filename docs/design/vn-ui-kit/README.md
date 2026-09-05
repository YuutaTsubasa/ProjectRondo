# VN UI Kit — design reference

The designer's handoff for the AVG/dialogue UI, exported from Claude Design. **Reference material,
not application code** — nothing here is built, bundled, linted or typechecked, and nothing in
`src/` imports from this directory.

Open any `.dc.html` in a browser to view it; the two `.js` files are the exporter's runtime and must
sit beside them.

| File | What it is |
|---|---|
| `VN Parts - Light.dc.html` | The part library: 15 component families, each with its variants |
| `VN Screens - Light.dc.html` | Those parts composed into four 960x540 screens — in-game dialogue, main menu, save/load, backlog |
| `VN Parts - Dark.dc.html` | The Dark theme's parts. Its accent is lime `#ccff00`; Light has no lime at all |
| `VN Screens - Dark.dc.html` | The Dark theme's screens |
| `support.js`, `image-slot.js` | Claude Design's runtime. Vendor files, unmodified |

## What was built from this

Light only, and only the parts with state behind them — see
`docs/superpowers/specs/2026-09-05-vn-ui-kit-design.md` for the mapping, the contrast measurements,
and the three places the implementation deliberately departs from the kit.

Still unbuilt: the chapter card, bottom bar / main menu, sliders, toggles, small buttons, save-load
slots, window frame, UI accents, decoration lines, scroll bar, and the Dark theme.

## Two things to know before using these as a source

- **The icons live in the data, not the markup.** The HUD and system-icon blocks render
  `{{ h.icon }}`; the actual SVG paths are in the `hud` and `sysIcons` arrays near the foot of
  `VN Screens - Light.dc.html`. Reading only the markup gives the impression the kit ships no icons.
  It does.
- **These files pull fonts from the Google Fonts CDN.** The app cannot: it is CSP-constrained, so
  every face it uses is self-hosted from `public/fonts/`. Do not copy a `<link>` out of here.

## Not included

The export also carried an `uploads/` directory — two 1536x1024 PNGs, 5.1 MB, referenced by nothing
in these files. They are left out rather than committed; `.gitattributes` routes `*.webp` through
LFS but not `*.png`, so adding them would put 5 MB of binary directly in the history.
