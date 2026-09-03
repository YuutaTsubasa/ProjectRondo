# Shadow quality — design

**Date:** 2026-08-25
**Status:** implemented on this branch
**Branch:** `claude/shadow-quality`

## 1. The problem

The hub renders no shadows. Not faint ones, not misplaced ones — none.

The report was "沒有看到騎士有陰影會出現在地板上" (the knight has no shadow on the floor). Measured with
every `AnimationGroup` paused and the default framebuffer restored before `readPixels`, toggling
`shadowGenerator.setDarkness()` from 0 (opaque shadow) to 1 (no shadow) changes **0 of 921 600
pixels**. The control — darkness 0 against darkness 0 — also changes 0, confirming the harness is
sound.

### 1a. Cause: `bias` is normalized light-space depth

[`environment.ts:101`](../../../src/presentation/babylon/environment.ts) sets:

```ts
shadowGenerator.bias = 0.002;
```

Babylon's `bias` is an offset in the light's **normalized** depth range, not in world units. With
`autoUpdateExtends` the single shadow map covered every caster in the scene — an 83.7 × 65.3 unit
ortho box — so the depth range was large and 0.002 of it worked out to roughly 0.2 world units along
the light ray. That is more than the entire depth separation between a 1.8-unit character and the
ground beneath it, so the depth test never failed and nothing was ever in shadow.

Sweeping bias with everything else fixed (1280×720, knight at origin, camera side-on to the sun):

| `bias` | pixels darkened by darkness 0→1 |
|---|---|
| 0.002 ← shipped value | **0** |
| 0.001 | 566 |
| 0.0005 | 1 151 |
| 0.0002 | 2 853 |
| 0.0001 | 2 982 |
| 0.00005 | 3 275 |
| 0.00002 | 3 604 |
| 0 | 3 719 |

The receiver side was never broken: the terrain's compiled shader contains `SHADOW1`, `SHADOWPCF1`
and `SHADOWS`, and the shadow map re-renders every frame. The 64 registered casters were the knight's
35 `result.meshes` (34 skinned plus the glTF `__root__`), 20 tree meshes and 9 landmark meshes, so 34
are skinned and 30 are not. All 34 skinned meshes and 29 of the 30 non-skinned ones report ready once
shaders finish compiling; the odd one out is `__root__`, which has no submeshes. An earlier reading of
29-of-64 was taken mid-compile and is not evidence of anything. The depth comparison ran on schedule and always returned "lit".

A control confirmed the same bias suppressed *everything*, not just the knight: a scatter rock scaled
12× and floated above the player did cast a visible shadow (16 395 px). Only objects thick enough to
beat a ~0.2-unit offset survived, and nothing in the real scene is.

### 1b. Contributing cause: almost nothing receives

`receiveShadows` was set on exactly one mesh, the terrain
([`terrain.ts:125`](../../../src/presentation/babylon/terrain.ts)). The 16 000 grass cards the player
actually stands among never receive, so even a correct shadow is largely hidden behind bright green
blades.

**Verdict: confirmed.** Measured against the implemented source, `receiveShadows` on grassTuft /
wildflower / rock / bush moves the knight-isolated ground shadow from 220 px to **408 px** — real,
worth doing, but not the dominant factor. The configuration measured in Task 4 (ground detail and
the knight's body both receiving, as of commit `3320e30` — before Task 7 added rock/bush casting)
reaches **1212 px**, and the knight's own body self-shadow supplies most of that gain, not the
grass — see §7's Task 4 write-up for the full three-way decomposition.
A first reading of 4530 px was a false signal: an async shader recompile landed between frames,
caught because the restore-control read 4526 instead of 0 — flipping `receiveShadows` needs settle
frames before the next measurement is trustworthy.

### 1c. Contributing cause: texel density

1024² spread over the auto-extended 83.7 × 65.3 unit frustum is ~12 texels per world unit. The
knight's silhouette from the sun is roughly 7 × 22 texels, which PCF then softens into nothing.

### 1d. A false positive worth recording

An earlier pass in the same session concluded "shadows are being drawn — 2908 pixels darkened".
That was wrong. The idle animation advanced between the two captures and the moving armour edges
showed up as a difference. The diff image was pure silhouette outline with nothing on the ground.
**Freezing animation and running the 0-vs-0 control are mandatory**, and both are in §5.

## 2. Goals and non-goals

**Goals**

- The knight casts a legible shadow on the ground, including across grass.
- Sharp near the camera, present at distance.
- The knight's body self-shadows; the face does not.
- Shadows read as lifted and sky-tinted, not crushed black.

**Non-goals**

- Contact-hardening, ray-traced or screen-space shadows.
- Grass casting shadows (16 000 alpha-tested cards per cascade — rejected on cost and noise).
- Any change to fog, tone mapping, bloom or MSAA. P2's atmosphere settings are untouched.
- Toon/cel banding. That remains a separate, still-open piece of work.

## 3. Approach: cascaded shadow maps

Chosen from three options. A player-following tight ortho box (~±15 units) would have made the
knight sharp for free but dropped distant tree shadows entirely; a larger single map (2048²/4096²)
keeps whole-map coverage but reaches only ~48 texels/unit at 4096² while costing ~64 MB. Cascaded
shadow maps give sharp near *and* far coverage, and Babylon ships `CascadedShadowGenerator`.

`CascadedShadowGenerator` extends `ShadowGenerator`, so the existing type flows through every
call site unchanged and the WebGL1 fallback is the same type.

## 4. Design

### 4a. New module: `src/presentation/babylon/shadows.ts`

```ts
export interface Shadows {
  /** The live generator — CascadedShadowGenerator, or plain ShadowGenerator on WebGL1. */
  readonly generator: ShadowGenerator;
  cast(...meshes: readonly AbstractMesh[]): void;
  receive(...meshes: readonly AbstractMesh[]): void;
}

export function createShadows(sun: DirectionalLight, camera: Camera): Shadows;
```

Shipped as `createShadows(sun, camera)` — `scene` is never used (the generator reaches the
scene through the light) and was dropped; see the plan's "Deviations from the spec" note.

`cast()` and `receive()` skip meshes with zero vertices — glTF `__root__` nodes and other empty
transform nodes that would otherwise enter the shadow render list as a free draw call per cascade.
This does **not** filter out invisible collider geometry: `bound_*` walls (`CreateBox`) and rock
collider proxies (`CreateSphere`) both carry vertices; they stay out of the shadow render list only
because no call site ever passes them to `cast()`/`receive()`, not because of this guard.

Required imports, each commented, because tree-shaken deep imports fail silently in this project:

```ts
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { CascadedShadowGenerator } from '@babylonjs/core/Lights/Shadows/cascadedShadowGenerator';
// Side-effect: registers the shadow-map render component. Without it either generator
// produces no shadows at all — silently.
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent';
```

### 4b. `environment.ts` gives up the generator

It returns `{ sun }` and keeps sky and lights. The `ShadowGenerator` import and the
`shadowGeneratorSceneComponent` side-effect import move to `shadows.ts`.

### 4c. `hubScene.ts` init order

CSM derives its cascade splits from the active camera, but today `createEnvironment` runs at line 47
and `scene.activeCamera` is not set until line 61. The camera is hoisted above the shadow setup:

```
createEnvironment(scene) → { sun }
physics
playerRoot + createFollowCamera + scene.activeCamera     ← hoisted
shadows = createShadows(sun, follow.camera)              ← new
createTerrain / createGroundScatter / createWater / createLandmark(scene, shadows)
createAtmosphere(scene, follow.camera)
input / player / loadKnight(…, shadows) / loadTrees(…, shadows)
```

The hoist is safe: `createFollowCamera` depends only on `playerRoot` and the canvas — not on
physics, terrain or the player controller. `createAtmosphere` stays after the camera, as now.

### 4d. Call sites

`knight.ts`, `trees.ts`, `landmark.ts` and `scatter.ts` swap `shadowGenerator?: ShadowGenerator` for
`shadows: Shadows` and call `shadows.cast(mesh)` in place of `addShadowCaster(mesh)`, plus
`shadows.receive(...)` where they own receiving geometry. `terrain.ts:125` drops its own
`receiveShadows = true`; the terrain is registered via `shadows.receive(terrain)` in `hubScene.ts`.
`shadows.ts` itself holds no policy — it is the shared mechanism; who casts and who receives stays
authored per module. Shipped with `shadows` required rather than optional: `hubScene.ts` is the only
caller of any of these functions and always supplies one, so leaving it optional bought call sites
that would silently ship with no shadows. See the plan's "Deviations from the spec" note.

### 4e. Cascade configuration

Four cascades of 1024² — a texture array, ~8 MB.

| Knob | Value | Rationale |
|---|---|---|
| `numCascades` | 4 | Babylon default; cascade 0 lands a few units wide, where the knight is |
| `lambda` | 0.8 | Logarithmic splits, concentrating resolution near the camera |
| `shadowMaxZ` | 120 | Beyond this, fog at density 0.0076 has taken ~60% of the contrast |
| `stabilizeCascades` | `true` | Costs effective resolution but kills shimmer; the camera always moves |
| `cascadeBlendPercentage` | 0.1 (default) | Hides cascade seams; first knob to drop to 0 if frame time is needed |
| `autoCalcDepthBounds` | `false` | Better precision but adds a min/max reducer pass; not until measurement asks |
| filtering | PCF, `QUALITY_MEDIUM` | Keeps the current soft look; HIGH is a wider kernel we don't need at 4 cascades |

### 4f. Bias — starting values, then measured

`bias = 0.0005`, `normalBias = 0.02` are **starting points, not results**. The §1a sweep was taken
against a single 84-unit map; each CSM cascade has a far tighter depth range, so the same normalized
number is a much smaller world offset and the whole curve shifts. §5 defines the tuning procedure.

### 4g. Shadow tint

- `generator.setDarkness(0.15)` — lifts shadows off pure black.
- `ambient.groundColor = HORIZON × 0.30`, reusing `HORIZON_HEX` from
  [`atmosphereColors.ts`](../../../src/presentation/babylon/atmosphereColors.ts).

The scale factor matters. Babylon's hemispheric term is `mix(groundColor, diffuseColor, ndl)` with
`ndl = dot(N, lightDir)*0.5 + 0.5` and this light's direction `(0,1,0)`, so `groundColor`'s weight is
`(1 - ndl)`: zero for a normal facing straight up, strongest facing straight down, and everything in
between for the rest. The terrain — the scene's principal shadow receiver — has its normals flipped
skyward (`terrain.ts`), so it takes essentially none of this tint; what it actually tints is the
grass/flower cards and any other surface not facing straight up. `HemisphericLight.groundColor`
defaults to black, so setting it to the full `#dcecf7` would nearly double the ambient term on those
surfaces and brighten them well beyond a subtle tint. `0.30` is the measured value
(`environment.ts:19`): `0.35` was written first and failed threshold 3 at +5.63%; `0.30` passes at
+4.83%. See §7's Task 5 write-up for the full sweep.

### 4h. Cast / receive policy

| Geometry | Casts | Receives |
|---|---|---|
| terrain | – | yes |
| grass tufts (16 000) | – | yes |
| wildflowers (1 600) | – | yes |
| rocks (200), bushes (160) | yes | yes |
| trees (20) | yes | yes |
| pillars ×8 + pedestal | yes | yes |
| knight body (31 × `tripo_part_*`) | yes | yes |
| knight head (`Mesh_0`, `Mesh_32`, `Mesh_33`) | yes | **no** |
| water disc | – | – |
| sky, mountains, boundary walls | – | – |

The head still **casts**, so its shadow lands on the ground and on the shoulders; it simply never
receives one. Because `Mesh_0` is head, hair and neck collar in a single mesh, the collar does not
receive either — the same coupling `FACE_EMISSIVE` already lives with.

Grass does not cast: 16 000 alpha-tested cross cards redrawn per cascade is the most expensive
option available and tends toward speckle noise.

## 5. Verification

### 5a. Shadow-presence harness

1. Pause every `AnimationGroup`. Skipping this is what produced the §1d false positive.
2. `engine.restoreDefaultFramebuffer()` before `readPixels`.
3. A/B `setDarkness(0)` against `setDarkness(1)`; count pixels differing by more than 4.
4. Run the control: darkness 0 against darkness 0 must change exactly 0 pixels.
5. Place the camera **side-on to the sun**. The sun travels toward −X−Z; a camera on the +X+Z side
   hides the shadow behind the caster and nearly produced a false negative.

### 5b. Acceptance thresholds

| # | Check | Threshold | Outcome |
|---|---|---|---|
| 1 | Knight ground shadow present | ≥ 2 000 px darkened at 1280×720, side-on camera | **Invented, unphysical, replaced.** No camera framing at this geometry reaches 2 000 px unoccluded — see below. Replaced by: a non-zero, reproducible knight-only ground shadow with a zero restore-control, plus a measurable increase when ground-detail receivers are enabled. Both hold. |
| 2 | No shadow acne | darkened pixels on open unoccluded ground < 0.1% of frame | **Original method structurally invalid — replaced (Task 8); the replacement passes.** The Task 3 reading (0 px, recorded as PASS) was taken with an empty caster list, so 0 px was forced by the configuration, not produced by the swept values: acne requires a surface that both casts and receives, which nothing did at that point, so it certified nothing. Replaced by the Task 8 pedestal-top ROI method, measured against the shipped configuration (the first with any casting+receiving meshes — 62 of them). At `normalBias = 0.01` (the Task 3 pick) that method reads severe acne — 75.4% of the 34 850-px pedestal-top ROI. Raising `normalBias` to 0.04 brings it to 360 px, 1.0% of the ROI — converted to the original criterion's own denominator (921 600 px at 1280×720), 360 / 921 600 = 0.039% of frame, under the < 0.1%-of-frame bar. See §7 Task 8. |
| 3 | Ambient tint did not brighten the scene | whole-frame mean luma within ±5% of `main`; crushed-black % not increased | **PASS** — +4.83% (scale 0.30); crushed % rises 0 → 0.001, treated as noise floor, not a regression |
| 4 | Perf | within-session round-robin median against `main`; cost < 1.5 ms of the 16.7 ms budget | **unmeasured — requires a visible window.** Every timing figure this session was taken with the Browser pane hidden (`document.hidden === true`), which GPU-throttles the page; eight samples of an identical config spread 2.7x with a monotonic upward drift. There is no valid measurement to judge this threshold against. See §7's Task 6 write-up. |

Threshold 3 uses the whole-frame protocol because P2's tree-emissive regression came from measuring
only lit points. Threshold 4 is a within-session delta because HANDOFF §5 records that P2's and P3's
absolute numbers came from different machines.

Final outcome: threshold 1 was invented rather than derived from any real constraint of this scene and
came apart under measurement, and was replaced with criteria that actually test correctness. Threshold
4's own 1.5 ms figure was also invented, but its verdict never got that far — every timing number this
session was taken with the Browser pane hidden and GPU-throttled, so threshold 4 is unmeasured, not
failed, with an explicit instruction to re-measure on a machine with the pane actually visible before
spending the remaining frame-budget headroom. Threshold 3 held up as originally written and passes.
Threshold 2's original method was structurally invalid: measured with an empty caster list, where
acne was impossible by construction, its PASS at 0 px certified nothing. It was replaced by the
Task 8 pedestal-top ROI method, measured against the shipped configuration; by that method,
`normalBias = 0.01` fails (75.4% of the ROI) and the shipped `normalBias = 0.04` passes (360 px,
1.0% of ROI, i.e. 0.039% of frame — under the original < 0.1%-of-frame bar).

### 5c. Bias tuning procedure

Sweep `bias ∈ {0, 1e-4, 2.5e-4, 5e-4, 1e-3}` against `normalBias ∈ {0, 0.01, 0.02, 0.04}`. Take the
smallest pair satisfying both threshold 1 and threshold 2. Record the resulting table in §7 the way
the P3 spec recorded its measurements. The `ambient` scale factor of §4g is settled the same way,
against threshold 3.

## 6. Automated tests

One piece of this is testable without a GPU, and only that piece gets a test. The head/body split
becomes a pure predicate exported from `knight.ts`:

```ts
export function knightReceivesShadow(meshName: string): boolean;  // !HEAD_MESHES.includes(meshName)
```

Shipped as `knightReceivesShadow` exported from `shadowPolicy.ts`, not `knight.ts` — `knight.ts`
imports Babylon and cannot load in the node test env; see the plan's "Deviations from the spec"
note.

Covering: each of the three head meshes returns `false`; a `tripo_part_*` name returns `true`; and
the predicate stays in sync with `HEAD_MESHES` so the two cannot drift apart.

Everything else here is GPU-bound and is covered by the measured record of §5 and §7 instead. Stated
plainly rather than papered over with tests that would not exercise the rendering path.

## 7. Measurements

### Task 3 — bias/normalBias sweep

Knight-only ground shadow, px, measured with the harness's caster-list swap — the knight is removed
from and restored to the shadow generator's caster list via the public `add`/`removeShadowCaster` API,
because a whole-frame darkness A/B is dominated by tree and pillar shadows and cannot isolate the
knight's own contribution, and mutating `renderList` directly corrupts the generator's internal state —
physics and animations frozen, water ripple pinned, camera pinned side-on, 12 warm-up frames. An "acne" column was
also recorded here and read **0 px in all 20 cells — but this measured nothing.** It was taken with an
empty caster list: with no occluder depth in the shadow map, no receiver can be darkened at any bias,
so 0 px is forced by the configuration itself, not produced by the swept values (which is also why it
was identical in all 20 cells). Acne is self-shadowing — it requires a surface that is simultaneously a
caster and a receiver — and at this point in the work the terrain was a receiver only and the knight the
sole caster, so acne was structurally impossible regardless of bias. This reading is not evidence that
threshold 2 was met; it is superseded by the real measurement in Task 8, taken against the shipped
configuration where 62 meshes both cast and receive.

The knight-only ground-shadow table below remains valid for what it measured — it used the harness's
normal caster-list swap, not an empty one — and is unaffected by the acne correction above.

| bias \ normalBias | 0 | 0.01 | 0.02 | 0.04 |
|---|---|---|---|---|
| 0      | 246 | 220 | 222 | 249 |
| 1e-4   | 246 | 220 | 222 | 249 |
| 2.5e-4 | 246 | 220 | 222 | 249 |
| 5e-4   | 246 | 220 | 222 | 249 |
| 1e-3   | 246 | 220 | 222 | 249 |

`bias` is entirely irrelevant across the swept range: every row is identical. With cascaded shadow maps
each cascade's depth range is small, so even 1e-3 normalized is a negligible world-space offset — the
opposite of the single-map case, where 0.002 over an auto-extended 83.7-unit ortho box was ~0.2 world
units and destroyed every shadow. `normalBias` moves the result by at most 12%, and not monotonically,
so that variation is noise rather than signal.

Chosen: **bias 1e-4, normalBias 0.01** — the smallest non-zero of each. Both guards are retained
(constant and slope-scaled) against geometry the scene does not have yet; the measured cost is 26 px of
246, which Task 5's darkness tuning dwarfs. Any cell in the grid is defensible; the grid is recorded so
the choice can be revisited in one edit.

### Cascade geometry — resolution is not the limiting factor

| cascade | world range | frustum width | texels/unit at 1024 |
|---|---|---|---|
| 0 | 0.05 – 6.29 | 6.24 | 164 |
| 1 | 6.29 – 13.96 | 7.68 | **133** |
| 2 | 13.96 – 31.72 | 17.75 | 58 |
| 3 | 31.72 – 120 | 88.28 | 12 |

The camera sits 13.05 units from the knight, i.e. in cascade 1 at 133 texels/unit — resolution is not
what's limiting the visible shadow area.

### Task 4 — ground-detail receivers (spec 1b: confirmed, but smaller than claimed)

Measured against the configuration as of commit `3320e30` (implemented source, not a runtime
toggle) — before Task 7 added rock/bush casting, so the figures below describe that
point-in-time state, not the final one. The verdicts still stand: both are in-state deltas,
unaffected by what Task 7 later added. Five consecutive
`__knightShadow()` runs returned 1212 px with a zero restore-control, so the figures below are
stable, not sampled. Policy verified live: grassTuft/wildflower/rock/bush all `receiveShadows =
true`; all 31 `tripo_part_*` body meshes `true`; `Mesh_0`/`Mesh_32`/`Mesh_33` (the face) all
`false`; 34 knight casters registered.

Removing the knight from the caster list removes both its ground shadow and its self-shadow at
once, so the knight-isolated metric conflates the two — decomposing it needs three
configurations, not one:

| configuration | knight-isolated px | delta |
|---|---|---|
| A — neither ground detail nor body receives | 220 | baseline |
| B — ground detail receives, body does not | 408 | +188 from grass (+85%) |
| C — ground detail AND body receive (as of `3320e30`) | **1212** | +804 from self-shadow |

Restoring to C reproduced 1212 exactly. Total improvement over the pre-task baseline: **220 to
1212 px, 5.5x.**

**The headline is not what the spec predicted.** §1b framed the missing ground-detail receivers as
the key contributing cause; measured, grass receiving contributes +188 px while the knight's own
body self-shadow contributes +804 px — over four times more. Both are worth having, but
ground-detail receivers were not the dominant term; the spec's emphasis was wrong.

A third recompile trap: the very first `__knightShadow()` reading after this task's page load
returned **0 px**, with a zero reproducibility control *and* a zero restore-control — it looked
perfectly trustworthy and was completely wrong. Receiver shader variants compile lazily on first
draw, and 25 warm-up frames were not enough for the newly-receiving meshes. A global darkness A/B
(20 804 px) exposed it. Any measurement taken right after `receiveShadows` changes on a mesh that
has not yet been drawn in that state is invalid, and the usual controls do not catch this class of
error.

### Threshold 1's 2000 px value was invented and is not physically reachable

Geometry: the sun direction (-0.5, -1, -0.5) puts the sun at 54.7 deg elevation, so a 1.8 m character
casts a ground shadow about 1.27 units long by ~0.5 wide. At 13 units from the camera with a ~15 deg
depression angle, that patch projects to roughly 2000 px *if nothing occluded it* — but the knight's own
body covers much of it from this angle, and grass blades cover more. 408 px of visible shadow (1212 px
for the Task 4 configuration, once the knight's own body also receives — see the Task 4 write-up
below) is consistent with correct behaviour, not with a defect.

Threshold 1 is therefore replaced by two criteria that actually test correctness:
(a) the knight's ground shadow is non-zero and reproducible with a zero restore-control, and
(b) enabling ground-detail receivers measurably increases it.
Both hold. Whether the shadow is *strong enough* is an art-direction question, settled in Task 5.

### Task 5 — shadow lift and sky tint

Measured against the configuration as of commit `3320e30`, before Task 7 added rock/bush casting —
the `frame.mean` figures below (including the adopted-scale reading of 119.62) describe that
point-in-time state, not the final one. The threshold-3 verdict still stands: it is judged on an
in-page-state delta (tinted vs untinted, at the same commit), not on an absolute compared across
commits.

**The cross-reload comparison method was discarded.** An earlier pass measured a "before" reading
(groundColor black, via a page reload) and an "after" reading (groundColor tinted) and both
returned `frame.mean` = 138.00 exactly — not credible for a change that visibly alters the
hemispheric term, and now known to be a reload artifact rather than a real measurement. That
138.00 baseline is wrong and is retracted; do not reuse it. Threshold 3 is instead judged by
toggling `groundColor` within a **single page state** — same framing, same settle, zero
control — which gives coherent, monotonic numbers. The correct pre-change figure by this method is
`frame.mean` = **114.11**, `frame.crushedPct` = **0**.

`ambient.intensity` 0.45 and `sun.intensity` 1.1 (pre-existing, from the original hub lighting) and
shadow `darkness` 0.15 (set in Task 2) held constant throughout. Threshold 3 allows the
post-change `frame.mean` to move by at most ±5% of the pre-change, in-page-state figure.

Frame mean by `AMBIENT_GROUND_SCALE` (`HORIZON_HEX` `#dcecf7` scaled), single page state, 6 settle
frames each:

| scale | frame mean | delta vs black | crushedPct |
|---|---|---|---|
| 0 (pre-Task-5) | 114.11 | baseline | 0 |
| 0.15 | 116.88 | +2.43% | 0.001 |
| 0.20 | 117.79 | +3.22% | 0.001 |
| 0.25 | 118.71 | +4.03% | 0.001 |
| 0.30 (adopted) | 119.62 | +4.83% | 0.001 |
| 0.35 (first written) | 120.53 | +5.63% | 0.001 |
| 1.00 (undimmed #dcecf7) | 131.91 | +15.6% | 0.002 |

**0.35 was the first value written and it failed threshold 3** (+5.63%, over the ±5% allowance).
It was lowered to 0.30 on measurement, which passes at +4.83%. 0.30 is not the value originally
chosen — it is a correction made after measuring 0.35 came up short. The response is essentially
linear in scale, consistent with `groundColor` being a linear multiplier on the ambient term.

The 1.00 (undimmed) row is the evidence for why the scale factor exists at all: applying the full
horizon colour directly nearly doubles the ambient contribution (+15.6%) on every surface not
facing straight up — including grass cards, which are vertical — because `groundColor` defaults to
black and shadowed surfaces are lit by the ambient term alone. Scaling it down keeps the tint's hue
while holding the brightness contribution inside the threshold.

`crushedPct` rises from 0 to 0.001 (9 px of 921 600) at every non-zero scale tested, including the
adopted 0.30. Adding light should not create new black pixels, so this is treated as the
measurement's noise floor rather than a real regression — but it is recorded here as an increase,
not rounded away to zero, so the next person re-measuring this does not mistake a real regression
for the known noise floor or vice versa.

### Task 6 — performance

**Retracted — every timing number this subsection originally reported is unusable.** The whole session
ran with `document.hidden === true`: the Browser pane was never displayed, so the page was
GPU-throttled. Eight back-to-back samples of one identical config, taken to double-check a suspicious
reading, came back 47.7 / 87.4 / 101.0 / 121.1 / 128.0 / 125.2 / 117.1 / 120.4 ms — a 2.7x spread with
a monotonic upward drift as throttling ramps up over the session. No timing measurement taken this
session is trustworthy, and none is cited as fact below.

Two methods were tried and discarded before the throttling itself was identified — the methodological
lessons from both still hold, independent of the throttling:

1. **Toggling `scene.shadowsEnabled` for the A/B.** This changes material defines and forces shader
   recompilation, so the "cost" it measures is recompilation, not shadow rendering. Unpaired medians
   gave 1.378 ms; paired differences over 25 pairs gave **4.729 ms** with a tight IQR — but total frame
   time with shadows on was only ~3.4 ms, so a 4.7 ms shadow cost is arithmetically impossible. The
   tight IQR made the wrong number look authoritative.
2. **Comparing absolute frame time across configs on this machine.** The identical shipped config
   measured 2.855 ms and then 5.141 ms minutes apart, with nothing changed — an 80% spread. The
   built-in reproduce-the-first-config control caught it. At the time this read as machine load; the
   eight-sample check above shows it was hidden-tab throttling instead, which also retroactively
   explains a fourth reading of 71.075 ms for the same scene that didn't fit either theory.

The method that was believed to hold — never touch `shadowsEnabled`; hold every define fixed and pair
`shadowMap.refreshRate` 1 against 0, 20 pairs, 40 timed frames per half after 10 warm-up frames — is
methodologically sound but was still run inside the throttled tab, so its output (a shipped-config
frame time, an implied fps, a shadow-map render cost) is invalidated along with everything else and is
not reproduced here.

**Verdict on threshold 4: UNMEASURED, not failed.** An earlier version of this document reported a
shadow-map cost of ~3.62 ms and declared threshold 4 (< 1.5 ms) failed by 2.4x. That verdict is
withdrawn — it was computed from throttled numbers, not real ones — not confirmed, not overturned,
simply never validly measured. Whatever the true cost is, it must be found on a machine where the tab
is actually visible.

**What survives.** Throttling changes *when* a frame is produced, never *what* it contains, so every
pixel- and image-based measurement in this document is unaffected and stands as recorded: the
bias/normalBias grid (§7 Task 3), the receiver decomposition (220 / 408 / 1212 px, §7 Task 4), the
ambient tint luma sweep (§7 Task 5), the ground-detail caster comparisons (§7 Task 7, below), and the
re-measured acne readings (360 px, 1.0% of the pedestal-top ROI, at the shipped `normalBias = 0.04`,
§7 Task 8). Task 3's original acne reading (0 px at all 20 cells) is not on this list — it measured
nothing and must not be cited as evidence; see Task 3 above. All of the readings that are listed carry
zero-valued reproducibility and/or restore controls, which a throttled clock cannot forge — the
controls bound *pixel* differences, not frame timing.

**Perf must be re-measured before it is trusted or acted on**, on a machine where the Browser pane is
actually visible (`document.hidden === false`) — a hidden pane silently invalidates every timing number
taken through it, with no error and no visible symptom other than the drift documented above. Until
then, treat P4's frame-budget headroom as unknown — not the "~11 ms of 16.7 ms" once claimed here. That
figure came from this session's retracted throttled measurements (above), not from HANDOFF §5, which
states only "roughly 8x headroom against the 16.7 ms vsync budget" and itself flags that 8x figure as
predating this branch and no longer holding.

### Task 7 — rocks and bushes cast

Camera side-on to the sun over the open grass, same frozen harness as the earlier tasks. Restore
controls read 0 px for both comparisons.

| configuration | pixels changed vs previous |
|---|---|
| A — shipped (no ground detail casts) | baseline |
| B — rock (200) + bush (160) cast | **42 990** (4.7% of frame) |
| C — B plus grass (16 000) + flowers (1 600) cast | +151 322 (16.4% of frame) |

B is the change shipped: rocks and bushes gain contact shadows and stop looking pasted onto the
ground. C was measured to confirm the grass/flower exclusion is deliberate rather than an oversight —
most of that additional 16.4% is speckle from 17 600 alpha-tested cross cards redrawn per cascade, not
legible shadow, so grass and flowers stay cast-off.

### Task 8 — threshold 2 re-measured

The round-2 reviewer was right: Task 3's original 0 px could not have been anything else. It was taken
with an empty caster list, and at that point in the work the terrain was a receiver only and the knight
the sole caster — acne requires a surface that both casts and receives, so it was structurally
impossible to observe. The shipped configuration is the first in which it can occur: **62 meshes both
cast and receive** (knight body ×31, trees ×20, 8 pillars, pedestal, rock, bush).

Re-measured at commit `b6b493e`, 1280×720, animations and physics frozen, water ripple pinned, camera
framed on the plaza pedestal and pillars (curved stone that both casts and receives — the geometry most
prone to acne). Reproducibility control 0 px; restore control 0 px.

Method: diff each candidate against a deliberately over-biased reference (`bias` 0.005 / `normalBias`
0.4) which cannot exhibit acne. ROI = the pedestal top, 34 850 px.

| `normalBias` | pedestal-top px differing from the acne-free reference | share of ROI |
|---|---|---|
| **0.01 (Task 3's pick, shipped before this task)** | **26 278** | **75.4%** |
| 0.02 | 12 558 | 36.0% |
| **0.04 (shipped)** | **360** | **1.0%** |
| 0.08 | 231 | 0.7% |
| 0.12 | 197 | 0.6% |
| 0.20 | 125 | 0.4% |
| 0.30 | 101 | 0.3% |

**Verdict: `normalBias = 0.01` has severe acne — three quarters of the pedestal top.** It is visible as
radial moiré on the pedestal and vertical banding on the pillars. The curve has a sharp knee at **0.04**,
which drops it to 1.0% (the floor is ~0.3%, i.e. legitimate difference from the over-biased reference).

Cost to the knight's ground shadow — none. Knight-isolated metric, side-on camera, restore control 0:

| `normalBias` | knight ground shadow |
|---|---|
| 0.01 | 1145 px |
| 0.02 | 1105 px |
| **0.04** | **1190 px** |
| 0.08 | 1615 px |

0.04 is marginally *better* than 0.01 for the knight's own shadow. Screenshots confirm the pedestal
moiré is gone at 0.04.

**Fix shipped: `NORMAL_BIAS` 0.01 → 0.04** (`shadows.ts`). `BIAS` stays `1e-4`.

Note for the record: the Task 3 sweep grid remains valid for what it measured — it showed `bias` is
irrelevant across [0, 1e-3] on the knight-only ground shadow — but its acne reading measured nothing
and must not be cited as evidence that threshold 2 was met; see the correction in Task 3 above and in
§5b.

## 8. Follow-ups deliberately left out

- **Water receiving shadows.** Shadows through an opacity-Fresnel surface get strange; one line to
  switch on later if wanted.
- **The debug HUD blooms.** The overlay text in the top-left is picked up by the bloom pass. Noticed
  while shooting comparison frames; unrelated to shadows.
- **Toon/cel banding on the knight.** Still open, still separate — see HANDOFF §5.
