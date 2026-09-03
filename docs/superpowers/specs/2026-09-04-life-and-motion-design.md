# P4 — Life & motion (生命感與動態) — design

Date: 2026-09-04. Milestone M4, phase P4 — the last phase before M4 closes and the project pivots to
game modes. Roadmap: `2026-08-18-refined-hub-world-roadmap.md` §4 P4.

## 1. Scope, and a documented disagreement this settles

The roadmap's bounded DoD for P4 is three things: **grass and trees sway with wind; clouds drift; at
least one kind of ambient creature or particle moves through the scene** — with the motion reading as
calm rather than distracting, and 60 fps holding.

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

P4's three items are expected to land: wind at or below the resolution floor (it is vertex arithmetic
on draw calls that already exist), clouds as the only plausibly-measurable item (one large transparent
sphere is fill, and fill is ~2.1 ms/Mpx in this scene), butterflies as a dozen tiny draw calls. If the
total lands above ~1 ms, the cheapest recovery is not in P4 at all: the knight's 47 shadow-caster
meshes cost 1.73 ms.

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
The displacement itself is in **world** units, so every tuft and every tree tip travels the same
distance regardless of its own scale. That is the right way round: wind is a property of the air, not
of the plant.

### 3d. Ownership and time

`src/presentation/babylon/wind.ts` owns all of it and exports two things: the plugin, and
`createWind(scene)`, which registers **one** `scene.onBeforeRenderObservable` handler that accumulates
`engine.getDeltaTime()` into the shared time value every plugin instance binds. Deltas, not
`performance.now()`, so the field stops when the scene stops rather than jumping on resume.

`scatter.ts` and `trees.ts` gain one call each and know nothing about the shader.

Amplitude, speed and spatial frequency are art-direction constants tuned in the browser against the
DoD's "calm, not distracting", and they carry their tuned values in doc comments the way this repo's
other measured constants do.

### 3e. Known limitation: the shadow pass cannot sway

`shadowMap.vertex` exposes **only** `CUSTOM_VERTEX_DEFINITIONS` — there is no injection point anywhere
between `vec3 positionUpdated=position;` and `vec4 worldPos=finalWorld*vec4(positionUpdated,1.0);`.
The sway therefore **cannot** be replicated into the shadow map by this technique. Consequences:

- **Grass and flowers: unaffected.** They receive but do not cast (`scatter.ts`, Task 7's decision).
- **Trees: a swaying canopy casts a still shadow.** All 20 of them cast.

This is not designed around in advance, because whether it is *visible* is a rendering question that
argument cannot settle: shadow darkness is 0.15, and a tree's own shadow falls largely under its own
canopy. The plan is to ship the sway and look at it, with a stated fallback if it reads wrong —
restrict tree displacement to the outer canopy at a small amplitude, trading sway magnitude for a
shadow mismatch small enough to disappear. **A verification task exists specifically for this** (§7);
it is not to be resolved by opinion.

## 4. Clouds

A second inward-facing sphere just inside the skydome (`environment.ts`'s `sky` is diameter 1000,
`BACKSIDE`, `infiniteDistance`), in a new `src/presentation/babylon/clouds.ts`:

- Unlit `StandardMaterial`, alpha texture drawn procedurally into a `DynamicTexture` — the same
  technique `grassAlphaTexture` and `skyGradientTexture` already use, so **no new asset and nothing new
  under Git LFS**.
- `fogEnabled = false` and `infiniteDistance = true`, for exactly the reason `environment.ts` records
  for the skydome: at that distance scene fog would flatten it into a sheet of fog colour.
- Drift by advancing `uOffset` per frame from the same accumulated time as §3d, in the same direction
  as the wind — clouds crossing the sky against the grass would read as two unrelated effects.

The cloud texture must be drawn to **tile seamlessly in u**, or the drift will show a visible seam
sweeping past on a loop.

This is the one part of P4 with a real fill cost, and §2's floor applies: it gets a paired measurement.

## 5. Butterflies

The DoD asks for at least one kind of ambient creature. Butterflies, and they are also the only part of
P4 with a genuinely pure, testable core — which is where the project's TDD/DDD discipline earns its
keep.

### 5a. Domain — `src/domain/hub/butterfly.ts`

```ts
butterflyAt(seed: number, t: number): { x: number; z: number; heightAboveGround: number; wingPhase: number }
```

Pure, deterministic, no engine imports. It returns a **height above the ground, not a world Y** — ground
height is `terrainHeight`, which lives in the presentation layer, and reaching for it here would put an
engine-adjacent dependency inside the domain. Presentation adds the two.

The path is a slow wandering loop — summed sinusoids at incommensurate frequencies, per-seed phase
offsets — drifting gently along the same wind direction as §3 so the whole scene shares one sense of
which way the air is moving. `wingPhase` is a separate, much faster cycle, returned as 0..1 so the
presentation layer decides what a wingbeat looks like.

Vitest, red before green:

- same `(seed, t)` returns the same value; different seeds do not collapse onto one path;
- `x`/`z` stay inside a configured radius for large `t` (a butterfly must not wander past the barrier
  or off the map);
- `heightAboveGround` stays inside its band — never negative (underground) and never above the band's
  top;
- position is continuous: bounded displacement per small `dt`, which is what catches a path that
  teleports at a period boundary;
- `wingPhase` stays in 0..1 and wraps without a discontinuity in the beat.

### 5b. Presentation — `src/presentation/babylon/butterflies.ts`

8–12 small billboard planes, wing texture drawn into a `DynamicTexture` (no new asset again), each
positioned per frame from `butterflyAt(seed_i, t)` plus `terrainHeight` at its x/z. Not pickable, no
physics, no colliders, and **not** registered with `shadows` — a butterfly's shadow is not worth a
draw call per cascade, and §2 says exactly where shadow draw calls go.

Start as a dozen ordinary meshes. Thin-instancing them is a real option but it is an optimization, and
§2's floor means a dozen tiny draw calls are very likely unresolvable; measure before adding the
machinery.

## 6. Modules

| File | Status | Purpose |
| --- | --- | --- |
| `src/presentation/babylon/wind.ts` | new | The plugin, the shared wind field, `createWind(scene)` |
| `src/presentation/babylon/clouds.ts` | new | Drifting cloud dome |
| `src/presentation/babylon/butterflies.ts` | new | Billboards driven by the domain path |
| `src/domain/hub/butterfly.ts` | new | Pure flight path |
| `tests/domain/hub/butterfly.test.ts` | new | The properties in §5a (mirroring `tests/domain/hub/character/`) |
| `src/presentation/babylon/scatter.ts` | edit | One `applyWind` call for grass and flowers |
| `src/presentation/babylon/trees.ts` | edit | One `applyWind` call, `bendHeight` from the bounding box |
| `src/presentation/babylon/hubScene.ts` | edit | Wire `createWind`, `createClouds`, `createButterflies` |
| `src/domain/hub/waterBody.ts` | edit | Drop the "P4 will read this" claim (§1) |
| `docs/HANDOFF.md` | edit | Same correction |

Each new module has one purpose and no knowledge of the others' internals. The only shared thing is the
accumulated wind time, and `wind.ts` owns it.

## 7. Verification

Per the repo's split: the pure domain gets Vitest TDD; the scene gets in-browser verification.

1. **Domain** — §5a's properties, red before green.
2. **Wind reads as wind** — in-browser: the field's motion is coherent and travelling, not a uniform
   pulse; tuft bases stay planted (the squared bend weight's job); motion is calm at the shipped
   amplitude.
3. **The tree shadow mismatch (§3e)** — its own task, resolved by looking, not by argument. Record what
   was seen either way; if the fallback is taken, record the amplitude it settled at.
4. **Clouds** — drift is visible and slow; **no seam** crosses the sky over a full texture loop (watch
   one whole period, not a few seconds); the dome does not fog or take lighting.
5. **Butterflies** — they stay in the field, do not sink into or hover above the terrain across a walk
   around the map, and read as alive rather than as drifting sprites.
6. **Frame cost** — paired measurement, using the harness and protocol from
   `2026-08-25-shadow-quality-design.md` §7, on a **visible** pane, per item and for P4 as a whole.
   Anything under ~0.4 ms is reported as unresolved, with the drift figure quoted alongside.

## 8. Done

P4 is done when the roadmap's bounded DoD holds: grass and trees sway subtly, clouds drift, butterflies
move through the scene, the motion reads calm rather than busy, and 60 fps holds on the cumulative
scene — checked with everything from P1–P3 loaded, per roadmap §7, never on the feature in isolation.

Closing P4 closes M4. The roadmap's §6 "world done" checklist should be walked from spawn as the last
act of this phase, and whatever it turns up recorded — that walkthrough is the gate to game modes.

## 9. Deliberately out

- Shallow-water feedback — §1. Splashes, slowdown, wet shading; a separate piece of work.
- Wind as a simulated force. Nothing but shaders reads the wind.
- Birds and pollen. The DoD asks for at least one kind of ambient life and butterflies are it; the sky
  is empty above the clouds and a distant circling bird is a cheap later addition if it is wanted.
- Thin-instancing the butterflies before measuring — §5b.
- Anything about the knight's 47 shadow-caster meshes. It is the biggest single item in the frame
  (1.73 ms) and it is **not** P4's job; P4's budget is not tight enough to need it.
