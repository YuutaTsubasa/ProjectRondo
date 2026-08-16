# Hub Grassland — Environment Upgrade (Design Spec)

**Date:** 2026-08-16
**Status:** Approved (brainstorm), pending implementation plan
**Predecessors:** M1 web parity (PR #13), M2 AVG dialogue system (PR #14)

## 1. Goal & context

Replace the hub's flat grey placeholder ground with a **starting grassland**: green grassy ground,
an outdoor gradient sky, a directional sun that casts the knight's shadow, scattered trees, and
invisible edge boundaries. This restores and upgrades what the Godot `__prototype__/Scenes/Hub/
HubWorld.tscn` already had (green ground, procedural sky, shadow-casting sun, corner props) but the
M1 web port stripped down to a grey `CreateGround` plane + a single hemispheric light.

**Art direction:** minimal but upgradeable — flat terrain, textured (not geometry) grass, procedural
sky, low-poly trees. Chosen over low-poly-stylized and semi-realistic to ship a believable grassland
fast without heavy GPU cost, with clear upgrade paths.

This is **entirely presentation** (babylon scene-building: meshes, materials, lights, physics
colliders). There is no game-domain logic, so nothing lands in `src/domain/` and there are no Vitest
units — it is verified in-browser.

## 2. Scope

**In:**
- **Grass ground** — flat, green, with a subtle procedural grass texture; receives shadows; keeps the
  existing Havok box collider.
- **Gradient skydome** — an inward-facing sky sphere with a vertical horizon→zenith gradient.
- **Sun + shadows** — a `DirectionalLight` + `ShadowGenerator`; the knight (and trees) cast soft
  shadows on the grass. The hemispheric light stays as ambient fill.
- **Trees** — load a user-supplied `public/models/tree.glb`, texture-optimize it, and scatter ~8–12
  copies via `.clone()` (including the old pillar spots). **Gracefully no-op (console note) if the
  GLB is absent** so the rest ships before the asset exists.
- **Boundaries** — thin invisible Havok wall colliders at the field edges so the player can't walk off
  into the void.

**Out (deferred upgrade paths):** heightmap/rolling terrain, real grass *blade* geometry + wind
shader, babylon `SkyMaterial` (atmospheric scattering), terrain splatmaps, tree LOD, per-tree
collision.

## 3. Architecture

Small, focused presentation modules under `src/presentation/babylon/`, each with one responsibility:

- **`environment.ts`** — `createEnvironment(scene)`: builds the skydome, the directional sun + a
  `ShadowGenerator`, and the ambient hemispheric light. Returns `{ shadowGenerator }` (and the sun)
  so callers can register shadow casters. Owns all lighting/atmosphere.
- **`ground.ts`** — `createGround(scene)`: the flat grass ground mesh + procedural material + Havok
  box collider (`receiveShadows = true`), plus the four invisible edge-boundary colliders (§8).
  Returns the ground mesh.
- **`trees.ts`** — `loadTrees(scene, shadowGenerator)`: async-loads `/models/tree.glb`, texture-
  optimizes/scales it, scatters copies via `.clone()` at a fixed position list, registers them as
  shadow casters. Resolves to a no-op (with a `console.info`) if the GLB is missing.
- **`hubScene.ts`** (refactor) — stops building the ground/light inline; instead calls
  `createEnvironment`, `createGround`, and `loadTrees`. After `loadKnight`, it registers the knight
  meshes as shadow casters on the returned `shadowGenerator`.

The character controller, follow camera, input, and knight are untouched (flat ground → the existing
box collider and Havok setup are unchanged).

## 4. Grass ground (`ground.ts`)

- Keep a flat `CreateGround('ground', { width: 50, height: 50 })` and the existing static box
  `PhysicsAggregate` (unchanged collision).
- Material: `StandardMaterial` (side-effect already imported in the project) with a green base and a
  **procedural grass `DynamicTexture`** — draw a tiled noise/tuft pattern on a canvas (a base green
  fill plus randomized darker/lighter speckles), set as `diffuseTexture` with `uScale`/`vScale` (e.g.
  8×8) so it tiles across the field. Low specular. Deterministic drawing (fixed pseudo-random) so it
  looks the same each run.
- `ground.receiveShadows = true` so the sun's shadow lands on the grass.

## 5. Sky (`environment.ts`, skydome)

- `CreateSphere('sky', { diameter: 1000, sideOrientation: Mesh.BACKSIDE })` — large enough to enclose
  the scene; back-side so the camera sees its interior.
- `material.disableLighting = true` and `infiniteDistance = true` (stays centred on the camera, reads
  as an infinitely far sky).
- Gradient via a `DynamicTexture`: draw a vertical `linearGradient` on a tall canvas (deep blue at the
  top → lighter warm-white near the horizon) and assign it as the material's `emissiveTexture` (unlit,
  so the gradient shows regardless of the sun). `backFaceCulling = false`.
- Excluded from shadows and not a shadow caster.

## 6. Sun + shadows (`environment.ts`)

- `DirectionalLight('sun', dir, scene)` with `dir` angled down (e.g. `new Vector3(-0.5, -1, -0.5)`
  normalized) matching the Godot sun's overhead-ish angle; modest intensity.
- `ShadowGenerator(1024, sun)` with soft shadows (`usePercentageCloserFiltering` or
  `useBlurExponentialShadowMap`), returned to the caller.
- Keep the existing `HemisphericLight` as ambient fill, but lower its intensity so the shadow is
  visible (currently it fully lights everything).
- `loadKnight` (given the `shadowGenerator`) registers the knight meshes and `trees.ts` registers the
  tree meshes as shadow casters (`shadowGenerator.addShadowCaster(mesh)`).

## 7. Trees (`trees.ts`)

- `loadTrees(scene, shadowGenerator)`:
  1. Attempt `ImportMeshAsync('/models/tree.glb', scene)`. If it fails/404s, `console.info` a note and
     return (no trees) — the scene is otherwise complete.
  2. Texture-optimize on the same principle as the knight (the GLB should be pre-optimized offline;
     at minimum resize oversized textures) — the plan documents the offline `gltf-transform` recipe
     (texture-only) mirroring the knight.
  3. Scatter ~8–12 copies at a fixed position list — implemented as plain **`.clone()` per tree**
     (simpler and robust to an unknown multi-mesh GLB; ~10 static props is a negligible draw-call
     cost). Thin-instances remain a valid optimization if tree counts grow large. Include the
     four old pillar spots (±8, ±8) plus a few more toward the field edges; vary yaw and scale slightly
     per instance (deterministic).
  4. Register the tree mesh as a shadow caster.
- Trees are **visual only** (no per-tree collider) for this pass — parity with the Godot pillars, which
  were plain `MeshInstance3D`. Per-tree collision is a deferred upgrade.

## 8. Boundaries (in `ground.ts`)

- Four thin, tall, invisible static box colliders (`PhysicsAggregate` BOX, mass 0) placed along the
  ±25 edges of the 50×50 field, so the Havok character controller can't walk off the ground. Meshes
  are invisible (`isVisible = false`) — colliders only. Built by `createGround` alongside the ground
  (they define the ground's walkable limits, so they share its module).

## 9. `hubScene.ts` refactor

Replace the inline ground + hemispheric-light creation with:
```
const { shadowGenerator } = createEnvironment(scene);
const ground = createGround(scene);
// … existing player setup …
const knight = await loadKnight(scene, playerRoot, shadowGenerator);
await loadTrees(scene, shadowGenerator);
```
`loadKnight` gains an optional `shadowGenerator` parameter: it already holds `result.meshes`
internally, so it registers those as shadow casters when one is passed (keeps the knight's mesh list
encapsulated instead of leaking it back to `hubScene`). Everything else in `hubScene` (physics
enable, player root, follow camera, input, render loop, `suspendInput`, dispose) is unchanged. `dispose` continues to rely on `engine.dispose()` tearing the
scene down (the new meshes/lights are scene-owned).

## 10. Testing

In-browser (no unit tests — pure visual/physics presentation):
- Screenshot the grassland: green grass texture, gradient sky, the **knight's shadow on the grass**.
- Confirm the sky gradient renders and stays put as the camera moves (infiniteDistance).
- With a `tree.glb` present: trees appear scattered and cast shadows; without it: scene still renders,
  a console note logged, no error.
- Player can't walk past the field edges (boundary colliders).
- Framerate stays healthy (~10 cloned trees + single shadow map is cheap).

## 11. Parity notes (Godot `HubWorld.tscn`)

- Godot had: green ground `RGB(0.36,0.55,0.34)` 40×40 + box collider, `ProceduralSkyMaterial` gradient
  sky, a shadow-enabled `DirectionalLight` sun, 4 corner pillars (2×4×2), a spawn marker. This spec
  reaches parity (green ground, gradient sky, sun+shadows) and upgrades the pillars → trees plus a
  grass texture and edge boundaries. Ground stays flat (as in Godot) so the character controller and
  box collider are unchanged.
- New branch `claude/hub-grassland` off `main`.
