# M4 · P2 — 光影與氛圍後製 (Lighting & Atmosphere) — Design

**Date:** 2026-08-21
**Status:** Approved (design), pending implementation plan
**Milestone:** M4 Refined Hub World — P2 (roadmap `2026-08-18-refined-hub-world-roadmap.md` §4)
**Predecessors:** P1 terrain & collision (PR #19), map scale-up (PR #21), run + jump (PR #23)

## 1. Goal

The hub has relief, a barrier rim and a distant mountain ring, but nothing tells the eye how far away
any of it is. Everything renders at the same clarity, so the world reads flat and the mountains look
like a painted wall standing behind the field rather than something kilometres off.

P2 adds the depth cue and lifts the image as a whole: **ACES tone mapping**, a **light bloom**, and
**distance fog** tuned to the scene's actual geometry.

**The palette does not change.** The goal is the same picture with depth, unblown highlights and
mountains that melt into the sky — not a restyle. That decision sets the budget for everything below:
the smallest recalibration that keeps the existing art reading correctly.

**Godrays are out of scope.** The roadmap marks them optional and §7 says to drop them first when
performance is tight; they are also the least aligned with a cohesion-first pass. Fog is where the
depth actually comes from.

## 2. What the scene looks like today

| Thing | Current state | Why it matters here |
| --- | --- | --- |
| Sky | Unlit skydome, diameter 1000, `disableLighting`, `emissiveTexture` — a zenith→horizon gradient `#2b6cb0` → `#7fb2e5` → `#dcecf7` | Pure emissive, so tone mapping remaps it; at 500 units out, any fog would swallow it |
| Sun | `DirectionalLight`, intensity 1.1, warm white, 1024 PCF shadow map | Unchanged by P2 |
| Ambient | `HemisphericLight`, intensity 0.45 | May need a nudge once tone mapping lands |
| Scatter / bushes / trees | `StandardMaterial` with deliberate **emissive floors** (grass `(0.10, 0.17, 0.06)`, bush `(0.05, 0.10, 0.03)`) so backlit billboards do not go black | Tuned *without* tone mapping — these are what ACES will shift most |
| Camera | `TargetCamera`, `minZ` 0.05, `maxZ` unset (babylon default 10000) | The pipeline attaches here |
| Post-processing | None | — |

**Distances**, which set the fog range: field is 100×100 (half-extent 50), the mountain ring sits at
radius 85 with heights 22–48 from a base of y −4, and the player is confined to roughly radius 42 by
the barrier. So the far side of the field is up to ~100 units away and the mountains are 85–127 away
depending on where the player stands.

## 3. Module and wiring

A new `src/presentation/babylon/postProcessing.ts` exporting `createAtmosphere(scene, camera)`. It owns
two things: the `DefaultRenderingPipeline` attached to the camera, and the scene's fog settings. Called
from `hubScene` after the camera exists.

`environment.ts` keeps its current job — *building* the lights and the sky — and is not made
responsible for the pipeline. Its sky gradient changes (§5), but the gradient is still its own.

**Deep-import trap.** Post-processes follow the same rule as `StandardMaterial` and the physics
component (HANDOFF §7): each needs its side-effect import or it silently does nothing. Missing one
produces no error, just no effect — the failure mode to watch for while implementing.

## 4. Tone mapping, exposure and bloom

On the pipeline's `imageProcessing`:

- **ACES tone mapping** on.
- **Exposure and contrast** nudged, not pushed. Values are settled against screenshots, not guessed
  here; the target is "no blown highlights on the sunlit grass, no crushed blacks on the shaded side of
  a tree".

Bloom is deliberately restrained: **high threshold, low weight**, so only the brightest sky and the
sunlit tips of grass bleed. A cohesion pass does not want a glowing field.

Everything else the pipeline offers — depth of field, chromatic aberration, grain, sharpening — stays
**off**, so no render target is allocated for an effect nobody asked for.

## 5. Fog, and reconciling it with the sky

This is the part with a real decision in it. The sky is a gradient from deep blue at the zenith to pale
at the horizon, and the mountains stand from y −4 up to y ≈ 44. A single fog colour can only match the
gradient at one height: fog the mountains toward the horizon's pale and their bases melt away
convincingly while their tops still sit visibly against mid-blue.

Three ways to reconcile them were considered:

| | Approach | Verdict |
| --- | --- | --- |
| A | Fog colour = horizon pale, sky exempt from fog | Cheapest, but the mountain tops keep a visible edge |
| **B** | **A, plus widen the sky gradient's pale band so the mountains sit against near-fog-coloured sky over their whole height** | **Chosen** |
| C | Fog the sky too, at low density | Rejected: the skydome is 500 units out, so any useful density flattens the gradient into grey — it throws away the sky to save the mountains |

**Chosen: B.** The sky is one procedurally generated material, so re-weighting three gradient stops is
a small, contained change, and it is exactly what "cohesion first" is meant to buy. The pale band moves
up (roughly, the mid stop shifts from 0.5 toward ~0.62 and moves closer to the fog colour), leaving the
zenith blue intact overhead where nothing needs to blend.

**Fog itself:** `FOGMODE_EXP2`, colour matching the sky's horizon. Exponential-squared reads as aerial
perspective rather than the flat curtain linear fog gives. A starting density near **0.0076** puts
roughly 9 % haze at 40 units and 50 % at 110 — clear where the player plays, heavy where the mountains
are. Final value is set visually.

**`skyMat.fogEnabled = false`** is mandatory, not an optimisation: without it the skydome at 500 units
renders as solid fog colour.

## 6. Recalibration — the risky part

The emissive floors on grass, bushes and leaves exist to compensate for the *absence* of tone mapping.
ACES will remap them, most likely toward flat and grey. Trees, the ground texture and the sky itself
shift too.

The method is measurement, not guesswork: sample rendered pixels at fixed camera positions before and
after, and correct what actually moved. `readPixels` at known screen points is how the terrain work was
verified and the same approach applies (HANDOFF §7: trust the render, not the source values).

**If recalibration cannot preserve the palette** — if the scene can only be made to read well by
warming or saturating it — that is a change of art direction, not a tuning detail. Stop and report it
rather than deciding unilaterally.

## 7. Testing

Nothing here is pure logic, so this phase is **verified in-browser**, per the project's convention that
babylon scene code is not unit-tested. Concretely:

- **Before/after screenshots** from identical camera positions: the spawn point, a view across the field
  toward the mountains, and a shaded spot under a tree.
- **Pixel sampling** at fixed points to show highlights are not blown and shadows not crushed.
- **fps before and after, measured the same way**, with the whole scene loaded — roadmap §7 requires the
  cumulative scene, and scatter alone already sits near the vsync cap. If bloom costs more than it
  gives on this hardware, bloom is what gets cut.

## 8. Definition of done

- Side-by-side screenshots show a more cohesive image with visible depth, no blown or crushed regions.
- Distant mountains read as distant — hazed and blending into the sky across their height, not just at
  the base.
- The near field is essentially fog-free; gameplay legibility is unchanged.
- The palette is recognisably the same as before.
- fps holds against the pre-P2 measurement on the full scene.

## 9. Out of scope

- Godrays / volumetric light scattering.
- Any day-night cycle. The sun stays fixed; fog and sky colours are constants, not derived from sun
  direction. (Deriving them is the natural extension if a cycle is ever wanted.)
- Restyling the palette (§1).
- Depth of field, chromatic aberration, grain.
- The known post-landing speed dip (run/jump spec §15) — physics, unrelated.

## 10. Modules touched

| Module | Change |
| --- | --- |
| `src/presentation/babylon/postProcessing.ts` | **New** — pipeline + fog |
| `src/presentation/babylon/hubScene.ts` | Call `createAtmosphere` after the camera is built |
| `src/presentation/babylon/environment.ts` | Sky gradient stops re-weighted (§5); `skyMat.fogEnabled = false`; possible ambient nudge |
| `src/presentation/babylon/scatter.ts` · `trees.ts` · `terrain.ts` | Emissive/colour corrections only if measurement shows drift (§6) |
| `docs/HANDOFF.md` | P2 recorded once it lands |

## 11. Finding — the trees were not over-fogged, they were the only PBR surface

Reported during implementation: *"霧感覺只有樹有套用,遠處的地形、草和草叢都沒有"*.

Fog was in fact uniform and distance-correct. Measured across the frame at the spawn viewpoint, the
blend fraction rose monotonically with distance exactly as `FOGMODE_EXP2` predicts — mountains 0.50,
far terrain 0.19, mid-field 0.12, near grass 0.07. Nothing was under-fogged.

The trees were the anomaly, for two compounding reasons:

1. **They are the hub's only `PBRMaterial`** (from the Tripo GLB); everything else is
   `StandardMaterial`. PBR shades and mixes fog in *linear* space, where a small blend toward a
   near-white fog colour multiplies a dark pixel several-fold. StandardMaterial mixes in gamma space,
   where the same blend barely moves it. A tree ~27 units out took a **0.32** fog blend where EXP2
   asks for 0.04 and the grass beside it took 0.07 — a 4.6x discrepancy at the same depth.
2. **Fog lightens dark surfaces far more visibly than bright ones.** At 19 % haze the canopy's luma
   went 24 → 66 (2.75x); at 7 % the grass went 148 → 156 (1.05x). Same fog, 50x the visual impact.

Fix: rebuild the GLB material as a `StandardMaterial` over the same albedo texture (`trees.ts`). This
is not a downgrade — the source is metallic 0 with no metallic-roughness map, i.e. diffuse already.
Result, with the grass held as an untouched control at 0.069: near trunk 0.32 → **0.04** (EXP2 says
0.041), near canopy 0.19 → 0.08, mid canopy 0.47 → 0.11.

Two traps worth recording, both of which produced confident wrong answers before being caught:

- **`emissiveColor` does not transfer from `scatter.ts`.** StandardMaterial folds emissive in *before*
  multiplying by the diffuse texture, so on a dark canopy texel it scales to nothing — a 4x sweep moved
  the canopy by 3/255. Gamma-space shading is instead compensated with `diffuseTexture.level` (2.5).
- **`readPixels` after `endFrame()` can return a post-process RTT, not the canvas** — it reads back a
  uniform colour and looks like a broken scene. Call `engine.restoreDefaultFramebuffer()` first.
  Likewise, toggling a material flag triggers async shader recompilation, so a measurement taken
  immediately after can reflect the *old* shader; this produced a non-monotonic sweep before it was
  spotted.

Note the knight is also a glTF PBR material and so shares behaviour (1), but it stays close to the
camera where fog is under 1 %, so it is left alone.
