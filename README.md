# ProjectRondo

A 3D action game for the **web**, built with **Svelte 5 + TypeScript + babylon.js (Havok physics)**
and packaged for desktop/mobile with **Tauri v2**. A hub world hosts NPCs that lead into Sonic-style
3D levels, Sonic-style 2D levels, and puzzle games (Sudoku, 2048).

Engineering approach: **TDD + DDD + Functional + Reactive**.

> Migrated from Godot 4 (C#) to the web. The original Godot project is preserved under
> [`__prototype__/`](__prototype__/) as a behaviour reference.

> **Picking this up on a new machine?** Start with [`docs/HANDOFF.md`](docs/HANDOFF.md) — prerequisites
> (incl. **Git LFS**), current state, what's next, and the babylon gotchas.

## Layout

| Path | Purpose |
| --- | --- |
| `src/domain/` | Pure TypeScript domain — no engine/UI imports. Movement, kernel types. The single source of truth, independently testable. |
| `src/presentation/babylon/` | babylon.js scene: hub, follow camera, Havok character controller, glTF knight. Reads input → calls the domain → applies the result to the physics body. |
| `src/app/` | Svelte entry + full-window canvas. |
| `tests/` | Vitest specs (mirror the domain's former xUnit tests). |
| `public/models/` | `knight_web.glb` (baked Idle/Walk, texture-only optimized), `knight_mr.webp` (packed metallic/roughness map). |
| `src-tauri/` | Tauri v2 shell (desktop/mobile packaging). |
| `__prototype__/` | The original Godot 4.7.1 (mono/C#) project, kept as a parity reference. |

The domain holds engine-agnostic rules (e.g. `characterMovement.step`, a pure function) so they can be
test-driven fast without the engine. The babylon layer converts input into domain values, runs the pure
step, and applies the result to a Havok `PhysicsCharacterController`. Svelte hosts DOM UI.

Stack: `@babylonjs/core` + `@babylonjs/havok` + `@babylonjs/loaders`, Svelte 5 (runes), Vite, Vitest,
Tauri v2. Package manager: **pnpm**.

## What's playable now

A stylized 3D hub grassland — flat field with trees, a procedural skydome, sun/shadows, and ground
scatter (grass, wildflowers, rocks, bushes). A third-person, mouse-look knight (`WASD` move, `Space`
jump, click to capture the mouse) walks the field: movement is driven by the pure domain, the character
is a Havok capsule, and the knight is a glTF model with Idle/Walk animation blended by speed. Entering
the hub plays an AVG dialogue intro.

## Develop

```bash
# Install
pnpm install

# Run the domain tests
pnpm test

# Run in the browser (Vite dev server)
pnpm dev

# Run as a native desktop app (Tauri v2 — needs the Rust toolchain)
pnpm tauri dev
```

Open the printed URL (default http://localhost:5173). `pnpm build` produces a static bundle in `dist/`;
`pnpm tauri build` produces a desktop app bundle.

### Regenerating the knight GLB

The knight model + retargeted animations live in the Godot prototype. Re-export and optimize with:

```bash
# 0. Only when a clip's source or .import changed: rebuild the AnimationLibrary.
#    Godot can serve a stale import — delete .godot/imported/<Name>.fbx-* first or the bone
#    renaming silently does not apply.
Godot --headless --path __prototype__ --import
Godot --headless --path __prototype__ --script res://tools/extract_anims.gd

# 1. Export a GLB (mesh + Idle/Walk/Run/Jump) from Godot headless
Godot --headless --path __prototype__ --script res://tools/export_web_glb.gd

# 2. Texture-only optimization (do NOT simplify/quantize/resample — it corrupts the skeletal animation)
gltf-transform resize __prototype__/knight_web.glb /tmp/k.glb --width 1024 --height 1024
gltf-transform webp /tmp/k.glb public/models/knight_web.glb --quality 80
```

Bump the `?v=N` query on the GLB URL in `src/presentation/babylon/knight.ts` after rebuilding so
browsers refetch it. Then delete the 68 MB `__prototype__/knight_web.glb` intermediate and the
`knight_web*.png` / `.import` side files Godot's next scan drops next to it.

**Known defect in the currently shipped GLB: the `gltf-transform` pass writes default-valued scalars
as `0` instead of omitting them, and at least three of them ship this way.** `extensionsUsed` includes
`KHR_materials_emissive_strength`, and the material's `pbrMetallicRoughness`/`extensions` blocks read:

- `normalTexture: {"index": 1, "scale": 0}` — the base commit's GLB had no `scale` key at all (the
  glTF spec default, 1); `0` zeroes out the armour's normal map entirely (`knight.ts`'s
  `correctSharedNormalScale` corrects it at load time, before `applyBodyPbr`/`applyFaceMaterial` ever
  run — see `source.bumpTexture.level` there — and warns when it has to).
- `extensions.KHR_materials_emissive_strength.emissiveStrength: 0` (spec default 1) — Babylon maps
  this straight to `emissiveIntensity = 0`, which trips `swapHeadMaterial`'s guard in `knight.ts` on
  every load and would zero `FACE_EMISSIVE` if that guard did not pin it back to 1.
- `pbrMetallicRoughness.metallicFactor: 0` (spec default 1) — `applyBodyPbr` overwrites `metallic` only
  from inside its metallic/roughness texture's `onLoad` callback (see `knight.ts`), so this `0` is still
  in force before that map arrives and stays in force forever on a permanently failed fetch; it is
  currently benign on both those paths only because the GLB ships no `roughnessFactor` key, so
  roughness stays at the spec default 1, and metallic 0 with roughness 1 reads matte. It is the same
  defect as the other two above and would surface the moment a regeneration or reorder changed that.

Because this is a systematic property of the export pass and not three coincidences, **no scalar in
this GLB should be trusted without checking it against the glTF spec default** — do not stop at
`normalTexture` when regenerating. Neither `export_web_glb.gd` nor `knight.fbx.import` sets any of
these anywhere, so the values are coming from somewhere in step 1 or 2 above that has not been isolated
(Godot's glTF exporter, or the `gltf-transform` pass itself). Check every scalar in the freshly
exported GLB's JSON chunk against its spec default before shipping a regeneration, and drop the
corresponding load-time correction in `knight.ts` once a regenerated file ships the correct defaults
(or no key at all) on its own.

### Regenerating the knight's metallic/roughness map

`public/models/knight_mr.webp` packs the armour's roughness and metallic channels glTF-style
(roughness → G, metallic → B, alpha left opaque at 255 — Babylon reads roughness off metallic
texture's alpha by default, and `applyBodyPbr` in `knight.ts` turns that off precisely because this
map has none). **This recipe is a reconstruction, not a transcript of what actually produced the
shipped file** — no metallic or roughness source texture is committed alongside
`Material_Diffuse.jpg` / `Material_Normal.jpg` in
`__prototype__/Assets/Characters/MedievalKnight/knight.fbm/`, so there is nothing in the repo to
recover the original invocation from. Given the source roughness and metallic textures (same UV
layout, same resolution as each other), pack and encode them with `sharp`. It is not a dependency of
this repo — `package.json` declares none, and `pnpm-lock.yaml` only resolves `sharp@0.35.3`
transitively, as a build dependency of something else — so install it directly for this script, pinned
away from `0.35.x`: that version throws `colourspace: parameter space not set` on `.toColourspace(…)`,
this recipe's first call (the same failure the toolchain note below hits with `gltf-transform`'s
transitive `sharp`, and the same fix):

```bash
npm install sharp@0.34.5
```

```js
// pack-mr.js: node pack-mr.js roughness.png metallic.png public/models/knight_mr.webp
const sharp = require('sharp');
const [roughPath, metalPath, outPath] = process.argv.slice(2);

Promise.all(
  [roughPath, metalPath].map((p) =>
    sharp(p).toColourspace('b-w').raw().toBuffer({ resolveWithObject: true }),
  ),
).then(([rough, metal]) => {
  // `toColourspace('b-w')` does not drop an alpha channel: an RGBA source — ordinary for a PBR
  // texture set — comes back with channels === 2 (grey + alpha), and indexing `.data[i]` below as if
  // it were 1 byte/px would interleave alpha into the packed G/B channels with no error raised.
  if (rough.info.channels !== 1 || metal.info.channels !== 1) {
    throw new Error(
      `expected greyscale (1 channel) sources, got roughness=${rough.info.channels} metallic=${metal.info.channels} — strip alpha first`,
    );
  }
  // Same reasoning as the channel guard above: `metal.data[i]` below is indexed against
  // `rough.info`'s width/height with nothing checking the two sources agree. A smaller metallic
  // source reads `undefined` past its end, which a `Buffer` write coerces to 0 — the tail of the
  // armour would silently read as fully dielectric. A different width at the same byte count
  // offsets every row of B against G with no error either. Fail loudly instead of packing a
  // silently-scrambled buffer.
  if (rough.info.width !== metal.info.width || rough.info.height !== metal.info.height) {
    throw new Error(
      `expected roughness and metallic sources at the same resolution, got roughness=${rough.info.width}x${rough.info.height} metallic=${metal.info.width}x${metal.info.height}`,
    );
  }
  const { width, height } = rough.info;
  const rgba = Buffer.alloc(width * height * 4, 255); // alpha stays opaque
  for (let i = 0; i < width * height; i++) {
    rgba[i * 4 + 1] = rough.data[i]; // roughness -> G
    rgba[i * 4 + 2] = metal.data[i]; // metallic  -> B
  }
  // Lossless, NOT the `quality: 80` the baseColor recipe above uses: lossy WebP is always YUV 4:2:0,
  // which would chroma-subsample G and B to half resolution and cross-contaminate them through the
  // RGB→YUV round trip — exactly the two channels this map exists to keep independent. That trade is
  // fine for a colour map; it is not for a data map.
  return sharp(rgba, { raw: { width, height, channels: 4 } })
    .webp({ lossless: true })
    .toFile(outPath);
});
```

Bump `BODY_MR_URL`'s `?v=N` in `knight.ts` after rebuilding, for the same cache-busting reason as the
GLB above.

**The currently committed `public/models/knight_mr.webp` was built with the lossy `quality: 80`
recipe** (its header is `RIFF … WEBP VP8 ` — lossy, not `VP8L`), before this was corrected to
`lossless: true`. It should be re-packed once the roughness/metallic source textures are to hand; they
are not in this repo (that gap is why the recipe above has to be a reconstruction), so it cannot be
regenerated in this PR.

Re-packing changes the G (roughness) and B (metallic) values this map carries, which invalidates
`BODY_METALLIC` and `BODY_DIRECT_INTENSITY` in `knight.ts` — both, and the "~36% of texels the packed
map flags as metal" figure quoted in `BODY_METALLIC`'s comment, were measured through today's lossy
map. Re-measure both constants against the re-packed map before trusting them.

**Adding an animation:** drop the FBX in `__prototype__/Assets/Animations/` (LFS-tracked), run step 0
once so Godot writes a default `.import`, copy the `_subresources` bone_map block out of
`Walking.fbx.import` into it, add the clip to `SRC` in `tools/extract_anims.gd` (and to `NON_LOOPING`
if it is a one-shot), then run the whole recipe.

**Toolchain notes.** Godot 4.7.2 reproduces 4.7.1's export bit-for-bit (verified against the shipped
Idle/Walk data), and the mono build needs the .NET 8 SDK present or it crashes on startup.
`pnpm dlx @gltf-transform/cli` **fails on Windows** — pnpm's hard-linked store breaks the CLI's peer
resolution; `npm install @gltf-transform/cli@4.4.2` into a scratch dir instead, with an
`overrides: { "sharp": "0.34.5" }` pin (its transitive `sharp@0.35.x` throws
`colourspace: parameter space not set` on the 8192² source textures).

### Regenerating the AVG portrait assets

`public/portraits/` holds four files, and the code depends on properties of each that no build step
enforces — see `tests/presentation/dialogue/portraitAssets.test.ts`, which asserts them.

**Two ffmpeg traps make this pipeline easy to get wrong in ways every obvious check survives**, so
read these before re-encoding anything:

1. **ffmpeg's native `vp9` decoder silently drops this source's alpha**, decoding to `yuv420p`. Every
   downstream encode then inherits an opaque background and the portrait renders as a black
   rectangle over the scene. `-c:v libvpx-vp9` **on the input** reads it correctly. This shipped
   once.
2. **`ffprobe` and "extract a frame to RGBA" both report alpha on a file that has none** — the first
   reports the decoder's output format, the second pads alpha to 255. Only sampling a decoded
   pixel's alpha is honest. A 1x1 `crop` also rounds to zero on subsampled video, so convert with
   `format=rgba` first.

The source is the background-removed idle clip from the character hand-off (768x1344, VP9 with
alpha, 24fps, 124 frames, 5.192s). **It is not committed** — the same gap the metallic/roughness map
above describes, and the three knight encodings cannot be reproduced without it. The probe is the
exception and the one that matters most: it is synthesised from nothing, so its recipe below is
complete on its own.

```bash
SRC=magnific_video-background-removal_8aHGVd3IrU.webm   # not in the repo

# knight_idle.webm — VP9 with alpha, the upgrade path. 514x900 (from -2:900), 12fps, 62 frames.
ffmpeg -c:v libvpx-vp9 -i "$SRC" -vf 'scale=-2:900,fps=12' \
  -c:v libvpx-vp9 -pix_fmt yuva420p -b:v 0 -crf 34 -row-mt 1 -an \
  -fflags +bitexact -flags:v +bitexact public/portraits/knight_idle.webm

# knight_idle.webp — animated WebP, the universal baseline. Same geometry and length, ~6x the bytes.
ffmpeg -c:v libvpx-vp9 -i "$SRC" -vf 'scale=-2:900,fps=12' \
  -c:v libwebp_anim -pix_fmt yuva420p -lossless 0 -q:v 35 -loop 0 -an public/portraits/knight_idle.webp

# knight_idle_still.webp — frame 0, shown while the probe runs, under prefers-reduced-motion, and as
# the <video> poster. Every cold load fetches it, on every path, so quality is chosen against the
# frame that replaces it: at q90 the mean RGB delta from the WebM's frame 0 is 2.57/255 where a
# lossless encode reaches 1.98 — the floor, since the reference is itself lossy VP9 — for a third of
# the bytes. If a re-encode of this file comes out opaque, it is trap #1, not the lossy encoder.
ffmpeg -c:v libvpx-vp9 -i "$SRC" -vf 'scale=-2:900,fps=12' -frames:v 1 \
  -c:v libwebp -lossless 0 -q:v 90 -pix_fmt bgra public/portraits/knight_idle_still.webp

# vp9-alpha-probe.webm — 2x2, one frame, every pixel fully transparent. Decoded to a canvas at
# runtime to find out whether the engine honours VP9's alpha at all; if this file is ever opaque the
# probe answers "supported" everywhere and the black rectangle ships. Needs no source.
ffmpeg -f lavfi -i 'color=c=black@0.0:s=2x2:r=1:d=1,format=rgba' \
  -c:v libvpx-vp9 -pix_fmt yuva420p -frames:v 1 \
  -fflags +bitexact -flags:v +bitexact public/portraits/vp9-alpha-probe.webm
```

**This is a reconstruction, and it was checked rather than remembered: re-running all four against
the source reproduces the shipped files byte-for-byte.** That is worth having rather than
approximating, because it means any diff at all after a re-encode is a real change and not noise to
squint past.

Getting there needed the `bitexact` flags on the two WebM encodes. Without them the matroska muxer
writes a randomly generated `TrackUID` (element `0x73C5`) twice, and two runs over identical input
differ in exactly those 16 bytes — at offsets 283 and 407 — with every byte of encoded video
identical. libvpx itself is deterministic here; only the container was not.

After regenerating, run `pnpm test` with ffmpeg **and ffprobe** on PATH. Four asset cases skip
silently without them, and they are the ones that would catch a lost alpha channel in any of the
three portraits or in the probe, a WebM frozen on one frame, and a WebM whose loop no longer runs as
long as the WebP it stands in for. (The check that the *still* has not become animated reads its
chunks directly, so that one runs either way.)

## Milestones

- **M1 — Hub web parity** *(done)* — third-person mouse-look knight, pure-domain movement, Havok
  capsule, Idle/Walk blending.
- **M2 — AVG dialogue system** *(done)* — dialogue-graph domain + DSL, reactive AVG UI (portraits,
  backlog, AUTO/SKIP, branching choices), played on hub entry.
- **M3 — Hub environment** *(done)* — grassland ground, trees, skydome, sun/shadows, procedural ground
  scatter (grass, wildflowers, rocks, bushes).
- **M4 — Refined hub world** *(current)* — terrain & collision, lighting/atmosphere post-processing,
  water & landmarks, life & motion. Roadmap:
  [`docs/…/2026-08-18-refined-hub-world-roadmap.md`](docs/superpowers/specs/2026-08-18-refined-hub-world-roadmap.md).

**Next (after M4): game modes.** Reached from NPC / landmark entry points in the hub — Sonic-style 3D
and 2D levels, and puzzles (2048 + Sudoku).
