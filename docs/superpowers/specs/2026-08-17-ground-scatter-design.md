# Ground Scatter — Richer Grassland (Design Spec)

**Date:** 2026-08-17
**Status:** Approved (brainstorm), pending implementation plan
**Predecessors:** M3 hub grassland (PR #15 — grass ground + trees + sky + sun/shadows), capsule dedup (PR #16)

## 1. Goal & context

The hub reads as a grassland but is empty and static between the trees. Scatter **ground-level
nature detail** — grass tufts, wildflowers, rocks, small bushes — across the field so the ground has
near-view depth and life. This is the "real grass geometry" upgrade the grassland spec deferred.

All **presentation** (babylon meshes/materials/thin-instances). No `src/domain`, no Vitest —
verified in-browser. Everything is **procedural** (no external assets) and **static** (no wind this
round). Art direction stays *minimal, upgradeable* to match the grassland.

## 2. Scope

**In:** a `scatter.ts` module that scatters four procedural element types over the 50×50 field via
**thin-instances** (one draw call per type):
- **Grass tufts** — billboard **cross-cards** (2–3 crossed vertical quads) with a procedurally-drawn
  **alpha grass-blade texture** (`DynamicTexture`), alpha-test cutout, double-sided. ~4000 instances.
- **Wildflowers** — small cross-cards with a procedural flower texture (white/yellow/purple blossoms),
  sprinkled among the grass. ~400 instances.
- **Rocks** — low-poly icospheres with deterministically perturbed vertices, grey. ~50 instances.
- **Bushes** — 2–3 overlapping green icospheres (mini canopies), near trees/edges. ~40 instances.

**Out (deferred upgrades):** wind sway (custom vertex shader), grass LOD / distance fade, per-element
collision, richer sourced/generated assets, density painting.

## 3. Architecture

One focused module under `src/presentation/babylon/`:

- **`scatter.ts`** — `createGroundScatter(scene)`: builds one small **base mesh** per element type
  (grass card, flower card, rock, bush) with its material, then fills each base mesh's **thin-instance
  matrix buffer** with a deterministic scatter. Returns nothing (meshes are scene-owned; `engine
  .dispose()` tears them down like the rest).
- **`hubScene.ts`** (1 line) — call `createGroundScatter(scene)` after `createGround(scene)`.

Helpers kept local to `scatter.ts`: a seeded PRNG (mulberry32, same pattern as `ground.ts`), a
matrix-buffer builder, and the two procedural `DynamicTexture` painters (grass, flower).

## 4. Grass tufts

- **Base mesh:** a "cross-card" — 2–3 upright quads (`CreatePlane`) rotated evenly around Y and merged
  (`Mesh.MergeMeshes`) so the tuft looks bushy from any angle. Size ≈ 0.5 wide × 0.5 tall; offset so
  the card's **base sits at y = 0** (planes are centred, so raise by height/2).
- **Material:** `StandardMaterial` with `diffuseTexture` = the procedural grass alpha texture
  (`hasAlpha = true`, `material.useAlphaFromDiffuseTexture = true`), `transparencyMode =
  Material.MATERIAL_ALPHATEST` (cutout — no transparency sorting), `backFaceCulling = false`, low
  `specularColor`. Lit (sun/ambient affect it) but **not a shadow caster**.
- **Alpha texture (procedural):** a `DynamicTexture` (~256²), transparent background, draw ~10–16
  tapered blade strokes rising from the bottom in varied greens (light→dark), a few leaning left/right.
  Deterministic (seeded) so it's identical each run.
- **Scatter:** ~4000 thin-instances across the field, each with a random Y-rotation, slight random
  uniform scale (≈ 0.7–1.3), random position; `y = 0`.

## 5. Wildflowers

- **Base mesh:** a small cross-card (~0.2 tall), same construction as grass.
- **Material:** `StandardMaterial` + a procedural flower `DynamicTexture` — transparent, a few small
  blossoms (white / yellow / purple, simple petal circles) on faint green stems. Alpha-test, double-
  sided, not a caster.
- **Scatter:** ~400 thin-instances, mixed among the grass, random rotation/scale.

## 6. Rocks

- **Base mesh:** `CreateIcoSphere` (subdivisions 1–2), then perturb each vertex outward by a small
  seeded random amount (`updateVerticesData(PositionKind, …)` + `createNormals`) for a chunky rock;
  flat-ish grey `StandardMaterial` with slight colour variation, low specular.
- **Scatter:** ~50 thin-instances, random yaw + non-uniform scale (≈ 0.3–0.8), sunk slightly into the
  ground (`y` a touch below 0). Not a shadow caster this round.

## 7. Bushes

- **Base mesh:** 2–3 overlapping `CreateIcoSphere` blobs merged, green `StandardMaterial` (reuse a
  foliage-ish green), ~0.6–1.0 tall, base at y = 0.
- **Scatter:** ~40 thin-instances, biased toward the tree spots / field edges, random yaw + scale.
  Not a shadow caster this round.

## 8. Distribution & performance

- **Deterministic:** one mulberry32 PRNG seed per element type → reproducible layouts.
- **Bounds:** positions within ±24 (inside the boundary walls). Grass may sit under trees / around the
  spawn (it doesn't block the capsule — scatter has no colliders).
- **Thin-instances:** each base mesh gets a `Float32Array` of `16 × N` matrices via
  `Matrix.Compose(scale, Quaternion.RotationYaw…, position)`; `mesh.thinInstanceSetBuffer('matrix',
  buffer, 16)`. Because the instances span the whole field, set the base meshes
  `alwaysSelectAsActiveMesh = true` (or refresh thin-instance bounds) so they aren't wrongly frustum-
  culled. Result: **one draw call per element type** (~4 total) for ~4500 objects.
- **Grass/flower use alpha-test** (not alpha-blend) so there's no per-frame transparency sort.

## 9. Lighting / shadows

- All four element materials are **lit** (respond to the sun + ambient) so they sit in the scene's
  light, but are **not shadow casters** (thousands of grass casters would blow the shadow budget). The
  ground still receives the knight's and trees' shadows as before. Rock/bush shadow-casting is a
  deferred nicety.

## 10. `hubScene.ts` wiring

After `createGround(scene)`, add `createGroundScatter(scene);`. No other changes — the scatter meshes
are scene-attached and released by the existing `engine.dispose()` teardown; no new DOM listeners.

## 11. Testing

In-browser (pure visual — no unit tests):
- Screenshot from ground level: grass tufts + wildflowers + rocks + bushes populate the field; the
  ground no longer looks bare between trees.
- Confirm no z-fighting / transparency-sorting artifacts on the grass (alpha-test), and grass sits on
  the ground (base at y = 0, not floating/sunk).
- FPS stays healthy (few draw calls despite ~4500 objects); check the knight can still walk through
  the grass (no colliders on scatter).

## 12. Deferred (future layers)

Wind sway (vertex shader over the thin-instances), grass LOD / distance fade-out, per-element density
tuning, sourced/generated hi-fi assets, rock/bush shadows. New branch `claude/ground-scatter` off
`main`.
