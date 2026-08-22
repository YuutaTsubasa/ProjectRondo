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
| Sky | Unlit skydome, diameter 1000, `disableLighting`, `emissiveTexture` — gradient stops `#2b6cb0` → `#7fb2e5` → `#dcecf7`. **Note: the stop *names* were inverted relative to what the dome renders, so pre-P2 this rendered pale overhead and only mid-blue at the horizon; the deep blue sat at the nadir and never appeared — see §11b** | Pure emissive, so tone mapping remaps it; at 500 units out, any fog would swallow it |
| Sun | `DirectionalLight`, intensity 1.1, warm white, 1024 PCF shadow map | Unchanged by P2 |
| Ambient | `HemisphericLight`, intensity 0.45 | May need a nudge once tone mapping lands |
| Scatter / bushes / trees | `StandardMaterial` with deliberate **emissive floors** (grass `(0.10, 0.17, 0.06)`, bush `(0.05, 0.10, 0.03)`) so backlit billboards do not go black | Tuned *without* tone mapping — these are what ACES will shift most |
| Camera | `TargetCamera`, `minZ` 0.05, `maxZ` unset (babylon default 10000) | The pipeline attaches here |
| Post-processing | None | — |

**Distances**, which set the fog range: field is 100×100 (half-extent 50), the mountain ring sits at
radius 85 with heights 22–48 from a base of y −4, and the player is confined to roughly radius 42 by
the barrier. So the far side of the field is up to ~100 units away and the mountains are 43–127 away
depending on where the player stands — ring radius 85, less the barrier's radius-42 confinement at
the near end.

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
| **B** | **A, plus widen the sky gradient's pale band so the mountains sit against near-fog-coloured sky over their whole height** | **Chosen at design time — but measured to make the ridge worse, so A is what shipped. See §11a.** |
| C | Fog the sky too, at low density | Rejected: the skydome is 500 units out, so any useful density flattens the gradient into grey — it throws away the sky to save the mountains |

**Chosen: B** — *at design time.* Implementation measured B and found it makes the problem worse; the
shipped sky is approach **A**. See §11a before re-deriving this. The reasoning below is kept as the
original rationale, not as a description of the code.

The sky is one procedurally generated material, so re-weighting three gradient stops is
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
| `src/presentation/babylon/postProcessing.ts` | **New** — pipeline + fog, plus `samples = 4` (§11c) |
| `src/presentation/babylon/atmosphereColors.ts` | **New** — the horizon/fog colour, shared so the sky and the fog cannot drift apart |
| `src/presentation/babylon/hubScene.ts` | Call `createAtmosphere` after the camera is built |
| `src/presentation/babylon/environment.ts` | Skydome orientation fixed (§11b); horizon stop reads `HORIZON_HEX`; `skyMat.fogEnabled = false`. The §5 pale-band widening was tried and reverted (§11a) |
| `src/presentation/babylon/trees.ts` | PBR → StandardMaterial, texture level, emissive floor (§11) |
| `src/presentation/babylon/scatter.ts` · `terrain.ts` | **Untouched.** Measurement showed no drift needing correction in `scatter.ts`; `terrain.ts`'s `haze` is the deferred art-direction call in §11a |
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
Result, measured on the **final** shipped material (StandardMaterial + texture level + emissive floor)
with the grass beside the trees held as an untouched control at 0.069: near trunk 0.32 → **0.05**,
near canopy 0.19 → 0.09, mid canopy 0.47 → 0.13. Inverting EXP2 on the near trunk's 0.05 implies 30
units against the ~27 measured geometrically; its PBR blend of 0.32 implied 82.

(An earlier draft of this section quoted 0.04 / 0.08 / 0.11. Those were taken before the emissive floor
was restored and are superseded — brightening the surface changes the blend fraction.)

Two traps worth recording, both of which produced confident wrong answers before being caught:

- **A lever can look dead because you measured the wrong pixels.** StandardMaterial folds emissive in
  *before* multiplying by the diffuse texture (`clamp(diffuseBase*diffuseColor + emissiveColor +
  ambient) * baseColor`, with `baseColor` already scaled by `texture.level`), so on *lit* canopy a 4x
  emissive sweep moves the pixel by 3/255. That was read as "the `scatter.ts` floor does not transfer
  here" and the floor was removed — which sent the canopy's shaded undersides to pure black, 10.5 % of
  the frame from under a tree. The floor's entire purpose is the shaded side, so sampling lit points
  could not see it. Both levers ship: `diffuseTexture.level` (2.5) for what the sun reaches, the
  emissive floor (a 0.24 scalar on the hue vector normalised to green = 1, i.e. 0.24 green) for what it does not. They **multiply** — changing the level
  rescales the floor.
- **`readPixels` after `endFrame()` can return a post-process RTT, not the canvas** — it reads back a
  uniform colour and looks like a broken scene. Call `engine.restoreDefaultFramebuffer()` first.
  Likewise, toggling a material flag triggers async shader recompilation, so a measurement taken
  immediately after can reflect the *old* shader; this produced a non-monotonic sweep before it was
  spotted.

Note the knight is also a glTF PBR material and so shares behaviour (1), but it stays close to the
camera where fog is under 1 %, so it is left alone.

## 11a. Finding — approach B was measured and rejected; A shipped

§5 chose approach B: widen the sky's pale band up through the mountain ring's elevation so the ridge
sits against near-fog-coloured sky over its whole height. Implemented and measured, it made the ridge
**more** visible, not less: contrast between the ridge band and the sky immediately above it went from
109 to **169**.

The ridge's colour is simply unreachable by this gradient. Its blue channel is ~190 (`terrain.ts`'s
`haze`, partially blended with fog), which sits *below* every stop in the file — mid `#7fb2e5` is 229,
pale `#dcecf7` is 247 — so no stop position can meet it. The deeper cause is fog strength, not sky
colour: at the ring's ~95-unit distance and density 0.0076 the EXP2 factor is only ~41 %, nowhere near
enough to pull the ridge toward `FOG_COLOR`. Reaching ~80 % there needs roughly double the density,
which would fog the near field that §8 requires stay clear.

So the shipped sky is **approach A**, and DoD criterion 2 is deferred. The one remaining lever is the
mountain ring's own material colour (`terrain.ts`'s `haze`), moved toward the fog colour — a hand-picked
art-direction call, not a tuning constant. Whoever changes the ring's height, distance or colour should
re-measure this coupling.

## 11b. Finding — the skydome gradient's orientation was inverted (pre-existing)

Not introduced by P2, but fixed in it, and worth flagging because it is the single largest visual change
in the branch. `addColorStop(1.0, …)` renders at the **zenith** on this dome, not the horizon, so the
pre-P2 gradient — written as if 1.0 were the horizon — rendered **pale overhead and only mid-blue at the
horizon**: washed out rather than colour-inverted. The deep blue `#2b6cb0` sat at stop 0.0, which is the
**nadir** — below the terrain, never visible in any frame — so it was absent from the render rather than
misplaced within it.

Measured with a camera at y=30, sampling the centre pixel on the pre-fix gradient (whose pale
`#dcecf7` sat at 1.0): straight up → (220,236,247), exactly the pale stop; 45° up → (178,211,239);
horizontal → (134,181,223), which is the mid stop `#7fb2e5` (127,178,229), not the deep blue.

This is an inversion of the largest surface in the frame, made under a "the palette does not change"
constraint (§1). It is almost certainly the right fix — but it is invisible in §12's table, because both
columns contain it, and it deserves its own before/after when this branch is reviewed. §6's instruction
to stop and report rather than decide unilaterally applies: it was reported, and accepted.

## 11c. Finding — attaching the pipeline silently disabled MSAA

`hubScene.ts` creates the engine with `antialias: true`, which anti-aliases the **default framebuffer**.
Attaching a `DefaultRenderingPipeline` redirects the scene into an offscreen render target, where that
setting no longer applies, and Babylon defaults the pipeline's own `samples` to 1. So P2 as first
written would have shipped an image *more* aliased than pre-P2 — worst exactly where this scene has its
highest-frequency edges: tree canopies, grass billboards, the mountain ridge.

Pixel sampling cannot see this, which is why it survived to code review. Measured at viewpoint B as
adjacent-pixel luma steps (a hard step is a stair-step edge; anti-aliasing converts them to gradients):

| Config | Hard edges | Soft edges | Cost |
| --- | --- | --- | --- |
| samples 1 (as first written) | 109,999 | 117,065 | — |
| **samples 4 (shipped)** | **106,740 (−3.0 %)** | **135,049 (+15.4 %)** | ≤0.4 ms; medians could not separate it from samples 1 |
| samples 8 | 106,230 | 135,453 | roughly double, for no measurable gain |

FXAA was also tried and returned figures byte-identical to samples 1, i.e. the toggle did not take
effect in that harness; it was not pursued because this scene's aliasing is geometric, which is what
MSAA addresses.

## 11d. Finding — the material conversion dropped `twoSidedLighting`

Caught in review round 2, after the conversion had already shipped in this branch.

`tree.glb`'s single material is `"doubleSided": true`. Babylon's glTF loader turns that into **two**
properties on the `PBRMaterial` — `backFaceCulling = false` *and* `twoSidedLighting = true` — and the
conversion carried only the first. `StandardMaterial` gates its shader on
`!backFaceCulling && twoSidedLighting`, so with the flag left at its default every back-facing canopy
polygon was shaded using its front-facing normal: a leaf seen from behind was lit as though it faced
away from the sun.

Copying *some* of a material's properties is worse than copying none, because the result looks
plausible. The fix carries the rest of the set that changes how the material renders — the glTF
`baseColorFactor`'s RGB (`albedoColor` → `diffuseColor`) and A (`alpha`), and `alphaCutOff`. Today's
asset omits the factor entirely, so that part is latent; it matters because the surrounding code is
explicitly written for the asset-swap case, and a swapped GLB carrying a tint would have converted
cleanly, warned about nothing, and rendered the wrong colour.

Consequence worth stating plainly: `TREE_TEXTURE_LEVEL` (2.5) and `TREE_EMISSIVE` were both fitted
against renders that had this darkening baked in. Re-measured after the fix, the three DoD viewpoints
moved by less than half a luma point and C's crushed fraction improved slightly, so the constants were
left alone — but they were fitted to a bug, and anyone re-deriving them should start from scratch
rather than from those numbers.

## 12. Definition of done — measured

All figures from a 1280x720 render, three fixed viewpoints, same session. "Before" disables tone
mapping, bloom and fog only; the sky-gradient and tree-material fixes are code changes and are present
in both columns.

| Viewpoint | Pure black, before → after | Blown, after | Mean luma, before → after |
| --- | --- | --- | --- |
| A · spawn point | 0.001 % → **0 %** | 0 % | 97.9 → 117.7 |
| B · across the field to the mountains | 0.001 % → **0 %** | 0 % | 125.4 → 147.7 |
| C · under a tree | 0 % → **0.179 %** | 0 % | 95.6 → 99.7 |

Re-measured after the `twoSidedLighting` fix in §11d, which changed how every back-facing canopy
polygon is lit. The shift was small — C's crushed fraction 0.197 % → 0.179 %, mean luma up under 0.5 in
all three views — so `TREE_TEXTURE_LEVEL` and `TREE_EMISSIVE` were left as fitted rather than re-tuned.

No blown highlights anywhere and no crushed regions; the worst case is 0.2 % of the frame under a
canopy. Screenshots were captured with `canvas.toDataURL` off manually-driven frames, because the
preview pane never composited (see the baseline doc) — that is also why the buffer had to be resized to
1280x720 explicitly rather than by the pane.

Against §8's five criteria, honestly:

| # | Criterion | Status |
| --- | --- | --- |
| 1 | Side-by-side screenshots show depth, no blown or crushed regions | **Met** — the table above, plus the three before/after pairs |
| 2 | Mountains hazed across their height, not just at the base | **Not met — deferred.** §11a: the ridge keeps a visible edge (contrast 109) and no sky-gradient change closes it. The remaining lever is `terrain.ts`'s `haze`, a human art-direction call |
| 3 | Near field essentially fog-free | **Met** — 0.07 blend at ~35 units, 0.05 on a tree at ~27 |
| 4 | Palette recognisably the same | **Not evidenced by this table.** The sky-gradient and tree-material changes sit in *both* columns, and they are the two largest palette-affecting edits in the branch. Judged by eye and accepted by the human reviewer; the table cannot speak to it |
| 5 | fps holds | **Met** — see below |

### Performance, and why bloom stays

Measured as **render cost, not presented fps** — with the preview pane hidden `requestAnimationFrame`
does not run, so frames were driven manually with `gl.finish()` between samples. Round-robin, 9 rounds
of 60 frames per config, medians, all shader variants pre-compiled:

| Config | Median ms/frame | vs pre-P2 |
| --- | --- | --- |
| pre-P2 baseline | 1.837 | — |
| tone mapping only | 1.927 | +4.9 % |
| bloom at quarter scale | 2.047 | +11.4 % |
| **shipped — bloom at 0.5** | **2.137** | **+16.3 %** |

A first attempt measured each config in its own block and produced garbage — the same config timed
2.96 ms and 2.06 ms, and "bloom off" came out *faster* than "pipeline off". Interleaving the configs
and taking medians fixed it; run-to-run spread is still ~30 %, but the ordering is monotonic across
all four configs, which random noise would not produce.

**Bloom stays at 0.5.** §7's rule is "cut it if it costs more than 10 % fps", and +16 % of *render
time* is not 16 % of fps: the whole frame costs 2.1 ms against a 16.7 ms vsync budget, so P2 spends
0.3 ms of an 8x headroom and presented fps is unchanged at the cap. The rule should be re-applied if a
future phase actually approaches the budget — the quarter-scale option measured at +11.4 % and is the
first thing to reach for.
