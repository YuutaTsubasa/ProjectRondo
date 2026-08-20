# ProjectRondo — Developer Handoff

Last updated: 2026-08-20. Purpose: everything the next machine / developer / Claude session needs to
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

## 4. Current state (all merged to `main`, latest `9c0395a`, no open PRs)

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

## 5. What's next (the plan)

Read the roadmap: `docs/superpowers/specs/2026-08-18-refined-hub-world-roadmap.md` (M4 phases + §7b
scheduled additions). Sequence from here:

1. **P2 — 光影與氛圍後製 (lighting & atmosphere post-processing):** `DefaultRenderingPipeline` (ACES tone
   mapping, bloom, colour grading), distance **fog** tuned to the terrain depth, optional godrays. This
   is the next scheduled phase — biggest visual lift, and the fog finally blends the distant mountains'
   bases into the horizon.
2. **Run + jump movement** — a parallel pass, **GATED on the user downloading run/jump animations**
   (retarget → `knight_web.glb`, same pipeline as Idle/Walk). Also fold in the slight foot-float on flat
   ground (proper fix is foot IK — touches the anim rig, so do it here). Domain already has a jump path
   (`jumpSpeed`); sprint was tuned out earlier (maxSpeed 12→4).
3. **P3 — water & landmarks** (landmarks double as NPC / future mode-entry sites; the natural-barrier
   cliff aesthetic can finish here).
4. **P4 — life & motion** (wind sway, drifting clouds, ambient creatures).
5. **Then: game modes** — Sonic-style 3D/2D levels, 2048, Sudoku (a new milestone, SP2+).

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
- **The domain thinks in flat ground; `slopeMotion.ts` bridges that to sloped terrain.** Its two
  functions must stay a matched pair — tilt the domain's horizontal velocity onto the contact plane on
  the way into the solver, un-tilt the result on the way back. Drop either half and the two ends feed
  each other downward: the horizontal component shrinks by `cos(slope)` each frame, the domain reads
  that back as its current speed, and running settles at `acceleration * delta / (1 - cos(slope))`.
  Measured before the fix: **8 u/s down to 2.9 on a 4° rise**. Note the collider is locally steeper
  than the height field — a 7° hillside gives ~19° contact normals — so this bites far sooner than the
  visible gradient suggests.

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
