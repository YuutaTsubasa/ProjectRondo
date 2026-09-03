# ProjectRondo — Developer Handoff

Last updated: 2026-08-24. Purpose: everything the next machine / developer / Claude session needs to
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
| `public/` | Assets: `models/knight_web.glb`, `models/knight_mr.webp`, `models/tree.glb`, `textures/grass.jpg`, `portraits/`, `fonts/`. |
| `src-tauri/` | Tauri v2 desktop shell (Rust). |

## 3. Setup on a new machine

**Prerequisites**
- **Node** (v24 used here) + **pnpm** (v11). `corepack enable` or install pnpm directly.
- **Git LFS** — REQUIRED. `.glb`/`.fbx`/`.blend`/`.vrm`/`.webp` are LFS-tracked (see `.gitattributes`).
  After cloning: `git lfs install && git lfs pull`, or the knight/tree models (and `knight_mr.webp`, the
  armour's metallic/roughness map) are just pointer files — the scene loads with the knight's armour
  stuck matte and a console warning instead of empty, since only that one texture fetch fails. (`.png`/
  `.jpg`/fonts are normal binaries and clone fine.)
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

## 4. Current state (M1–M4/P2 merged to `main`; **P3 is open as a PR**, branch `claude/p3-water-landmarks`)

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
  - **Knight face lighting:** the head — `Mesh_1` (hair only — no face, no neck, no skin), `Mesh_20`
    (the face/head skin, reaching below `Mesh_1`'s bottom into the collar region — see
    `HEAD_MESHES` in `shadowPolicy.ts` for the per-mesh vertex counts and Y-extents that settled
    this), and the eyeballs `Mesh_43` / `Mesh_46` — gets its own material cloned off the single
    shared glTF material, with the albedo added back as emissive so the face stays bright and flat
    instead of tracking the sun. Head region mean luma 35.6 → 68.8 at the shipped 0.45 (0.25 gives
    57.1), with the rest of the frame flat at 114.3 as a control — which is what says the body meshes
    are untouched. **That table is from the previous character's two-mesh head (`Mesh_0` +
    `Mesh_32`/`Mesh_33`), not the current four-mesh head above, and has not been retaken** — a
    different head mesh with a different face texture in a different frame composition cannot
    reproduce it. `FACE_EMISSIVE` was tuned against those numbers, so the constant is inherited and
    unverified for this model; re-measure both the table and the constant on the current head before
    relying on either. Measure it with the idle animation paused and the head region located by which
    pixels the change touches, not by a hand-placed box; see `FACE_EMISSIVE` for the method.

    **Body PBR (medieval-knight swap):** the armour, previously baseColor+normal only, now also gets a
    packed metallic/roughness map (`public/models/knight_mr.webp`, glTF-style: roughness → G, metallic
    → B), applied by `applyBodyPbr` in `knight.ts` after the face clone so the two never fight over the
    shared material. `BODY_METALLIC` is deliberately held at 0.6 rather than the physically-correct 1
    — this scene has no environment texture, so a fully metallic surface has nothing to reflect and
    renders near-black — and `BODY_DIRECT_INTENSITY` (1.6) compensates the armour's direct-light
    response for that same missing IBL. `backFaceCulling` is off on the body only, closing see-through
    seams where the armour's single-sided shells don't quite meet. All three are measured constants;
    see their doc comments in `knight.ts` for the tables, and re-measure before changing any of them.

    Three things not to re-derive. The complaint was "the face is too dark, too affected by scene
    lighting, and the shadow on it looks bad" — **not** cel banding or outlines, neither of which was
    asked for. **That "shadow" is not a shadow:** `receiveShadows` is `false` on the four `HEAD_MESHES`
    (`Mesh_1`, `Mesh_20`, `Mesh_43`, `Mesh_46`) — the shadow-quality PR makes the other 43 body
    meshes receive, but the face stays excluded — so nothing is cast onto the face; the dark band
    is the **N·L terminator**, the diffuse falloff on the side turned away from the sun, which is
    why the fix is an emissive floor rather than anything to do with the shadow generator. And **do
    not convert the knight to StandardMaterial** — that was tried on the theory that the trees'
    PBR-vs-gamma problem applied here too, and it does not (the knight sits ~5 units from the camera
    where fog is 0.14 %). The conversion made it markedly worse: near-black hair, grey face, dull armour.
  - **P3 water & landmarks:** a wadeable **pond** — a `StandardMaterial` disc at (−15, −0.95, −5),
    radius 12, procedural scrolling ripple normals, opacity Fresnel, **no collider** so the player
    wades the terrain underneath — and a **stone colonnade** as the hub's destination: eight pillars
    on a radius-8 ring at (−6, 32) plus a central pedestal, each a static `PhysicsAggregate`, pillars
    seated individually on the terrain but sharing one crown height (base spread 1.237, crown spread
    **0**). Both sit on the existing height field; `terrainHeight.ts` is untouched.
    Design + the measured record: `docs/superpowers/specs/2026-08-24-water-landmarks-design.md`
    (§9 is the measurements). Costs **0.09–0.26 ms/frame** of a 16.7 ms budget, effectively all of it
    the landmark; the water is at the noise floor.

    P3 also exposed a **pre-existing `knight.ts` bug** that was latent since foot-planting was
    written (§7): the visual knight was planted against `terrainHeight`, the height *field*, so it
    rendered *through* anything with its own collider. On the pedestal the capsule was correctly at
    1.843 on a 1.717 top while the model's lowest vertex sat at 1.167 — exactly the terrain height,
    0.55 low. Now planted against a downward physics raycast, falling back to `terrainHeight` on a
    miss. This is not a P3 bug; P3 was just the first thing built that the player stands *on*.

## 5. What's next (the plan)

Read the roadmap: `docs/superpowers/specs/2026-08-18-refined-hub-world-roadmap.md` (M4 phases + §7b
scheduled additions). Sequence from here:

1. **Toon shading on the knight — the face is lit, the cel banding is not.** `knight.ts` gives the head
   its own material (§4); what is *not* built is hard light/shade banding or an outline.

   If those are wanted, check `@babylonjs/materials` first: it ships `CellMaterial`, a cel shader with
   `computeHighLevel` banding that inherits the standard bone/fog/instance define handling, so it
   needs neither a manual fog block nor explicit 101-bone skinning, and being gamma-space it lands on
   the *same* side of the §7 fog-space split as the trees rather than making the knight the next
   odd-one-out. It is **not installed** (only `core`, `havok`, `loaders` are), so it is a dependency
   decision rather than a free win. Failing that, banding means a NodeMaterial that wires the fog
   block and the 101-bone skinning explicitly. Either way `mesh.renderOutline` is built into `core`
   and is the cheap way to get the outline.

   Note: the previous character's `Mesh_0` was 242k of its ~320k verts — that measurement is from the
   character this repo no longer ships (`Mesh_0` is a body mesh on the current knight, not the head)
   and has not been retaken. The current GLB was texture-optimised but never decimated either, which
   is still a separate job; re-measure per-mesh vertex counts on the current model before picking a
   decimation target.
2. **P4 — life & motion** (wind sway, drifting clouds, ambient creatures). Budget against the
   already-loaded scene (roadmap §7): the fps headroom the earlier phases left is what P4 spends. P2
   measured its own cost at **0.3 ms** and P3 at **0.09–0.26 ms**, so there is still roughly 8x
   headroom against the 16.7 ms vsync budget. Note P3's numbers were taken on a different machine
   from P2's, so compare *within-session deltas*, never the absolutes (P3 spec §9d). **That 8x figure
   predates the shadow-quality branch and no longer holds** — it adds four 1024² cascades plus ~360
   newly-casting thin instances (rock/bush) whose cost is *unmeasured*: the only session that tried
   to time it ran with the Browser pane hidden, which GPU-throttles the page and invalidated every
   timing sample taken (see `docs/superpowers/specs/2026-08-25-shadow-quality-design.md` §7's "Task 6 —
   performance" for the retracted figures and why). Re-measure frame cost with a visible window before
   P4 spends the remainder.
   P3 left `WaterBody` (`src/domain/hub/waterBody.ts`) as the shape P4's shallow-water feedback —
   splashes, slowdown, wet shading — should read, and the plaza's eight pillars are where the
   mode-entrances attach.
3. **Then: game modes** — Sonic-style 3D/2D levels, 2048, Sudoku (a new milestone, SP2+).

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
  is `disposeTextures`. A throwaway probe built by *assigning* another material's `Texture` objects
  shares those very objects, so disposing them takes out the real material too — the knight lost its
  albedo and no amount of restoring the material brought it back. Use `dispose(false, false)` whenever
  the textures came from somewhere else.

  The distinction that matters: Babylon **does** reference-count the GPU upload, on
  `InternalTexture._references` (there is no public `references`, so reading that proves nothing).
  `Texture.clone()` resolves through `BaseTexture._getFromCache` and calls `incrementReferences()`, so
  a *cloned* wrapper holds its own reference and disposing it is safe — measured: 2 → 3 on clone,
  back to 2 on dispose, upload intact. An *assigned* wrapper never increments anything, which is why
  the probe above took the count straight to zero. Clone-then-dispose is safe; assign-then-dispose is
  the one that bites.
- **Measure image quality on whole frames, not sampled points.** An emissive floor exists for the
  *shaded* side of a surface; sampling lit pixels showed a 4x sweep moving them by 3/255, which read as
  "this lever does nothing". It was removed on that basis and sent 10.5 % of the frame to pure black.
  Whole-frame statistics (fraction at pure black, blown pixels, mean luma) would have caught it
  immediately — and did, once used.
- **The character controller has NO step-up: `maxStepHeight` is 0.** That is Babylon's default and
  `playerController` never raises it, so the capsule rides a 60° slope but cannot climb a vertical
  face of *any* height — a 0.55 m kerb is as impassable as a wall. Measured: walking at the plaza
  pedestal jams the player at 2.21 from its axis (its 1.6 radius plus the 0.5 capsule). **Anything
  the player must get on top of has to be reachable by slope, or by jumping.** Raising
  `maxStepHeight` is a world-wide movement change — it alters how the player meets every rock, trunk
  and pillar — so it is a movement-system decision, not something to fix per-prop.
- **Foot-planting must use the surface the player is standing on, not `terrainHeight`.** `knight.ts`
  drops the visual knight by the gap between the capsule bottom and the ground, because the capsule
  rests ~0.13 above whatever it stands on. That lookup used the height *field*, so on any raised
  collider the model rendered straight *through* it: on the plaza pedestal the capsule was correctly
  at 1.843 on a 1.717 top while the knight's lowest rendered vertex sat at 1.167 — exactly
  `terrainHeight(-6, 32)`, 0.55 low, i.e. standing on the ground inside the plinth. It now casts a
  downward physics ray (`PhysicsEngine.raycastToRef`, ~7 µs) and falls back to `terrainHeight` on a
  miss. Two traps this hid behind: **no physics assertion can see it** — the capsule was always
  right, only the render was wrong, so the check must compare the knight's lowest rendered vertex
  against the collider; and **"stand on X" passes on the broken build if you teleport the capsule**,
  which is what an automated check naturally does. Make the character get there under its own power.
  (`CharacterSurfaceInfo` cannot help — it carries normals and velocities, no surface *position*.)
- **Benchmark configs interleaved, never one block each — and shuffle the order *within* each round.**
  Interleaving alone was not enough in P3: with a fixed order inside each round, "landmark off"
  (2.805 ms) came out *faster* than "both off" (2.984 ms), which is impossible since both-off draws
  strictly less. Shuffling the config order within each round fixed it. Better still, take **paired
  within-round differences** rather than comparing absolute medians: absolutes drifted nearly 2x
  between runs with machine load (0.92 → 2.70 ms for the same scene), which swamps any small effect,
  and pairing cancels that drift. Also **never compare absolute ms across machines** — P2's 2.137 ms
  and P3's 0.92–2.70 ms are different hardware and the comparison is meaningless.

  The original P2 finding this bullet grew from: a block-per-config run had the *same* config at
  2.96 ms and 2.06 ms, and reported "bloom off" (1.778 ms) as *faster* than "whole pipeline off"
  (2.001 ms) — impossible, since bloom-off still pays for tone mapping that pipeline-off does not.
  Round-robin across configs with medians fixed that one. Run-to-run spread is ~30 % at best, so
  trust the *ordering* across several configs rather than any single number.
- **`ShadowGenerator.bias` is normalized light-space depth, not world units — the safe value does
  not carry over between generators.** Its world-space size scales with the light frustum's depth
  range. 0.002 over an `autoUpdateExtends` frustum covering the whole hub (83.7 x 65.3 units) worked
  out to roughly 0.2 world units and silently suppressed *every* shadow in the scene: the receiver
  shaders still compiled with `SHADOW1`/`SHADOWPCF1` and the shadow map still re-rendered every
  frame, so nothing looked wrong anywhere except the picture, and only objects thicker than the
  offset cast at all. Under cascaded shadow maps the same knob is a different problem in the
  opposite direction — each cascade's depth range is small enough that `bias` is entirely
  irrelevant across the whole swept range `[0, 1e-3]`. The "safe" number is a property of the
  generator, not the scene: re-tune it after changing cascade count, `shadowMaxZ`, or swapping the
  generator.
- **Verifying shadows: freeze the whole frame, not just the animation.** Pausing `AnimationGroup`s
  is NOT enough — `driveKnightAnimation` re-plays and re-weights them every frame regardless, so the
  knight kept moving between captures and a 0-vs-0 control that should have read 0 read 169. Set
  `scene.animationsEnabled = false` to actually stop it (side effect: the knight reverts to bind
  pose in captures — harmless, don't mistake it for a bug). Also set `scene.physicsEnabled = false`
  — physics stepping alone accounted for 59 of 64 stray control pixels — and pin the water ripple,
  which scrolls `uOffset`/`vOffset` on an `onBeforeRenderObservable` in `water.ts` entirely outside
  `animationGroups` and will pollute any control with the pond in frame.
- **Always run a 0-vs-0 control, and for caster-list swaps a restore control too — both must read
  exactly 0.** This is what caught the very first false positive on this branch: an idle animation
  advancing between two captures read as "shadows are working" until the 0-vs-0 control came back
  non-zero.
- **Shader recompiles land asynchronously and can defeat the usual controls.** One measurement
  returned 0 px with a zero reproducibility control AND a zero restore control — looking entirely
  trustworthy while being completely wrong — because receiver shader variants compile lazily on
  first draw and the warm-up frames used were not enough for meshes newly set to receive. A global
  darkness A/B, which forces a full redraw, exposed the contamination. Any reading taken right after
  a `receiveShadows` flip on a mesh not yet drawn in that state is invalid, and neither control
  catches it.
- **Perf: never A/B by toggling `scene.shadowsEnabled`.** It changes material defines, so the
  comparison ends up timing shader recompilation, not shadow rendering — it produced a 4.729 ms
  "cost" with a tight IQR against a frame that only took 3.4 ms in total, an arithmetically
  impossible result that the tight IQR made look authoritative. Hold every define fixed and pair
  `shadowMap.refreshRate` 1 (re-render the map each frame) against 0 (render once, never again)
  instead. Absolute cross-config comparisons on a busy machine are also unusable on their own: the
  identical shipped config measured 2.855 ms and then 5.141 ms minutes apart with nothing changed —
  an 80% spread that only a reproduce-the-first-config control caught.
- **`ShadowGenerator`s are keyed by camera in Babylon 9.** Ours is constructed with the follow
  camera, so the no-arg `sun.getShadowGenerator()` misses and returns `null`. Call
  `sun.getShadowGenerator(scene.activeCamera)`.
- **That keying is a live invariant on the cascaded branch, not a one-time setup detail — watch it if
  a second camera is ever added.** `createShadows(sun, camera)` (`shadows.ts`) registers the cascaded
  generator under `camera`, and Babylon looks it up every frame as
  `light.getShadowGenerator(scene.activeCamera) ?? light.getShadowGenerator()`
  (`materialHelper.functions.js`, `light.js`). On that branch the no-arg fallback reads the `null`
  key, which nothing on that branch registers under, so the lookup only succeeds because
  `scene.activeCamera === camera`. (The WebGL1 fallback is different: `ShadowGenerator`'s constructor
  stores `camera ?? null`, so `new ShadowGenerator(FALLBACK_MAP_SIZE, sun)` — passed no camera —
  registers itself under that same `null` key, and the no-arg fallback resolves it regardless of
  `scene.activeCamera`; see `shadowGenerator.js:633,645`.) `hubScene.ts` keeps the cascaded-branch
  invariant true today only because it sets `scene.activeCamera = follow.camera` immediately before
  calling `createShadows` with that same camera, and never repoints `scene.activeCamera` afterwards.
  This project already has an AVG overlay path; the day a cutscene or AVG camera becomes
  `scene.activeCamera` without also becoming the shadow generator's camera, every shadow on the
  cascaded branch stops rendering with no error and no console warning. Either re-create the generator
  for the new camera or keep `scene.activeCamera` pointed at the camera the generator was built with.
- **Performance cannot be measured through a hidden Browser pane.** A pane that is open but not
  visible still renders, but the page is GPU-throttled: eight back-to-back samples of one identical
  config came back 47.7–128.0 ms, a 2.7x spread with a monotonic upward drift as the throttle ramps.
  This invalidates every timing number taken that way — frame time, fps, paired A/B costs — while
  leaving pixel/image comparisons untouched, since throttling changes *when* a frame is produced, not
  *what* it contains. Check `document.hidden` before trusting any timing number; if it's `true`, the
  numbers are worthless no matter how tight the IQR looks.

## 8. Claude's local memory (optional, but valuable for continuity)

The richest operational notes live in **Claude's machine-local memory**, not in git:
`~/.claude/projects/-Users-maplewing-Repos-ProjectRondo/memory/` — `babylon-web-verification.md`,
`godot-headless-verification.md`, `game-backlog.md`, `engineering-principles.md`,
`dotnet-test-roll-forward.md`, plus `MEMORY.md` (the index). The essentials are summarised above and in
`docs/`, so it's **not required** — but copying that `memory/` folder to the same path on the new
machine gives the next Claude session full continuity.

## 9. Quick "am I set up right?" checklist

- `git lfs pull` done, and `public/models/knight_web.glb` and `public/models/knight_mr.webp` both start
  with their real binary headers (`glTF` and `RIFF` respectively), not `version https://…`.
- `pnpm test` → all green.
- `pnpm exec tsc --noEmit` → clean.
- `pnpm dev`, open the URL → hub loads: the knight stands on rolling grass, an AVG intro plays, WASD
  moves, walking to the edge is blocked by a steep grassy slope (not an invisible wall).
