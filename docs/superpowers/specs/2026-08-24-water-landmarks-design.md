# M4 · P3 — 水與地標 (Water & Landmarks) — Design

**Date:** 2026-08-24
**Status:** Approved (design), pending implementation plan
**Milestone:** M4 Refined Hub World — P3 (roadmap `2026-08-18-refined-hub-world-roadmap.md` §4)
**Predecessors:** P1 terrain & collision (PR #19), map scale-up (PR #21), run + jump (PR #23), P2 lighting
& atmosphere (PR #25), knight face lighting (PR #26)

## 1. Goal

The hub has relief, a barrier rim, fog that makes distance legible, and a character that reads well up
close. What it does not have is anywhere to go. Everything in it is ground cover — grass, rocks, trees
— scattered evenly enough that no part of the field is more worth walking to than any other.

P3 adds the two things that turn terrain into a place: **one water feature** in a natural low, and
**one landmark** standing as a destination on the high ground.

The landmark is not scenery. The roadmap is explicit that it doubles as the site where NPCs and future
mode-entrances will live, so its *form* is a gameplay decision: it has to have somewhere for a
character to stand and somewhere for several entrances to attach. That is what picks the shape in §5.

**Both features sit on the existing height field.** `terrainHeight.ts` is not modified — the basins and the
shelf recorded in §2 were measured out of it, not carved into it. That keeps the pure terrain function, its
unit tests, and everything that samples it (trees, scatter, collision) untouched.

## 2. What the terrain actually offers

Measured by sampling `terrainHeight` on a 1-unit grid across the walkable field (5,025 samples inside
`EDGE_RADIUS - 2`):

- Walkable height range: **−1.55 → 5.36**, about 7 units of relief.
- Lowest well-separated basins:

  | Centre | Floor y | Flooded radius at +0.6 m | at +1.2 m |
  | --- | --- | --- | --- |
  | **(−13, −7)** | **−1.53** | **~7.7 u** | ~8.5 u |
  | (11, 13) | −1.55 | ~6.0 u | ~7.8 u |
  | (13, −13) | −1.15 | ~4.9 u | ~7.5 u |
  | (−3, 13) | −0.82 | ~7.7 u | ~8.9 u |

  **(−13, −7)** is chosen: equal-lowest floor, and the widest basin at shallow flood, so it holds water
  without needing depth.

- Candidate landmark sites, scored by how flat a radius-8 pillar ring would sit (spread = highest minus
  lowest point on the ring):

  | Centre | y | Ring spread | Max slope | Distance from pond |
  | --- | --- | --- | --- | --- |
  | (8, 16) | −1.30 | 1.15 m | 8.2° | 31 |
  | **(−6, 32)** | **1.17** | **1.26 m** | **6.1°** | **40** |
  | (0, 14) | −0.99 | 1.32 m | 6.3° | 25 |
  | (−24, 24) | 4.37 | 2.38 m | 16.6° | — |

  There is a real tension here worth recording: **the flattest ground is the lowest ground**, because
  the flattest places are basin floors, and the highest ground is meaningfully sloped (16–17°).
  **(−6, 32)** is the only site that is both flat and above y = 0, and it is 40 units from the pond, so
  the two features do not crowd each other.

**Composition:** the pond lands ~15 units from spawn — found immediately, on the way to everything —
and the plaza ~33 units out, far enough to be a walk toward something visible.

## 3. Modules and wiring

| Module | Change |
| --- | --- |
| `src/presentation/babylon/water.ts` | **New** — pond mesh, material, per-frame scroll |
| `src/presentation/babylon/landmark.ts` | **New** — plaza geometry and colliders |
| `src/domain/hub/waterBody.ts` | **New, pure** — the `WaterBody` shape |
| `src/presentation/babylon/hubScene.ts` | Two call sites, after `createTerrain` |
| `src/presentation/babylon/terrain.ts` · `terrainHeight.ts` | **Untouched** (§1) |

The two presentation modules follow `trees.ts` / `scatter.ts`: one exported builder each, called once
from `hubScene`, owning their own materials and colliders.

**Deep-import trap.** Every Babylon feature needs its side-effect import or it silently does nothing
(HANDOFF §7). `FresnelParameters` and the cylinder/disc builders each need one.

## 4. Water

A disc at **(−13, −7)**, surface at **y = −0.95** — 0.58 m over the basin floor, roughly knee-height on
the ~1.9-unit knight — with radius **10** against a flooded contour of ~7.7.

**The disc is deliberately oversized.** Where terrain rises above the surface it occludes the water, so
an over-large disc simply disappears into the bank while an under-sized one would leave a visible gap
at the shoreline. Fitting a mesh to the contour would be the alternative and is not worth it.

### Material

`StandardMaterial`, gamma space, `fogEnabled` left on.

This is the load-bearing decision, and it is a direct consequence of P2. Every surface fog reaches in
this hub is a `StandardMaterial`; the trees bleached to grey because they were the one PBR surface, and
PBR blends fog in *linear* space where a small blend toward a near-white fog colour multiplies a dark
pixel several-fold (P2 spec §11). Water is a large surface that will often be seen at distance. Making
it the next odd one out would reproduce exactly the bug that phase was spent finding.

- **Ripple normals** from a procedurally generated `DynamicTexture`, the same technique as the sky
  gradient and the grass alpha cutouts — no binary asset is added. Two noise frequencies are baked into
  the single texture, because `StandardMaterial` has one `bumpTexture` slot and a claim of "two
  scrolling layers" would be a claim the material cannot deliver.
- **One diagonal scroll**, animating `bumpTexture.uOffset` / `vOffset` from an
  `onBeforeRenderObservable` against frame delta.
- **`specularColor` is set**, unlike the trees where it is zeroed. Water is the one surface here that
  should carry a highlight.
- **Transparency plus `opacityFresnelParameters`** — edge-versus-centre opacity falloff. This is the
  largest "reads as water" gain available without a render target, and it is built into
  `StandardMaterial`.

**No reflection or refraction.** `WaterMaterial` from `@babylonjs/materials` is the textbook answer and
is rejected on two grounds: the package is not installed (`core`, `havok` and `loaders` only), and it
works through two render targets, which the roadmap warns against ("no heavy planar reflection unless
it's free enough") and which P2's performance work was careful to avoid. A custom `ShaderMaterial` or
`NodeMaterial` is rejected because it reintroduces hand-wiring fog and defines — the hazard behind both
the tree bug and HANDOFF §7.

### Collision

**The water has no collider.** The player walks the terrain underneath it and wades. This is not a
shortcut — the terrain below is already walkable, so wading is what happens when nothing is added, and
*blocking* would be the option that costs work. At 0.58 m the deepest point is knee-height, so this
reads as a shallow pool rather than something that should be swum.

`WaterBody` — centre, radius, surface Y — lives in `domain/` as engine-agnostic data, and `water.ts`
builds the mesh from it.

**Not shipping:** a `submersionDepth` predicate. It was requested as preparation for P4 shallow-water
feedback (splashes, slowdown), and it is deliberately narrowed to the data shape alone, because nothing
this phase would call it and an exported, tested function with no caller is dead code. P4 adds the
predicate against the same `WaterBody`. The preparation that survives review is the named shape.

## 5. Landmark — a stone plaza

**Eight pillars on a radius-8 ring at (−6, 32)**, plus a central pedestal.

The shape is chosen for what attaches to it later, not for how it looks now: a colonnade is inherently
a *set* of positions, so each pillar can become one of the mode-entrances (Sonic-style levels, 2048,
Sudoku) while the pedestal holds the NPC. An arch would have been one entrance for three modes; a
village would have been the most work and the most likely to read as unfinished when built from
primitives.

- **Pillars seat individually on terrain** (like the trees) but all reach the **same crown height**, so
  the ring reads level across 6° of slope while the bases follow the ground. Height per pillar is
  `crownY - terrainHeight(x, z)`.
- **No plinth.** One was designed to absorb the 1.26 m ring spread and then dropped: a 1.3 m platform
  needs steps or it is an invisible wall, and seating the pillars individually removes the problem
  rather than solving it.
- **Stone grey reusing `scatter.ts`'s existing rock colour** (`0.55, 0.54, 0.52`), so the new structure
  lands inside P2's grade instead of beside it.
- **Colliders:** one `PhysicsAggregate` cylinder per pillar plus the pedestal — nine static bodies,
  negligible against the existing terrain mesh collider.

**Geometry only, by decision.** The models are composed from primitives now so the phase is not gated
on an asset; a texture or GLB upgrade is a separate, later step. The precedent both ways is in the
repo: `tree.glb` and the knight came from Tripo, and run+jump was blocked until the clips arrived.

## 6. Testing

`domain/hub/waterBody.ts` is data with no behaviour, so it adds no unit tests; the existing **124 must
stay green**. Everything else is verified in-browser, per the project's convention that babylon scene
code is not unit-tested (HANDOFF §6).

- **Screenshots** at three viewpoints: the pond from the bank, the plaza from spawn distance, and a
  wide shot holding both.
- **Collision, actually exercised:** walk into a pillar and confirm the player stops; stand on the
  pedestal; wade into the pond and confirm the player keeps walking on the terrain below.
- **fps** measured with P2's method — round-robin across configs with medians, all shader variants
  pre-compiled — and explicitly *not* the block-per-config method, which produced impossible orderings
  (P2 spec §12).
- **Whole-frame clipping stats** unchanged from P2's baseline: no blown highlights, no new crushed
  regions.
- **Fog participation** confirmed on the water by the same off/on blend comparison used on the trees.

Two measurement traps from P2 apply directly and are the ones to watch: `readPixels` after
`endFrame()` can return a post-process render target rather than the canvas unless
`engine.restoreDefaultFramebuffer()` is called first, and image quality must be judged on whole frames
rather than sampled points.

## 7. Definition of done

- One water feature reads clearly as water and sits naturally in a terrain low.
- One landmark stands as a recognisable destination, visible from spawn distance, with working
  collision on every pillar and the pedestal.
- Both match P2's stylized grade — same palette family, correct fog participation, no blown or newly
  crushed regions.
- The player can wade into the pond and walk out again.
- fps holds against the post-P2 measurement on the full scene.

## 8. Out of scope

- Swimming, buoyancy, or any depth beyond wading.
- Water reflection and refraction (§4), and the `@babylonjs/materials` dependency they would need.
- The `submersionDepth` predicate and any shallow-water feedback — splashes, slowdown, wet shading (§4).
  These are P4.
- NPCs, dialogue triggers and actual mode-entrances. P3 builds the *site*; it does not populate it.
- A second water feature or second landmark. The DoD asks for one of each, and one good one is the
  point.
- Texture or GLB upgrades for the plaza (§5).
- The knight's cel banding and outlines, which remain unbuilt and unrelated (HANDOFF §5).
