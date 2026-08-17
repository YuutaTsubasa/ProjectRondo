# P1 · Hub Terrain & Collision Foundation (Design)

**Date:** 2026-08-18
**Status:** Approved (design), pending implementation plan
**Milestone:** M4 Refined Hub World — Phase 1 (see
`docs/superpowers/specs/2026-08-18-refined-hub-world-roadmap.md`)
**Predecessors:** M3 hub environment (grassland PR #15, ground scatter PR #17)

## 1. Goal & context

Turn the flat 50×50 hub into **gently rolling terrain the player rides**, and give the world its first
**solid collision** beyond the boundary walls. Terrain shape: **central flat, hills ringing the
edges** — a calm play area in the middle (for spawn, and future landmarks/NPCs), hills rising toward
the edges for enclosure and depth.

Today (from `ground.ts` / `hubScene.ts`): a flat `CreateGround` with a static BOX collider, four
invisible boundary-wall boxes, and a Havok `PhysicsCharacterController` capsule that already
collide-and-slides against the ground + walls. Trees (`trees.ts`) and scatter (`scatter.ts`,
thin-instances) have **no physics — the player clips through them.** Gravity lives in the pure domain;
Havok world gravity is zero.

All **presentation** (babylon meshes/materials/physics). No `src/domain` changes: the pure
`characterMovement.step` is untouched — terrain interaction is entirely collide-and-slide in the
controller. Procedural, deterministic, stylized (matches the scatter/grassland discipline).

## 2. Core idea — one pure height function as the single source of truth

A single seeded, deterministic **`terrainHeight(x, z): number`** defines the ground surface. Everything
samples it:

- the terrain **mesh** displaces its vertices by it,
- **scatter** (grass/flowers/rocks/bushes) and **trees** sample it to sit on the surface,
- **rock colliders** derive their Y from it.

Because it's one pure function of `(x, z)` seeded by a constant, the whole layout is reproducible (no
physics raycasts needed to place things), satisfying the roadmap's determinism requirement.

**Shape** — radial falloff blended with value noise:
- Let `r = distance from field centre`. A **falloff** `w(r)` is ~0 inside an inner radius
  `FLAT_RADIUS` (≈ 10) and eases to 1 by the field edge (≈ 24).
- `terrainHeight = w(r) * AMPLITUDE * valueNoise(x, z)`, where `valueNoise` is a small seeded
  value-noise sum (mulberry32-seeded lattice, smoothstep interpolation) in roughly `[0, 1]`, and
  `AMPLITUDE ≈ 4–6`. Result: near-flat centre (≈ y 0), hills up to ~4–6 toward the edges.
- All constants (`FLAT_RADIUS`, `AMPLITUDE`, noise frequency, seed) are named and tunable.

## 3. `terrain.ts` — the new ground (replaces `createGround`)

- **Mesh:** `CreateGround('terrain', { width: 50, height: 50, subdivisions: N })` with N high enough to
  read the hills smoothly (≈ 100–150). Displace each vertex's Y by `terrainHeight(x, z)`, then
  recompute normals (`VertexData.ComputeNormals` / `mesh.createNormals`) for correct lighting.
  **Reuse the existing grass material** (tiling `grass.jpg`, low specular) + `receiveShadows = true`.
- **Collider:** a static **MESH-shape** `PhysicsAggregate(terrain, PhysicsShapeType.MESH, { mass: 0 })`
  so the capsule collide-and-slides over the true surface. (If MESH proves heavy at N subdivisions,
  fall back to `HEIGHTFIELD`; MESH is the simpler first cut.)
- **Boundaries:** keep `createBoundaries` as-is (belt-and-suspenders past the edge hills). The four
  walls stay at the field rim, height unchanged.
- `createTerrain(scene)` returns the mesh; `hubScene.ts` calls it in place of `createGround`.

## 4. Re-seating scatter & trees onto the terrain

- **scatter.ts:** `scatterMatrices` currently writes a fixed `y`. Change it to sample
  `terrainHeight(x, z)` per instance and set `pos.y = terrainHeight(x,z) + o.y` (the existing `y`
  becomes a small offset — e.g. rocks still sink `-0.05`). Grass/flowers/bushes/rocks then sit on the
  slope. (Cross-cards stay vertical; sampling height at the instance centre is enough at this scale.)
- **trees.ts:** sample `terrainHeight(x, z)` at each tree's scatter position and set its Y so trunks
  meet the ground.
- Import `terrainHeight` from `terrain.ts` into both (a pure function import — no scene coupling).

## 5. Collision

**Policy** (from the roadmap §5) for P1: **terrain = ride on; trees = solid; selected large rocks =
solid; grass/flowers/bushes/small rocks = pass-through; boundary walls = solid (kept).**

### 5a. Trees (~10 discrete instances)
Each tree already exists as its own instantiated root. Add a static **cylinder** (or box) collider at
the trunk — sized to the trunk, not the canopy, so the player brushes past leaves but stops at the
trunk. `PhysicsAggregate(trunkProxy, CYLINDER, { mass: 0 })`, positioned at the tree's base on the
terrain. ~10 cheap static bodies.

### 5b. Selected large rocks — render/physics decoupled
The rocks render as **one thin-instance draw call** and that stays unchanged. Separately, from the
same deterministic scatter data, select the **large** instances (scale above a threshold, ~top 8–12)
and, for each, create an **invisible static collider shape** (sphere or box approximating the rock)
positioned at that instance's world transform (X/Z from the matrix, Y from `terrainHeight`). The
player collides with these invisible shapes; visuals remain a single draw call. Small rocks (and
grass/flowers/bushes) get no collider.

*Technique note:* the collider is a coarse primitive (sphere/box), not the perturbed rock mesh —
cheaper and good enough for "you can't walk through the big rock."

### 5c. Movement on slopes (the flagged risk — must be verified, not assumed)
The pure domain still owns gravity + planar `MoveToward`; the controller resolves terrain contact.
The P1 implementation must check and tune, in-browser, on the actual terrain:
- **Descending:** the capsule stays snapped to the ground going downhill (no bouncing/stair-stepping).
  Use the controller's support probe / ground-keeping; tune if it hops.
- **Max walkable slope:** the central + mid field is walkable; the steep edge hills act as natural
  barriers (unwalkable is *fine* there). Keep `AMPLITUDE`/`FLAT_RADIUS` such that the intended play
  area stays under the walkable limit.
- **`grounded && !ascending`:** confirm walking **up** a slope (small positive `velocity.y` from
  collide-and-slide) does not falsely read as "ascending" and un-ground the character (which would cut
  traction/jump logic). Adjust the grounded test if slopes break it.

These are verified by walking the knight up/down the hills in the browser, not by inspection alone.

## 6. Distant scenery

A ring of low-poly **silhouette mountains** (or a distant painted band) beyond the boundary walls:
static, **no collider**, `isPickable = false`, `alwaysSelectAsActiveMesh = true` if they span wide.
Kept cheap (painted/silhouette, not dense geometry) per the perf budget. Purpose: the world reads as
bigger than the walled box and gives the P2 fog something to fade into.

## 7. Performance

Measured on the **cumulative** scene (terrain + existing scatter/trees/scatter), targeting 60fps:
- Terrain: one mesh, one draw call; MESH collider built once (static).
- Rock/tree colliders: ~20 static bodies total — negligible.
- Scatter/trees keep their existing draw-call counts (re-seating only changes Y in the matrix buffer).
- Distant scenery: silhouette/painted, minimal geometry.

## 8. Out of scope (P1)

- Post-processing / fog / atmosphere → **P2**.
- Water, landmark structures → **P3** (they sit on this terrain later).
- Wind sway, clouds, ambient life → **P4**.
- Explicit walkways/paths → deferred until landmarks exist (P3), so paths lead somewhere.
- Per-instance colliders for small rocks / bushes / grass — intentionally none.

## 9. Testing (in-browser, no unit tests — pure presentation)

- **Terrain reads as rolling:** screenshot shows central flat area and edge hills; grass texture drapes
  the relief; normals lit correctly (no flat-shaded black faces — cf. the scatter normals lesson).
- **Things sit on the ground:** grass/flowers/rocks/bushes/trees rest on slopes, none floating or
  buried.
- **Collision:** walk the knight into a tree and a large rock → blocked (can't pass). Walk small
  rocks/grass → pass through. Walk up/down hills → rides the surface, no fall-through, no float, no
  bounce; central area fully walkable.
- **Distant scenery** visible past the field.
- **60fps** holds on the cumulative scene.

## 10. Modules touched

- **new** `src/presentation/babylon/terrain.ts` — `terrainHeight(x,z)` + `createTerrain(scene)`.
- `hubScene.ts` — call `createTerrain` instead of `createGround`.
- `scatter.ts` — sample `terrainHeight` for instance Y; emit invisible colliders for large rocks.
- `trees.ts` — sample `terrainHeight` for tree Y; add trunk colliders.
- `ground.ts` — retire (fold its material + boundaries into `terrain.ts`, or keep `createBoundaries`
  and the material helper and drop only the flat-ground builder — decided in the plan).
- Distant scenery: in `terrain.ts` or a small `environment.ts` addition (plan decides).
