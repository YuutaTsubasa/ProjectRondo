# Environment credits

## `studio.hdr` — the armour's image-based lighting

**This file is not reproducible, and that is a known defect rather than an oversight to be quietly
lived with.** It is a committed 512 KB binary whose only stated provenance is its own RGBE header
comment:

```
# Neutral studio IBL, procedurally generated ? see scratchpad/gen_studio_hdr.cjs
```

(the `?` is a literal 0x14 byte in the file, where an em dash did not survive whatever wrote it)

`scratchpad/gen_studio_hdr.cjs` is not in this repository, is not in `.gitignore` (so it was never a
deliberately-ignored working file either), and is not on the machine that produced the panorama. The
file has exactly one commit in this repository's history, the one that added it. Compare
`public/audio/`, whose shipped set is regenerated from raw sources by the committed
`tools/audio/preprocess.mjs`; there is no equivalent here.

**Consequences, so nobody discovers them the hard way.** The panorama cannot be re-baked brighter,
darker, at a higher resolution, with a warmer tint, or with the key light moved. `IBL_INTENSITY` in
`src/presentation/babylon/environment.ts` is the only lever over the armour's environment lighting,
and its doc says so. Anything the intensity scalar cannot reach means authoring a *new* panorama and
re-tuning that constant against it.

Recovering the generator from the pixels was attempted and did not work: the vertical gradient does
not fit any of the obvious closed forms (linear or power in elevation, linear or power in
`cos(theta)`, exponential in either, log-space or gamma-space interpolation between the zenith and
nadir values), so writing a "generator" would have meant fitting a curve and presenting it as the
original recipe.

**What it is.** Every figure below is printed by `node tools/env/inspect_studio_hdr.mjs`, which reads
them out of the file — run it rather than trusting this table, and use it to measure any replacement
against the same properties.

| | |
| --- | --- |
| Format | Radiance RGBE (`#?RADIANCE`, `FORMAT=32-bit_rle_rgbe`), 130-byte header |
| Storage | flat scanlines, not RLE — 512×256×4 = 524 288 bytes of payload, 524 418 on disk |
| Projection | equirectangular, 512 × 256 (`-Y 256 +X 512`) |
| Colour | strictly greyscale: R = G = B in every one of the 131 072 pixels, so it tints nothing |
| Radiance range | 0.1196 to 8.75 |
| Mean radiance | 1.0756, solid-angle weighted |
| Vertical gradient | 2.359 at the zenith, 0.465 at the horizon, 0.120 at the nadir (row minima) |
| Soft lights | three: 8.75 at azimuth 230° / elevation 36°, 4.09 at 336° / 63°, 3.22 at 105° / 20° |

Babylon resamples it to a 128-pixel cube face (`IBL_FACE_SIZE`) and prefilters a roughness mip chain
on load, so the 512 × 256 source resolution is not what the armour reflects — see the comments in
`environment.ts`.

**If you replace it,** commit the generator or the source alongside it, add a row here, and re-measure
`IBL_INTENSITY` — the luma figures in its doc were taken against *this* panorama.
