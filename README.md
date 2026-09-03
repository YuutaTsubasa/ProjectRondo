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
| `public/models/` | `knight_web.glb` (baked Idle/Walk, texture-only optimized). |
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
browsers refetch it. Then delete the ~90 MB `__prototype__/knight_web.glb` intermediate and the
`knight_web*.png` / `.import` side files Godot's next scan drops next to it.

### Regenerating the knight's metallic/roughness map

`public/models/knight_mr.webp` packs the armour's roughness and metallic channels glTF-style
(roughness → G, metallic → B, alpha left opaque at 255 — Babylon reads roughness off metallic
texture's alpha by default, and `applyBodyPbr` in `knight.ts` turns that off precisely because this
map has none). **This recipe is a reconstruction, not a transcript of what actually produced the
shipped file** — no metallic or roughness source texture is committed alongside
`Material_Diffuse.jpg` / `Material_Normal.jpg` in
`__prototype__/Assets/Characters/MedievalKnight/knight.fbm/`, so there is nothing in the repo to
recover the original invocation from. Given the source roughness and metallic textures (same UV
layout, same resolution as each other), pack and encode them with the `sharp` already pinned above:

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
