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
# 1. Export a GLB (mesh + Idle/Walk) from Godot headless
/Applications/Godot_mono.app/Contents/MacOS/Godot --headless \
  --path __prototype__ --script res://tools/export_web_glb.gd

# 2. Texture-only optimization (do NOT simplify/quantize/resample — it corrupts the skeletal animation)
pnpm dlx @gltf-transform/cli resize __prototype__/knight_web.glb /tmp/k.glb --width 1024 --height 1024
pnpm dlx @gltf-transform/cli webp /tmp/k.glb public/models/knight_web.glb --quality 80
```

Bump the `?v=N` query on the GLB URL in `src/presentation/babylon/knight.ts` after rebuilding so
browsers refetch it.

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
