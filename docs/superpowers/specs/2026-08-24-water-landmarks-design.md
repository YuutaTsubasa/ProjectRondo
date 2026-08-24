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
  | **(−6, 32)** | **1.17** | **1.26 m** | **6.1°** | **38** |
  | (0, 14) | −0.99 | 1.32 m | 6.3° | 25 |
  | (−24, 24) | 4.37 | 2.38 m | 16.6° | — |

  There is a real tension here worth recording: **the flattest ground is the lowest ground**, because
  the flattest places are basin floors, and the highest ground is meaningfully sloped (16–17°).
  **(−6, 32)** is the only site that is both flat and above y = 0, and it is 38 units from the pond, so
  the two features do not crowd each other.

**Composition:** the pond lands ~16 units from spawn — found immediately, on the way to everything —
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

A disc at **(−15, −5)**, surface at **y = −0.95** — 0.58 m over the basin floor, roughly knee-height on
the ~1.9-unit knight — with radius **12**.

**The disc is deliberately oversized, and centred on the basin's centroid rather than its lowest
point.** Where terrain rises above the surface it occludes the water, so an over-large disc disappears
into the bank while an under-sized one leaves a visible gap at the shoreline.

Flood-filling at y = −0.95 gives a connected region of **238 cells spanning x −23..−9**, centroid
**(−15.3, −4.8)** — the basin is both larger and offset from its deepest point. Centring on the deepest
point at radius 10 would have left **20 of 64 rim cells underwater**, i.e. a disc that is not oversized
at all on its west side; (−15, −5) at radius 12 leaves none. Fitting a mesh to the contour would be the
alternative and is not worth it.

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

`domain/hub/waterBody.ts` is data, but it gets a small **placement test** — the codebase already tests
its data constants this way (`tests/domain/hub/character/valueTypes.test.ts` asserts `DEFAULT_CONFIG`).
The value here is not the shape but the fit: asserting against `terrainHeight` that the pond centre is
below the surface, that the flooded area is broad enough to read as water, that it is shallow enough to
wade, and that the oversized disc's rim is dry land. That catches the real error — a pond moved to
somewhere that is not a basin. It lives in `tests/presentation/` because it depends on
`terrainHeight.ts`, which is a presentation module.

So **124 existing plus 4 new must be green**. Everything else is verified in-browser, per the project's
convention that babylon scene code is not unit-tested (HANDOFF §6).

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

## 9. Definition of done — measured

All in-browser figures from a 1280x720 drawing buffer, pinned with `engine.setSize(1280, 720)` (the
preview pane sized itself 961x499), frames driven manually with `beginFrame`/`render`/`endFrame`, and
`engine.restoreDefaultFramebuffer()` immediately before every `readPixels`.

### 9a. Fog participation on the water

The sample point is located by *projecting* the pond centre to screen rather than by a hand-placed
fraction, and a control (hide the water, re-sample) proves the pixel is water and not the bank behind
it — at 24 units the water reads `34,119,96` against `36,108,18` for the terrain behind it.

| View | Distance | Fog off | Fog on | Moved | EXP2 predicts | Measured | Ratio |
| --- | --- | --- | --- | --- | --- | --- | --- |
| near | 24.3 | `29,115,93` | `34,119,96` | **yes** | 0.0336 | 0.0262 | **0.78** |
| far | 60.7 | `17,76,83` | `55,109,105` | **yes** | 0.1919 | 0.1759 | **0.92** |

The magnitude is the real test, not the movement: the P2 tree bug was not "no fog" but *8x too much*
fog, from blending in linear space (a 0.32 blend where EXP2 asked 0.04). Here the ratio is 0.78–0.92,
slightly *under* the analytic prediction because ACES compresses after the blend and the disc is
alpha-blended over already-fogged terrain. The water is gamma-space like every other surface in the
hub, which is what §4's material choice exists to guarantee.

### 9b. Collision, exercised

**Pillars.** Each walked into along a lane checked clear of other colliders, and identified
positively by *stop radius*: pillar radius 0.45 + capsule radius 0.5 = **0.95** expected.

| Pillar | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Stop distance from axis | 1.051 | 0.998 | 1.083 | 1.026 | 1.063 | 1.029 | 1.044 | 1.037 |

All eight stopped and held. The 0.05–0.13 excess over 0.95 is the Havok contact skin, consistent
across all eight. The lane check was not ceremony: a first attempt at pillar 0 stopped the player at
z = 35.12, which turned out to be `tree_14_trunk` at (2, 34) — a false positive that "the pillar
stopped me" would have recorded as a pass.

**Pedestal — jump on and stand.** Jumping on is the required interaction; walking up is not (see
9e). Measured on the *rendered* knight, because no physics assertion can see the defect this found:

| Approach | Capsule bottom | Rendered sole | Pedestal top | Sole vs top |
| --- | --- | --- | --- | --- |
| jump from −X | 1.836 | 1.717 | 1.717 | **0.000** |
| jump from +Z | 1.846 | 1.717 | 1.717 | **0.000** |
| jump from +X | 1.826 | 1.717 | 1.717 | **0.000** |
| *control:* open ground | 1.197 | 1.056 | (terrain 1.055) | **0.001** |
| *also:* standing on a pillar crown | 5.481 | 5.367 | (crown 5.367) | **0.000** |

**Wading.** Walked from the north bank straight across the pond and out the far side: entered the
disc at z = 6.90, exited at z = −17.19, continued to −20.64. **Zero stalled frames.** Distance per 8
frames was 0.290 in the water against 0.275 on land — no slowdown; the basin floor is flatter than
the banks. Deepest submersion reached **0.432 m** against a surface at −0.95, knee-height on the
2-unit capsule.

### 9c. Whole-frame clipping at three viewpoints

Whole frames, all 921,600 pixels, not sampled points — and measured both with and without the P3
geometry, so "does the new geometry introduce clipping" is answered as a delta rather than against
P2's different viewpoints.

| Viewpoint | Pure black (P3 on / off) | Blown (on / off) | Mean luma (on / off) | P3 footprint |
| --- | --- | --- | --- | --- |
| A · pond from the bank | **0 % / 0 %** | 0 % / 0 % | 111.3 / 123.3 | 22.03 % |
| B · plaza from spawn | **0 % / 0 %** | 0 % / 0 % | 114.3 / 115.0 | 2.16 % |
| C · wide, holding both | **0 % / 0 %** | 0 % / 0 % | 142.7 / 145.2 | 4.65 % |

P2's post-fix baseline was 0 % / 0 % / 0.179 % crushed with no blown pixels; P3 introduces neither.
Mean luma drops where the water covers grass (A, −12.0), the water being darker than what it hides.
"Footprint" is the fraction of pixels that change when the P3 meshes are toggled, which doubles as
the evidence for "visible from spawn distance": the plaza is **2.16 %** of the frame from spawn.

### 9d. Performance

Round-robin, all shader variants pre-compiled, `gl.finish()` around every sample, first round
discarded, rAF confirmed not firing and `engine.stopRenderLoop()` called so the app's own loop could
not compete. **Two method failures are worth recording, because interleaving alone was not enough:**

1. A *fixed* config order within each round still produced an impossible ordering — `landmarkOff`
   (2.805 ms) faster than `bothOff` (2.984 ms), when `bothOff` draws strictly less. Shuffling the
   order **within** each round fixed it. P2's rule ("interleave, never one block each") is necessary
   but not sufficient.
2. Absolute medians drifted nearly 2x between runs with machine load (full-scene frame cost 0.92 →
   2.70 ms), enough to swamp an effect this small.

So the trustworthy statistic is the **paired within-round difference**, which cancels that drift.
30 rounds x 40 frames, three independent runs:

| Quantity | Run A | Run B | Run C | Frac. of rounds positive |
| --- | --- | --- | --- | --- |
| **P3 total** (shipped − bothOff) | **+0.158** | **+0.085** | **+0.255** | 0.83 / 0.97 / 0.83 |
| landmark, est. 1 (shipped − landmarkOff) | +0.102 | +0.063 | +0.192 | 0.73 / 0.90 / 0.77 |
| landmark, est. 2 (waterOff − bothOff) | +0.112 | +0.063 | +0.215 | 0.93 / 0.93 / 0.80 |
| water, est. 1 (shipped − waterOff) | +0.035 | +0.030 | −0.007 | 0.70 / 0.77 / 0.50 |
| water, est. 2 (landmarkOff − bothOff) | +0.000 | +0.020 | +0.015 | 0.50 / 0.63 / 0.57 |

The magnitude tracks machine load but the *structure* is identical in all three runs, and the two
independent estimates of each component agree and sum to the measured total. **P3 costs 0.09–0.26
ms/frame against a 16.7 ms vsync budget.** The landmark is the whole of it; the water is at or below
the noise floor. The ground probe added to `knight.ts` (9e) was timed separately at **0.00737 ms per
ray**, one ray per frame — 0.04 % of the budget.

Two caveats. This is not the machine P2 was measured on (full-scene cost 0.92–2.70 ms here against
P2's 2.137 ms), so only the within-session delta means anything and the cross-phase absolute in
HANDOFF §5 does not transfer. And "skipped" is `setEnabled(false)`, not the builders not running:
the water's scroll observer still ticks and the static bodies still exist. Negligible, but not zero.

### 9e. A pre-existing bug this phase exposed

P3 is the first thing in the hub the player is *meant* to stand on top of, and that surfaced a defect
in `knight.ts` that had nothing to do with P3 and had been latent since foot-planting was written.

Foot-planting dropped the visual knight by the gap between the capsule bottom and
**`terrainHeight(x, z)`** — the height *field*, not the surface the player is standing on. On any
raised collider the model was planted straight through it. Measured on the pedestal: the capsule
bottom was correctly at 1.843 on a 1.717 top, while the knight's lowest rendered vertex sat at
**1.167 — exactly `terrainHeight(-6, 32)`**, 0.550 low, the pedestal's height to the millimetre. On
open ground the same measurement was off by 0.001, so planting was always right on terrain.

The fix replaces the height-field lookup with a downward physics raycast from just above the soles,
falling back to `terrainHeight` on a miss so the worst case is exactly the old behaviour. The
character controller's own support probe could not be used: `CharacterSurfaceInfo` in this Babylon
version carries only normals and velocities, with no surface *position* to read a height from.

Two things this cost, recorded so they are not re-derived. **No physics assertion can see this bug** —
the capsule was always in the right place; only the rendered mesh was wrong, so the check has to
compare the knight's lowest rendered vertex against the collider. And **Step 2 as originally written
("stand on the pedestal") passes on the broken build** if an automated check teleports the capsule
on top, which is exactly what an automated check naturally does. The check only has teeth if the
character gets there under its own power.

**Known limitation, deliberately not fixed here:** `PhysicsCharacterController.maxStepHeight` is 0
(Babylon's default; `playerController` never raises it), so the capsule rides a 60° slope but cannot
climb a vertical face of *any* height. Walking at the pedestal jams at 2.21 from its axis — its 1.6
radius plus the 0.5 capsule. Jumping on is the intended interaction, so this is recorded rather than
worked around; a tapered plinth was built and measured working, then dropped for that reason. It is a
world-wide movement property and it constrains every future prop the player should be able to climb.

### 9f. Pillar geometry

Measured off the meshes as `position.y ∓ boundingBox.extendSize.y`, i.e. the actual mesh bottoms:

- **True base spread: 1.2369** · centre spread: 0.6184 · **crown spread: 0.0000** (all eight at 5.367)

The centre spread is exactly half the base spread because pillar height varies with base height, so
`position.y` — the *centre* — moves half as far as the base does. The implementation plan's Step 5
check read `position.y` and labelled it a base spread; Task 3's 0.618 was therefore a correct
centre-spread reading, not the inverted failure mode it resembled. Crowns dead level across 1.24 m of
base spread is §5's intent, and it holds.

### 9g. Against §7's five criteria

| # | Criterion | Status |
| --- | --- | --- |
| 1 | Water reads as water, sits in a terrain low | **Met** — surface −0.95 over a −1.51 floor, rim entirely on dry land, fog-correct (9a), 22 % of the frame from the bank |
| 2 | Landmark is a destination, working collision on every pillar and the pedestal | **Met** — eight of eight pillars stop the player at their own radius; the pedestal is jumped onto and stood on with the rendered knight exactly on its top (9b). Required a `knight.ts` fix (9e) |
| 3 | Matches P2's grade — palette, fog, no blown or newly crushed regions | **Met on the measurable parts** — 0 % blown and 0 % crushed at all three viewpoints (9c), fog blend 0.78–0.92 of EXP2 (9a). Palette family is reused constants (`0.55, 0.54, 0.52` from `scatter.ts`), which is a code fact, not a measurement |
| 4 | Player can wade in and walk out again | **Met** — in at z = 6.90, out at −17.19, zero stalled frames, 0.432 m deepest (9b) |
| 5 | fps holds | **Met** — +0.09–0.26 ms/frame on a 16.7 ms budget (9d) |

128 tests green, `tsc --noEmit` clean.
