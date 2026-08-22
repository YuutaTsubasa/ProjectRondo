# ProjectRondo — Developer Handoff

Last updated: 2026-08-21. Purpose: everything the next machine / developer / Claude session needs to
pick this up cold. The repo is the source of truth; this file is the map.

## 1. What this is

A **3D action game for the web**, migrated from Godot 4 (C#) to a web-native stack. A hub world hosts
NPCs that lead into (future) Sonic-style 3D levels, Sonic-style 2D levels, and puzzle games (2048,
Sudoku). The original Godot project is preserved under `__prototype__/` as a behaviour reference.

**Stack:** Svelte 5 (runes) · TypeScript · `@babylonjs/core` + `@babylonjs/havok` (physics) +
`@babylonjs/loaders` · Vite · Vitest · Tauri v2 (desktop/mobile). **Package manager: pnpm.**

**Architecture discipline (non-negotiable):** a pure, engine-agnostic **domain** (`src/domain/`, no
babylon/Svelte/IO imports) drives a thin **presentation** layer. Presentation reads input → converts to
domain values → runs the pure step → applies the result to babylon/physics. Principles: **TDD, DDD,
functional core, reactive UI**, plus the project's **18 code-quality principles** in
`docs/engineering-principles.md`.

## 2. Repo layout

| Path | What |
| --- | --- |
| `src/domain/` | Pure TS: `hub/character/*` (movement), `dialogue/*` (dialogue graph + DSL), `math/`, `kernel/`. No engine imports. Vitest-covered. |
| `src/presentation/babylon/` | The 3D scene: `hubScene`, `terrainHeight` (pure) + `terrain`, `scatter`, `trees`, `knight`, `playerController`, `followCamera`, `input`, `environment`, `capsule`. |
| `src/presentation/dialogue/` + `src/app/` | Svelte AVG UI + app entry (`App.svelte`, `gameMode`). |
| `tests/` | Vitest specs — mirror the domain, plus pure presentation fns (`terrainHeight`, `cameraRelativeDirection`). |
| `docs/superpowers/specs/` + `plans/` | **Every feature has a design spec and an implementation plan here.** Read these for the "why". |
| `docs/engineering-principles.md` | The 18 principles (canonical). |
| `docs/superpowers/specs/2026-08-18-refined-hub-world-roadmap.md` | **The roadmap** — current milestone + what's next. |
| `__prototype__/` | Original Godot 4.7.1 (mono/C#) project — parity reference; also holds the GLB export tools (`tools/export_web_glb.gd`). |
| `public/` | Assets: `models/knight_web.glb`, `models/tree.glb`, `textures/grass.jpg`, `portraits/`, `fonts/`. |
| `src-tauri/` | Tauri v2 desktop shell (Rust). |

## 3. Setup on a new machine

**Prerequisites**
- **Node** (v24 used here) + **pnpm** (v11). `corepack enable` or install pnpm directly.
- **Git LFS** — REQUIRED. `.glb`/`.fbx`/`.blend`/`.vrm` are LFS-tracked (see `.gitattributes`). After
  cloning: `git lfs install && git lfs pull`, or the knight/tree models are just pointer files and the
  scene loads empty. (`.png`/`.jpg`/fonts are normal binaries and clone fine.)
- **Rust toolchain** — only needed for `pnpm tauri` desktop builds. Not needed to run in the browser.
- **Godot 4.7.1 (mono)** — only needed to *regenerate* the knight/tree GLBs from the prototype (rare).
  On the old machine it was at `/Applications/Godot_mono.app`; install wherever on the new one.

**Commands**
```bash
git lfs pull            # pull the LFS models after clone
pnpm install
pnpm dev                # Vite dev server → http://localhost:5173
pnpm test               # Vitest (domain + pure presentation)
pnpm exec tsc --noEmit  # typecheck
pnpm build              # static bundle → dist/
pnpm tauri dev          # native desktop app (needs Rust)
```

## 4. Current state (all merged to `main`, latest `34ede96`, no open PRs)

- **M1 — hub web parity:** third-person mouse-look knight (WASD/Space), pure-domain movement, Havok
  capsule, Idle/Walk animation blend.
- **M2 — AVG dialogue system:** pure dialogue-graph domain + a small DSL (`src/domain/dialogue/`),
  reactive Svelte AVG UI (portraits, backlog/LOG, AUTO/SKIP, branching choices), played on hub entry.
- **M3 — hub environment:** grassland ground, trees (glTF), procedural skydome, sun + shadows,
  procedural ground scatter (grass/flowers/rocks/bushes, thin-instanced).
- **M4 — refined hub world (in progress):**
  - **P1 terrain & collision** (PR #19): rolling terrain from a seeded `terrainHeight` + static MESH
    collider; tree-trunk + selected-rock colliders; the player rides the terrain.
  - **Map scale-up** (PR #21): field 50×50 → **100×100**; hard invisible walls replaced by a **natural
    terrain barrier** (edge ramps past the controller's walkable slope); grassy barrier slope; camera
    clamped above the terrain (no see-through on down-pitch/slopes).
  - **Run + jump** (PR #23): Mixamo Run/Jump retargeted onto the knight through the existing Godot
    pipeline; **Shift to sprint** (`runSpeed` 8, derived from the clips' measured stride); jump wired
    end to end; feet planted to **2.5 mm** on flat ground (was ~10 cm of float). Movement gained a
    single pure owner for ground contact (`groundContact.ts` — coyote time, jump buffering, takeoff
    guard) and slope-following (`slopeMotion.ts`), plus heading-based steering. Four gameplay bugs
    fell out of it: **jumping while walking was impossible**, gentle slopes cut running from 8 u/s to
    2.9, running turns had the model and the body pointing different ways, and landing sometimes
    played the jump clip's tail. See the design spec §11-16 for the measurements behind each.
  - **P2 lighting & atmosphere:** ACES tone mapping + exposure/contrast, restrained bloom, EXP2 distance
    fog, MSAA restored on the pipeline. Trees rebuilt off PBR (the only PBR surface fog actually reaches —
    the knight is PBR too but stays inside the ~1 % band, see §7 — and they fogged
    in linear space, which bleached them). Skydome gradient orientation fixed — it was inverted, rendering
    pale overhead. Design + all findings:
    `docs/superpowers/specs/2026-08-21-lighting-atmosphere-design.md` (§11–§12 are the measured record).
    **Deferred:** the mountain ridge still keeps a visible edge against the sky; the only remaining lever
    is `terrain.ts`'s `haze` colour, which is a human art-direction call (§11a).
  - **Knight face lighting:** the head — `Mesh_0` (face + hair + neck) plus the eyeballs `Mesh_32` /
    `Mesh_33` — gets its own material cloned off the single shared `Material_001`, with the albedo added
    back as emissive so the face stays bright and flat instead of tracking the sun. Head region mean
    luma 35.6 → 68.8 at the shipped 0.45 (0.25 gives 57.1), with the rest of the frame flat at 114.3 as
    a control — which is what says the 31 `tripo_part_*` armour meshes are untouched. Measure it with
    the idle animation paused and the head region located by which pixels the change touches, not by a
    hand-placed box; see `FACE_EMISSIVE` for why. Three things not to re-derive. The complaint was "the face is too dark, too affected by scene
    lighting, and the shadow on it looks bad" — **not** cel banding or outlines, neither of which was
    asked for. **That "shadow" is not a shadow:** `receiveShadows` is already `false` on all 34 skinned
    meshes, so nothing is cast onto the face; the dark band is the **N·L terminator**, the diffuse
    falloff on the side turned away from the sun, which is why the fix is an emissive floor rather than
    anything to do with the shadow generator. And **do not convert the knight to
    StandardMaterial** — that was tried on the theory that the trees' PBR-vs-gamma problem applied here
    too, and it does not (the knight sits ~5 units from the camera where fog is 0.14 %). The conversion
    made it markedly worse: near-black hair, grey face, dull armour.

## 5. What's next (the plan)

Read the roadmap: `docs/superpowers/specs/2026-08-18-refined-hub-world-roadmap.md` (M4 phases + §7b
scheduled additions). Sequence from here:

1. **Toon shading on the knight — the face is lit, the cel banding is not.** `knight.ts` gives the head
   its own material (§4); what is *not* built is hard light/shade banding or an outline. If those are
   wanted: Babylon has no built-in toon shader, so banding means a NodeMaterial that wires the fog block
   and the 101-bone skinning explicitly or the knight becomes the next odd-one-out (§7), while
   `mesh.renderOutline` is built in and is the cheap way to get the outline. Note `Mesh_0` is 242k of the
   character's ~320k verts — the GLB was texture-optimised but never decimated, which is a separate job.
2. **P3 — water & landmarks** (landmarks double as NPC / future mode-entry sites; the natural-barrier
   cliff aesthetic can finish here). Budget against the already-loaded scene (roadmap §7): the fps
   headroom the earlier phases left is what P3 spends. P2 measured its own cost at **0.3 ms** (1.837 ms
   pre-P2 → 2.137 ms shipped), so the whole frame is ~2.1 ms against a 16.7 ms vsync budget and the
   headroom is still roughly 8x (design spec §12).
3. **P4 — life & motion** (wind sway, drifting clouds, ambient creatures).
4. **Then: game modes** — Sonic-style 3D/2D levels, 2048, Sudoku (a new milestone, SP2+).

## 6. How work is done here (the workflow)

Every non-trivial feature runs the **superpowers** chain, and it shows in `docs/`:

`brainstorming` (clarify + design) → design spec in `docs/superpowers/specs/` → `writing-plans` →
`subagent-driven-development` (per task: implementer → spec-compliance review → code-quality review) →
**in-browser verification** → `superpowers:code-reviewer` and/or the user's `/code-review` → PR → merge.

- **Pure domain / pure functions get Vitest TDD** (red → green). **Presentation is verified in-browser**
  (screenshots + scripted checks) — babylon scene code isn't unit-tested.
- Reviews follow the 18 principles + TDD/DDD/functional/reactive lenses (see `reviewing-code` skill and
  `docs/engineering-principles.md`).

## 7. Gotchas that will save you hours (babylon / web)

These are hard-won; several cost a debugging session each.

- **Deep babylon subpath imports need side-effect imports.** A mesh with no explicit material throws
  "StandardMaterial needs to be imported before…" and renders nothing. Import the side-effect module
  (`import '@babylonjs/core/Materials/standardMaterial'`; likewise the physics component + glTF loader).
- **Displacing a `CreateGround`: use `setVerticesData`, not `updateVerticesData`.** On a non-updatable
  ground, `updateVerticesData` updates the CPU copy (so the MESH collider and `getVerticesData` see the
  relief) but **never reaches the GPU** — the mesh renders as a flat plane while the player rides the
  displaced collider. And `ComputeNormals` orients this ground's winding downward (renders black), so
  flip normals skyward. See `terrain.ts` — it documents both.
- **Verify the render, don't trust `getVerticesData`.** It reads the CPU copy, so it looks displaced
  even when the GPU is flat. Trust a screenshot / `gl.readPixels`.
- **A backgrounded/hidden preview pane pauses rAF** → `engine.getDeltaTime()` returns 0 → the player
  loop early-returns → holding WASD shows no movement even though the code is correct. To drive it
  headlessly: `engine.beginFrame(); busyWait(~16ms); scene.render(); engine.endFrame()` in a loop.
- **`window.hub` (the dev handle) goes stale across reloads** — re-read it after any reload.
- **Character/camera smoothing is spread across three files and they interact:** `playerController`
  (smooths the *visual* root Y — the capsule micro-oscillates on slopes), `followCamera` (terrain-
  anchored vertical follow + a clamp keeping the camera above the ground), and `knight` (per-frame
  foot-planting). Read their comments before touching any one of them. (The visual-Y smoothing is
  load-bearing, not redundant — a stale-by-one-frame `getAbsolutePosition` means the knight only
  imperfectly cancels the root Y.)
- **Knight animation pipeline:** export from Godot headless (`__prototype__/tools/export_web_glb.gd`),
  then **texture-only** gltf-transform (resize + webp). **Do NOT `simplify`/`quantize`/`resample`
  skinned meshes** — it corrupts the animation (feet slide). Bump `?v=N` on the GLB URL in `knight.ts`
  after rebuilding so browsers refetch.
- **Known, deferred:** landing from a run drops planar speed from 8 u/s to ~3.2 for ~0.4s (the capsule
  bounces on the rolling terrain at speed; the locomotion blend faithfully follows it down into walk and
  back). Physics, not animation — see the run/jump spec §15.
- **Rebuilding the GLB has three sharp edges** (full recipe in the README): Godot serves a **stale
  asset import** after you edit a `.import` file unless you delete `.godot/imported/<Name>.fbx-*`
  first — the bone renaming just silently does not apply; the mono build **needs the .NET 8 SDK**
  installed or it crashes before importing anything; and `pnpm dlx @gltf-transform/cli` **does not
  work on Windows** — install it with npm into a scratch dir and pin `sharp` to `0.34.5`. Godot
  **4.7.2 reproduces 4.7.1's output bit-for-bit**, verified by diffing the re-exported Idle/Walk
  against the shipped ones, so the version bump is safe.
- **Ground contact is deliberately not "what the probe said".** `groundContact.ts` is a small pure
  reducer that turns the Havok support probe plus a jump keypress into the `isGrounded` /
  `jumpRequested` the domain consumes, and it is unit-tested rather than debugged in the browser.
  Three measured reasons it exists: the probe **chatters** (walking sideways loses support on 84 of
  150 frames, in 1-8 frame bursts, as the capsule crosses collider triangles) so it carries coyote
  time and a jump buffer; a jump **has not cleared the floor** for its first few frames, so the probe
  still says SUPPORTED and re-grounding there would cancel the jump; and an earlier "any upward
  post-solve velocity means airborne" rule made **jumping while walking impossible** (uphill walking
  pushes the capsule up the whole time). Don't reintroduce that rule.
- Visuals read `player.isSupported` (the raw probe) and `player.justJumped` (the takeoff frame), not
  `motion.isGrounded`, which carries the jump-clearing guard.
- **The domain thinks in flat ground; `slopeMotion.ts` bridges that to sloped terrain**, by adding
  *only* the vertical climb that puts the velocity in the surface plane. Do not "fix" this by
  projecting the velocity onto that plane instead — projection shrinks the horizontal component, which
  the domain then reads back as its current speed, so running settles at
  `acceleration * delta / (1 - cos(slope))` (measured: **8 u/s down to 2.9 on a 4° rise**), and it
  swings the heading toward the contour, so running at a hill slides you sideways along it (measured:
  **62° of drift on a 27° slope**). The collider is also locally steeper than the height field — a 7°
  hillside gives ~19° contact normals — so both bite far sooner than the visible gradient suggests.
- **The character moves where it faces, and only the heading steers.** `turnRate` (rad/s) caps how fast
  the heading swings; speed is a separate scalar. Easing the *velocity vector* toward its new target
  instead makes turn radius scale with speed — a sprint took 0.6s to come round while the model turned
  in 0.2s, so the knight faced one way and slid the other. For the same reason `playerController` sets
  the model yaw straight from `motion.facing` with no second lerp: two smoothers means two headings.

- **Mixing PBR and StandardMaterial in one scene breaks fog.** PBR shades and blends fog in *linear*
  space; StandardMaterial blends in gamma space. Toward a near-white fog colour, a linear-space blend
  multiplies a dark pixel several-fold while the gamma-space one barely moves it — so with identical fog
  settings, PBR surfaces bleach to grey while everything around them looks untouched. Measured: a tree
  27 units out took a **0.32** fog blend where EXP2 asks for 0.04 and the grass beside it took 0.07. The
  hub is all StandardMaterial for this reason; glTF imports arrive as PBR and are converted in
  `trees.ts`. **The knight is still PBR** — it survives only because it stays close to the camera where
  fog is under 1 %. Give it a custom material and this bites.
- **Attaching a `DefaultRenderingPipeline` silently turns off MSAA.** `antialias: true` on the engine
  only anti-aliases the *default framebuffer*; a pipeline redirects the scene into an offscreen target
  where it does not apply, and Babylon defaults `pipeline.samples` to 1. Nothing errors — the image just
  gets more aliased. Set `pipeline.samples` explicitly (we use 4; 8 measured no better for double the
  cost).
- **`readPixels` after `endFrame()` may read a post-process render target, not the canvas.** It comes
  back a flat uniform colour and looks exactly like a broken scene. Call
  `engine.restoreDefaultFramebuffer()` first. Two related measurement traps: changing a material flag
  triggers **async shader recompilation**, so a reading taken immediately after can reflect the *old*
  shader (this produced a non-monotonic sweep and a confident wrong conclusion); and with the preview
  pane hidden `requestAnimationFrame` never fires, so frames must be driven manually with
  `beginFrame`/`render`/`endFrame` and awaiting a render observable will simply hang.
- **Swapping the material on a skinned mesh makes it vanish, silently.** A 101-bone skinned mesh needs
  a new shader variant compiled, and it renders as *nothing at all* until that finishes — long enough
  to look like the model is broken, and long enough to poison any measurement taken meanwhile.
  `await material.forceCompilationAsync(mesh)` before rendering or reading pixels. Waiting N frames
  does not work and neither does `mesh.isReady()`; both reported ready while the knight was invisible.
- **`material.dispose(false, true)` destroys textures the material only borrowed.** The second argument
  is `disposeTextures`. A throwaway probe material built from another material's textures shares them
  by *reference*, so disposing them takes out the real material too — the knight lost its albedo and no
  amount of restoring the material brought it back. Use `dispose(false, false)` whenever the textures
  came from somewhere else.
- **Measure image quality on whole frames, not sampled points.** An emissive floor exists for the
  *shaded* side of a surface; sampling lit pixels showed a 4x sweep moving them by 3/255, which read as
  "this lever does nothing". It was removed on that basis and sent 10.5 % of the frame to pure black.
  Whole-frame statistics (fraction at pure black, blown pixels, mean luma) would have caught it
  immediately — and did, once used.
- **Benchmark configs interleaved, never one block each.** A block-per-config run had the *same* config
  at 2.96 ms and 2.06 ms, and reported "bloom off" (1.778 ms) as *faster* than "whole pipeline off"
  (2.001 ms) — impossible, since bloom-off still pays for tone mapping that pipeline-off does not.
  Round-robin
  across configs with medians fixed it. Run-to-run spread here is ~30 %, so trust the *ordering* across
  several configs rather than any single number.

## 8. Claude's local memory (optional, but valuable for continuity)

The richest operational notes live in **Claude's machine-local memory**, not in git:
`~/.claude/projects/-Users-maplewing-Repos-ProjectRondo/memory/` — `babylon-web-verification.md`,
`godot-headless-verification.md`, `game-backlog.md`, `engineering-principles.md`,
`dotnet-test-roll-forward.md`, plus `MEMORY.md` (the index). The essentials are summarised above and in
`docs/`, so it's **not required** — but copying that `memory/` folder to the same path on the new
machine gives the next Claude session full continuity.

## 9. Quick "am I set up right?" checklist

- `git lfs pull` done, and `public/models/knight_web.glb` starts with `glTF` (not `version https://…`).
- `pnpm test` → all green.
- `pnpm exec tsc --noEmit` → clean.
- `pnpm dev`, open the URL → hub loads: the knight stands on rolling grass, an AVG intro plays, WASD
  moves, walking to the edge is blocked by a steep grassy slope (not an invisible wall).
