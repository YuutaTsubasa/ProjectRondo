# Shadow quality — design

**Date:** 2026-08-25
**Status:** approved, not yet implemented
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
and `SHADOWS`, and the shadow map re-renders every frame. Of the 64 registered casters, all 34
skinned knight meshes and 28 of the 29 non-skinned ones report ready once shaders finish compiling
(the odd one out has no submeshes). An earlier reading of 29-of-64 was taken mid-compile and is not
evidence of anything. The depth comparison ran on schedule and always returned "lit".

A control confirmed the same bias suppressed *everything*, not just the knight: a scatter rock scaled
12× and floated above the player did cast a visible shadow (16 395 px). Only objects thick enough to
beat a ~0.2-unit offset survived, and nothing in the real scene is.

### 1b. Contributing cause: almost nothing receives

`receiveShadows` was set on exactly one mesh, the terrain
([`terrain.ts:125`](../../../src/presentation/babylon/terrain.ts)). The 16 000 grass cards the player
actually stands among never receive, so even a correct shadow is largely hidden behind bright green
blades.

**Verdict: confirmed.** Toggling `receiveShadows` on grassTuft / wildflower / rock / bush at
runtime moved the knight's ground shadow from 222 px to **438 px**, and toggling back off
reproduced 222 px exactly. That is roughly 2x — real, worth doing, but not the dominant factor
(see the full measurement and the texel-density comparison in §7's Task 4 write-up). A first
reading of 4530 px was a false signal: an async shader recompile landed between frames, caught
because the restore-control read 4526 instead of 0 — flipping `receiveShadows` needs settle
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

export function createShadows(scene: Scene, sun: DirectionalLight, camera: Camera): Shadows;
```

`cast()` and `receive()` skip meshes with zero vertices — the scene carries `bound_*` walls and
collider proxies that would otherwise enter the shadow render list.

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
and `scene.activeCamera` is not set until line 63. The camera is hoisted above the shadow setup:

```
createEnvironment(scene) → { sun }
physics
playerRoot + createFollowCamera + scene.activeCamera     ← hoisted
shadows = createShadows(scene, sun, follow.camera)       ← new
createTerrain / createGroundScatter / createWater / createLandmark(scene, shadows)
createAtmosphere(scene, follow.camera)
input / player / loadKnight(…, shadows) / loadTrees(…, shadows)
```

The hoist is safe: `createFollowCamera` depends only on `playerRoot` and the canvas — not on
physics, terrain or the player controller. `createAtmosphere` stays after the camera, as now.

### 4d. Call sites

`knight.ts`, `trees.ts` and `landmark.ts` swap `shadowGenerator?: ShadowGenerator` for
`shadows?: Shadows` and call `shadows.cast(mesh)` in place of `addShadowCaster(mesh)`, plus
`shadows.receive(...)` where they own receiving geometry. `terrain.ts:125` drops its own
`receiveShadows = true`; the terrain is registered via `shadows.receive(terrain)` in `hubScene.ts`
so the whole policy reads in one place.

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
- `ambient.groundColor = HORIZON × 0.35`, reusing `HORIZON_HEX` from
  [`atmosphereColors.ts`](../../../src/presentation/babylon/atmosphereColors.ts).

The scale factor matters. `HemisphericLight.groundColor` defaults to black, so setting it to the full
`#dcecf7` would nearly double the ambient term on every downward-facing surface and brighten the
whole scene rather than just tinting the shadows. `0.35` is a starting value that acceptance
threshold 3 decides.

### 4h. Cast / receive policy

| Geometry | Casts | Receives |
|---|---|---|
| terrain | – | yes |
| grass tufts (16 000) | – | yes |
| wildflowers (1 600) | – | yes |
| rocks (200), bushes (160) | – | yes |
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

| # | Check | Threshold |
|---|---|---|
| 1 | Knight ground shadow present | ≥ 2 000 px darkened at 1280×720, side-on camera |
| 2 | No shadow acne | darkened pixels on open unoccluded ground < 0.1% of frame |
| 3 | Ambient tint did not brighten the scene | whole-frame mean luma within ±5% of `main`; crushed-black % not increased |
| 4 | Perf | within-session round-robin median against `main`; cost < 1.5 ms of the 16.7 ms budget |

Threshold 3 uses the whole-frame protocol because P2's tree-emissive regression came from measuring
only lit points. Threshold 4 is a within-session delta because HANDOFF §5 records that P2's and P3's
absolute numbers came from different machines.

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

Covering: each of the three head meshes returns `false`; a `tripo_part_*` name returns `true`; and
the predicate stays in sync with `HEAD_MESHES` so the two cannot drift apart.

Everything else here is GPU-bound and is covered by the measured record of §5 and §7 instead. Stated
plainly rather than papered over with tests that would not exercise the rendering path.

## 7. Measurements

### Task 3 — bias/normalBias sweep

Knight-only ground shadow, px, measured with the harness's caster-list swap (Ruling 7), physics and
animations frozen, water ripple pinned, camera pinned side-on, 12 warm-up frames. Acne (zero casters in
the map) was **0 px in all 20 cells**:

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

Runtime toggle of `receiveShadows` on grassTuft / wildflower / rock / bush, with 25 settle frames on
each side and a zero control verified before each reading:

| grass/flowers/rocks/bushes | knight-only ground shadow |
|---|---|
| not receiving | 222 px |
| receiving | **438 px** |
| toggled back off | 222 px (reproduces exactly) |

Spec 1b is real and worth doing — it roughly doubles the knight's ground shadow — but it is not the
dominant term. A first reading of 4530 px was contaminated by an async shader recompile landing between
frames, caught by the restore-control reading 4526 instead of 0: **flipping `receiveShadows` requires
settle frames before measuring**, or the reading is meaningless.

### Threshold 1's 2000 px value was invented and is not physically reachable

Geometry: the sun direction (-0.5, -1, -0.5) puts the sun at 54.7 deg elevation, so a 1.8 m character
casts a ground shadow about 1.27 units long by ~0.5 wide. At 13 units from the camera with a ~15 deg
depression angle, that patch projects to roughly 2000 px *if nothing occluded it* — but the knight's own
body covers much of it from this angle, and grass blades cover more. 438 px of visible shadow is
consistent with correct behaviour, not with a defect.

Threshold 1 is therefore replaced (Ruling 9) by two criteria that actually test correctness:
(a) the knight's ground shadow is non-zero and reproducible with a zero restore-control, and
(b) enabling ground-detail receivers measurably increases it.
Both hold. Whether the shadow is *strong enough* is an art-direction question, settled in Task 5.

## 8. Follow-ups deliberately left out

- **Water receiving shadows.** Shadows through an opacity-Fresnel surface get strange; one line to
  switch on later if wanted.
- **Rocks and bushes casting.** 360 solid objects, cheap, and would read well. Excluded because the
  agreed caster set is knight + trees + pillars.
- **The debug HUD blooms.** The overlay text in the top-left is picked up by the bloom pass. Noticed
  while shooting comparison frames; unrelated to shadows.
- **Toon/cel banding on the knight.** Still open, still separate — see HANDOFF §5.
