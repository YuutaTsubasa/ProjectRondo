# P4 — Life & motion (生命感與動態) — design

Date: 2026-09-04. Milestone M4, phase P4 — the last phase before M4 closes and the project pivots to
game modes. Roadmap: `2026-08-18-refined-hub-world-roadmap.md` §4 P4.

## 1. Scope, and a documented disagreement this settles

The roadmap's bounded DoD for P4 was three things: **grass and trees sway with wind; clouds drift; at
least one kind of ambient creature or particle moves through the scene** — with the motion reading as
calm rather than distracting, and 60 fps holding.

**The third was cut on 2026-09-04, after being built.** See §5. Both this spec and the roadmap's DoD
were amended rather than left showing an unmet bar. The shipped phase is wind and clouds.

Two other files described a fourth item. `src/domain/hub/waterBody.ts`'s header says "P4's
shallow-water feedback (splashes, slowdown) will read the same shape", and HANDOFF §5 repeats it. That
is **not** in this phase, by decision: splashes and in-water slowdown are movement feel, they would
reach into `playerController` and the pure movement domain, and they are the only candidate item that
changes gameplay rules rather than adding visuals. **This spec is the tie-break: shallow-water feedback
is out of P4.** Part of the work below is correcting those two files so the disagreement does not
outlive this phase. `WaterBody` stays exactly as it is — it remains the right shape for whoever does
build that feedback later.

Also out: wind *forces* on the player or on physics bodies. Wind here is a shading effect and nothing
in the simulation reads it.

## 2. Budget

Re-measured 2026-09-04 on a visible pane — `2026-08-25-shadow-quality-design.md` §7, "Task 6
(re-measured 2026-09-04)". At 1280x720 the shipped scene costs ~5.1 ms of the 16.7 ms / 60 fps budget,
leaving **~11.6 ms (~3.3x)**; scaled by that section's measured ratios, 1080p leaves **~8.1 ms (~1.9x)**.

Two constraints from that same measurement bind everything below:

- **No delta under ~0.4 ms is resolvable on this machine** (three measurements of one identical config,
  seconds apart, spread by a median factor of 1.40). P4 must therefore report costs it cannot resolve
  as *unresolved*, never as a small number that happens to fall out of one sample.
- **Only paired deltas are quotable.** Absolute frame times drifted 3.49–5.64 ms across a single
  session for the same config.

P4's shipped items are expected to land cheap: wind at or below the resolution floor (it is vertex
arithmetic on draw calls that already exist), and the clouds as the only plausibly-measurable item
(one large transparent sphere is fill, and fill is ~2.1 ms/Mpx in this scene). The ambient-life layer
would have added a dozen tiny draw calls; it was cut (§5), so it adds none. If the total lands above
~1 ms, the cheapest recovery is not in P4 at all: the knight's 47 shadow-caster meshes cost 1.73 ms.

## 3. Wind

### 3a. Technique — a material plugin, not a new material

Three routes were considered.

1. **`MaterialPluginBase`, injecting into the existing materials.** Chosen. Every swaying surface
   keeps the material it already has, along with fog, shadow *receiving* and thin instancing, none of
   it re-derived.

   **All three are `StandardMaterial`.** Grass and flowers are alpha-test cross cards built that way
   from the start; the trees only *look* like the exception. P2 moved them **off** PBR and rebuilt them
   as `StandardMaterial` over the same albedo texture, because PBR mixes fog in linear space and they
   bleached to grey while the grass beside them did not — `trees.ts`'s block comment on
   `TREE_TEXTURE_LEVEL` is the measured record. So one plugin against one shader covers the whole
   phase. (An earlier draft of this spec had the trees on PBR, from misreading HANDOFF's "trees rebuilt
   off PBR" as "onto PBR". Corrected here before any code was written.)
2. **`NodeMaterial`.** Rejected. It replaces the material wholesale, so every property those files
   carefully set — `transparencyMode = MATERIAL_ALPHATEST`, `useAlphaFromDiffuseTexture`,
   `backFaceCulling = false`, and the whole PBR-to-Standard conversion P2 measured its way to — has to
   be rebuilt inside the graph and kept in sync by hand. It buys nothing here; the displacement is a
   few lines of arithmetic.
3. **CPU-side matrix updates.** Rejected on sight: 16 000 grass matrices rewritten per frame, against a
   whole-frame budget of 16.7 ms.

### 3b. Hook point — verified against the installed 9.21.0, not assumed

Read out of `node_modules/@babylonjs/core/Shaders/` rather than recalled:

- `default.vertex` — the shader **all three** swaying materials compile to (§3a) — exposes
  `CUSTOM_VERTEX_UPDATE_POSITION` and `CUSTOM_VERTEX_UPDATE_WORLDPOS`. `pbr.vertex` exposes the same
  set, so nothing here would have to change if a PBR surface ever needs to sway, but no surface in P4
  is one.
- `CUSTOM_VERTEX_UPDATE_POSITION` sits **before** `#include<instancesVertex>`, so `finalWorld` does not
  exist yet there — a thin instance's world position is unavailable, and every instance would sway in
  the same phase. It is the wrong hook.
- `CUSTOM_VERTEX_UPDATE_WORLDPOS` sits after `vec4 worldPos=finalWorld*vec4(positionUpdated,1.0)` and
  **before both** `gl_Position=viewProjection*worldPos` and `vPositionW=vec3(worldPos)`. Displacing
  `worldPos` there therefore moves the rasterized vertex *and* the world position that lighting and fog
  read, consistently. `positionUpdated` is still in scope for the local bend weight. **This is the
  hook.**

### 3c. The displacement

At the hook, per vertex:

- **Phase** from `dot(worldPos.xz, windDir) * spatialFreq - windTime * speed`, so neighbouring
  instances are out of phase and gusts read as travelling across the field rather than the whole
  meadow pulsing in unison.
- **Envelope** as two summed sines at incommensurate frequencies, so the motion does not read as a
  metronome.
- **Bend weight** from `positionUpdated.y / bendHeight`, squared. Squaring is what keeps the base
  planted: a linear weight lifts the root off the ground, which on an alpha-test card reads as the tuft
  detaching from the terrain.
- Displacement is applied to `worldPos.xz` only. No vertical component: grass that bobs up and down
  separates from its own ground contact, and the cards have no thickness to hide it.

`bendHeight` is per-material, and **must be read, not hard-coded**. Grass and flower cards are built by
`crossCard` with their base baked to y=0, so their heights are their `size` arguments exactly — 0.5 and
0.22 (`scatter.ts`). The tree canopy's height is a property of `tree.glb` and has to come from the
container meshes' bounding boxes at load time; a guessed constant there produces either no visible sway
or a canopy that shears off its trunk.

Two scale interactions, both deliberate. `positionUpdated` is **local** space — the thin-instance
matrix and the per-tree `root.scaling` are both applied later, in `finalWorld` — so a single
`bendHeight` per material is correct across instances of different sizes, and `tree.glb`'s
~1-unit-tall normalisation is what `bendHeight` measures, not the 6x `BASE_SCALE` a tree ends up at.
The displacement itself is in **world** units rather than in fractions of a plant's own size — wind is a
property of the air, not of the plant, so nothing here scales the push by the surface's height.

**That does not make it one world distance for the whole scene, and an earlier draft of this section
said it did.** `applyWind` takes `amplitude` per call site: grass and flowers get 0.06 (peak ~0.09) and
trees get 0.2 (peak ~0.30), so a tree tip travels about 3.3x what a grass tip does. The reason is not
scale but stiffness: a grass card is uniformly flexible along its whole length, whereas a tree's trunk
is rigid and only the crown gives, so a real tree in a breeze deflects a few percent of its height where
grass bends tens of percent. Matching the proportions instead was tried — 0.6 on the trees, putting the
canopy at ~15% lean against the grass's ~18% — and the project owner reported it as visibly too much.
`wind.ts`'s `applyWind` doc carries the per-call-site values and that history.

### 3d. Ownership and time

`src/presentation/babylon/wind.ts` owns all of it and exports two things: the plugin, and
`createWind(scene)`, which registers **one** `scene.onBeforeRenderObservable` handler that accumulates
`engine.getDeltaTime()` into the shared time value every plugin instance binds. Deltas, not
`performance.now()`, so the field stops when the scene stops rather than jumping on resume.

`scatter.ts` and `trees.ts` gain one call each and know nothing about the shader.

Amplitude, speed and spatial frequency are art-direction constants whose only honest test is the DoD's
"calm, not distracting" seen in a running browser. **That test was not run for any of them**, and each
constant says so where it lives rather than here: `wind.ts` marks `SPATIAL_FREQ` and `SPEED` *Untuned* —
nobody has watched the field move — `trees.ts` marks `TREE_WIND_AMPLITUDE` *Still unverified*, and
`clouds.ts` marks `DRIFT_SPEED` *Untuned*. The one number that moved did so on a report rather than an
observation: the tree amplitude came down from 0.6 to 0.2 because the owner found 0.6 too strong, and
0.2 itself has not been looked at. Each doc comment carries the mapping needed to move its constant
without re-deriving it.

### 3e. Known limitation: the shadow pass cannot sway

`shadowMap.vertex` exposes **only** `CUSTOM_VERTEX_DEFINITIONS` — there is no injection point anywhere
between `vec3 positionUpdated=position;` and `vec4 worldPos=finalWorld*vec4(positionUpdated,1.0);`.
The sway therefore **cannot** be replicated into the shadow map by this technique. Consequences:

- **Grass and flowers: unaffected.** They receive but do not cast (`scatter.ts`, Task 7's decision).
- **Trees: a swaying canopy casts a still shadow.** All 20 of them cast.

This was not designed around in advance, because whether it is *visible* is a rendering question that
argument cannot settle: shadow darkness is 0.15, and a tree's own shadow falls largely under its own
canopy. The sway was to ship and then be looked at, with a stated fallback if it read wrong — restrict
tree displacement to the outer canopy at a small amplitude, trading sway magnitude for a shadow
mismatch small enough to disappear.

**Outcome: not observed.** The sway shipped at `TREE_WIND_AMPLITUDE` 0.2 and nobody has looked at the
mismatch, so this section records no sighting — the fallback was neither taken nor ruled out. That is
the third unverified item of this phase, alongside the tree amplitude itself and §7's frame-cost
measurement, and it is still not a question to be resolved by opinion: whoever next runs the scene
should look at a canopy against its own shadow and write the answer here.

## 4. Clouds

A second inward-facing sphere just inside the skydome (`environment.ts`'s `sky` is diameter 1000,
`BACKSIDE`, `infiniteDistance`), in a new `src/presentation/babylon/clouds.ts`:

- Unlit `StandardMaterial`, alpha texture drawn procedurally into a `DynamicTexture` — the same
  technique `grassAlphaTexture` and `skyGradientTexture` already use, so **no new asset and nothing new
  under Git LFS**.
- `fogEnabled = false` and `infiniteDistance = true`, for exactly the reason `environment.ts` records
  for the skydome: at that distance scene fog would flatten it into a sheet of fog colour.
- Drift by setting `uOffset` per frame from the same accumulated time as §3d. Which way the sky then
  travels is decided by the sign of the drift constant and settled by looking: clouds crossing the sky
  against the grass would read as two unrelated effects.

The cloud texture must be drawn to **tile seamlessly in u**, or the drift will show a visible seam
sweeping past on a loop.

**The drift is a u scroll and cannot be anything else.** A u scroll is a rotation of the pattern about
+Y, and that is the only rotation the cloud band survives — the band is an annulus about +Y, so any
rotation with a horizontal component carries it below the horizon and, at half a turn, inverts it
entirely. That shipped: the drift was briefly a dome rotation about the horizontal axis perpendicular
to the wind, so that every point of the dome travelled along the wind's true bearing from any viewing
angle. It empties the sky once per cycle — sampled over the band, the fraction still above the horizon
falls 100% → 51% → 0% across 126 s. `clouds.ts`'s `createClouds` carries the measurement.

The price is that the drift is azimuthal: it reads as travelling along the wind's bearing from the two
viewing azimuths where the ring's tangent is that bearing, and crosswise from the two at right angles
to them. **That is accepted**, and it is why the wind direction is not an input to the clouds at all.

This is the one part of P4 with a real fill cost, and §2's floor applies: it gets a paired measurement.

## 5. Ambient life — built, then cut

**This layer is not in the shipped phase.** It was designed, implemented and reviewed, and then removed
on 2026-09-04 at the project owner's decision. The section is kept rather than deleted because the
roadmap's P4 DoD used to require it, and a requirement that vanishes without explanation is
indistinguishable from one that was quietly missed.

What was built: butterflies. A pure, engine-agnostic wander path —
`butterflyAt(seed, t) -> { x, z, heightAboveGround, wingPhase }` in `src/domain/hub/butterfly.ts` —
bounded by construction rather than by clamping (two sines per axis whose amplitudes sum to 1, so
`HOME_MAX + sqrt(WANDER^2 + (WANDER/WIND_STRETCH)^2)` = 28.13 < the 30-unit limit), covered by six
Vitest cases, and driving ten yaw-billboarded alpha-cutout planes in
`src/presentation/babylon/butterflies.ts` that rode `terrainHeight` and skimmed the pond surface.
An independent review swept 200 seeds x 20 000 samples and found max radius 27.686 and max speed
2.307 against those bounds.

Why it went: the owner found them startling rather than calming — the exact opposite of the DoD's own
"calm, not distracting" bar, which makes this a design failure of the layer and not a matter of taste
to argue with. Drifting pollen and distant circling birds were both offered as substitutes, since
either would have satisfied the DoD's "creature **or particle**" wording without anything darting near
the camera, and both were declined: the phase closes without this layer.

The roadmap's P4 DoD and its §6 "world done" checklist were amended the same day to strike the
ambient-life clause, with the same reasoning recorded there. The implementation is in git history
(commits `432a5da` and `22d3915`, removed by `b0bb07b`) if it is ever wanted.

One piece of it survives: `src/domain/hub/windDirection.ts`. It was extracted so the shader and the
butterfly path could share one definition of the wind direction instead of hand-keeping two copies.
With the path gone the shader is its only reader — the clouds do not take a direction (§4) — so it is
now a single-consumer constant, kept in the domain because the wind's bearing is a fact about the hub
world rather than about the shader, and pinned unit-length by `tests/domain/hub/windDirection.test.ts`
because the shader's phase and amplitude both scale with its length.

## 6. Modules

| File | Status | Purpose |
| --- | --- | --- |
| `src/presentation/babylon/wind.ts` | new | The plugin, the shared wind field, `createWind(scene)` |
| `src/presentation/babylon/clouds.ts` | new | Drifting cloud dome |
| `src/domain/hub/windDirection.ts` | new | The one wind direction, read by the wind shader |
| `src/domain/math/rng.ts` | new | The mulberry32 PRNG, moved out of `scatter.ts` so `clouds.ts` can share it |
| `tests/domain/math/rng.test.ts` | new | Pins `rng`'s exact output sequence |
| `tests/domain/hub/windDirection.test.ts` | new | Pins the wind direction unit-length (§5, §7 item 1) |
| `src/presentation/babylon/scatter.ts` | edit | Its private PRNG moved to `rng.ts`; one `applyWind` call added for grass and flowers |
| `src/presentation/babylon/trees.ts` | edit | One `applyWind` call, `bendHeight` from the bounding box |
| `src/presentation/babylon/hubScene.ts` | edit | Wire `createWind` and `createClouds` |
| `src/domain/hub/waterBody.ts` | edit | Drop the "P4 will read this" claim (§1) |
| `docs/HANDOFF.md` | edit | Same correction |

Each new module has one purpose and no knowledge of the others' internals, with two things shared
across them: the accumulated wind time, owned by `wind.ts`, and the PRNG in `rng.ts`, shared by
`scatter.ts` and `clouds.ts` so the two cannot drift apart.

## 7. Verification

Per the repo's split: the pure domain gets Vitest TDD; the scene gets in-browser verification.

1. **Domain** — the pure pieces that shipped: `src/domain/math/rng.ts`, pinned to its exact sequence
   because it seeds the whole hub layout, and `src/domain/hub/windDirection.ts`, pinned unit-length
   because the shader's phase and amplitude both scale with that length (§5). Red before green. (This
   item used to point at §5a, the butterfly path's properties; that layer was cut — see §5 — and its
   tests went with it.)
2. **Wind reads as wind** — in-browser: the field's motion is coherent and travelling, not a uniform
   pulse; tuft bases stay planted (the squared bend weight's job); motion is calm at the shipped
   amplitude.
3. **The tree shadow mismatch (§3e)** — its own task, resolved by looking, not by argument. Record what
   was seen either way; if the fallback is taken, record the amplitude it settled at.
4. **Clouds** — drift is visible and slow; **no seam** crosses the sky over a full texture loop (watch
   one whole period, not a few seconds); the dome does not fog or take lighting.
5. **Frame cost** — paired measurement, using the harness and protocol from
   `2026-08-25-shadow-quality-design.md` §7, on a **visible** pane, per item and for P4 as a whole.
   Anything under ~0.4 ms is reported as unresolved, with the drift figure quoted alongside.

**Status as shipped:** item 1 is done. Items 2, 3 and 5 were **not performed** — nobody has watched the
field move (§3d), looked at a canopy against its own shadow (§3e), or measured the frame cost. Of item 4
only the band's placement was verified, by the probe measurement `clouds.ts` records; the drift, the seam
over a full 250 s loop, and whether the layer reads as cloud at all are unwatched.

## 8. Done

P4 is done when the roadmap's bounded DoD holds **as revised on 2026-09-04** (§5): grass and trees
sway subtly, clouds drift, the motion reads calm rather than busy, and 60 fps holds on the cumulative
scene — checked with everything from P1–P3 loaded, per roadmap §7, never on the feature in isolation.

Closing P4 closes M4. The roadmap's §6 "world done" checklist should be walked from spawn as the last
act of this phase, and whatever it turns up recorded — that walkthrough is the gate to game modes.

## 9. Deliberately out

- Shallow-water feedback — §1. Splashes, slowdown, wet shading; a separate piece of work.
- Wind as a simulated force. Nothing but shaders reads the wind.
- Ambient life of any kind — butterflies, birds, pollen. Cut on 2026-09-04 and struck from the DoD;
  see §5 for what was built and why it went. The sky above the clouds is empty, and a distant circling
  bird remains a cheap later addition if it is ever wanted.
- Anything about the knight's 47 shadow-caster meshes. It is the biggest single item in the frame
  (1.73 ms) and it is **not** P4's job; P4's budget is not tight enough to need it.
