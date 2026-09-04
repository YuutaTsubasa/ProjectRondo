# P4 — Life & Motion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the hub wind-swept grass and trees and drifting clouds — the last phase of M4.

> **Butterflies were cut on 2026-09-04, after Tasks 4 and 5 had been built and merged.** The owner
> found them startling rather than calming, which is the opposite of the DoD's own bar; the spec's §5
> records what was built and why it went, and the roadmap's P4 DoD was amended the same day. **Tasks 4
> and 5 below are history, not work to do**, and neither is anything else on this page that mentions a
> butterfly. Everything up to and including Task 3, plus Tasks 6 and 7, is the shipped phase.

**Architecture:** One `MaterialPluginBase` injects a vertex displacement into the three existing
`StandardMaterial`s (grass, flowers, trees) at `CUSTOM_VERTEX_UPDATE_WORLDPOS`, driven by a single
shared accumulated time. Clouds are a second inward-facing dome with a procedurally drawn, u-tiling
alpha texture whose `uOffset` advances from that same time.

**Tech Stack:** TypeScript, `@babylonjs/core` 9.21.0 (deep subpath imports), Svelte 5, Vitest, pnpm.

**Spec:** `docs/superpowers/specs/2026-09-04-life-and-motion-design.md`

## Global Constraints

- **Package manager is pnpm.** `pnpm test`, `pnpm exec tsc --noEmit`, `pnpm dev`. Never npm/yarn.
- **No new dependencies.** Only `@babylonjs/core`, `@babylonjs/havok`, `@babylonjs/loaders` are
  installed, and P4 adds none.
- **No new binary assets.** Every texture in this phase is drawn into a `DynamicTexture` at runtime,
  the way `grassAlphaTexture` and `skyGradientTexture` already are. Nothing new enters Git LFS.
- **Deep babylon subpath imports need their side-effect imports.** A mesh with no explicit material
  renders nothing, silently, if `@babylonjs/core/Materials/standardMaterial` was never imported for
  its side effect. Follow the pattern already in `scatter.ts` / `environment.ts`.
- **`src/domain/` stays pure** — no babylon, Svelte, DOM or IO imports, ever. It is Vitest-covered.
  Presentation is verified in-browser, not unit-tested (spec §7).
- **Performance claims obey the measured error bar** (spec §2, from
  `2026-08-25-shadow-quality-design.md` §7): the Browser pane must be **visible** or every timing
  number is void; only **paired** deltas are quotable; **any delta below ~0.4 ms is unresolvable** and
  must be reported as unresolved, never as a number.
- **The dev server may not be on 5173.** Another session holds it; `autoPort` is on, so read the port
  from `preview_start`'s result rather than assuming.
- The AVG intro plays on hub entry and swallows synthetic coordinate clicks in this pane. Dismiss it
  from the console instead: `document.querySelector('[aria-label="advance dialogue"]').click()`, then
  `document.querySelector('.choice').click()` for the branch.

---

### Task 1: Wind — the plugin, and grass + flowers swaying

**Files:**
- Create: `src/presentation/babylon/wind.ts`
- Modify: `src/presentation/babylon/scatter.ts` (imports; `createGroundScatter`, currently lines 238-259)
- Modify: `src/presentation/babylon/hubScene.ts` (import; `createHubScene`, beside `createGroundScatter`)
- Test: none — this is presentation. Verified in-browser at Step 5, per spec §7 and the repo's split.
  **Do not invent a unit test for it**; there is no pure function here, and a TS re-implementation of
  the GLSL would be a second source of truth that nothing checks.

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `createWind(scene: Scene): void` — registers the one observer that advances wind time.
  - `applyWind(material: Material, bendHeight: number): void` — attaches the plugin to one material.
    `bendHeight` is the material's geometry height **in local space**, in the same units as the
    `position` vertex attribute.
  - `WIND_DIR_X: number`, `WIND_DIR_Z: number` — the shared wind direction, unit length. Tasks 3 and 4
    both read these so the clouds and the butterflies move with the grass rather than against it.

- [ ] **Step 1: Create the wind module**

Create `src/presentation/babylon/wind.ts`:

```ts
import type { Scene } from '@babylonjs/core/scene';
import type { Material } from '@babylonjs/core/Materials/material';
import type { UniformBuffer } from '@babylonjs/core/Materials/uniformBuffer';
import { MaterialPluginBase } from '@babylonjs/core/Materials/materialPluginBase';

/**
 * Wind direction in the XZ plane, unit length — (0.8, 0.6) is exactly 1. Exported because the clouds
 * (`clouds.ts`) and the butterflies (`butterfly.ts`) read it too: three effects drifting in three
 * directions reads as three unrelated bugs rather than as weather.
 */
export const WIND_DIR_X = 0.8;
export const WIND_DIR_Z = 0.6;

/** Radians of phase per world unit along the wind direction. The visible result is the wavelength of
 *  a gust travelling over the field: 2*PI / 0.35 is ~18 units, so roughly five gusts span the 100-unit
 *  hub. Larger values shorten the wave until neighbouring tufts fight each other and it reads as noise
 *  rather than wind. Tuned in the browser (Step 5); re-tune there, not by arithmetic. */
const SPATIAL_FREQ = 0.35;

/** Radians of phase per second — how fast a gust travels. */
const SPEED = 1.1;

/** Peak horizontal displacement of a fully-bent tip, in WORLD units. Deliberately world-space and not
 *  scaled per instance: wind is a property of the air, so a small tuft and a large one are pushed the
 *  same distance (spec §3c). At 0.06 a 0.5-unit grass card leans about 12% of its height. */
const AMPLITUDE = 0.06;

/** The single source of wind time, in seconds. Every plugin instance binds this same value, so the
 *  whole field shares one phase; nothing else may write it. */
const field = { time: 0 };

/**
 * Starts the wind. Registers exactly ONE per-frame observer for the whole scene — the plugins are
 * passive readers, so adding a second caller here would double the wind speed rather than fail.
 *
 * Time accumulates from `getDeltaTime()` rather than `performance.now()`: a wall clock keeps running
 * while the scene does not, so a paused or backgrounded tab would jump the field forward on resume.
 */
export function createWind(scene: Scene): void {
  scene.onBeforeRenderObservable.add(() => {
    field.time += scene.getEngine().getDeltaTime() / 1000;
  });
}

/**
 * Bends a material's geometry with the shared wind.
 *
 * Injected at `CUSTOM_VERTEX_UPDATE_WORLDPOS`, which is the only usable hook — verified against the
 * installed 9.21.0, see spec §3b. `CUSTOM_VERTEX_UPDATE_POSITION` runs *before*
 * `#include<instancesVertex>`, where `finalWorld` does not exist yet, so a thin instance cannot know
 * where it is and all 16 000 grass tufts would sway in the same phase. At UPDATE_WORLDPOS `worldPos`
 * is computed and `positionUpdated` is still in scope, which is exactly the pair this needs, and the
 * hook sits before both `gl_Position` and `vPositionW = vec3(worldPos)` so lighting and fog see the
 * displaced position too.
 *
 * `bendHeight` is LOCAL-space height. The thin-instance matrix and any parent scaling are applied
 * later in `finalWorld`, so one value per material is correct across instances of different sizes.
 *
 * NOT replicated into the shadow map, and it cannot be: `shadowMap.vertex` exposes only
 * `CUSTOM_VERTEX_DEFINITIONS` — there is no injection point between `positionUpdated` and `worldPos`
 * on that path. Grass and flowers do not cast, so they are unaffected; trees do (spec §3e, Task 2).
 */
export function applyWind(material: Material, bendHeight: number): void {
  new WindPlugin(material, bendHeight);
}

class WindPlugin extends MaterialPluginBase {
  private readonly bendHeight: number;

  constructor(material: Material, bendHeight: number) {
    // Priority 200: after Babylon's own built-in plugins, which sit well below 200.
    super(material, 'Wind', 200, { WIND: true });
    this.bendHeight = bendHeight;
    // The plugin carries no toggleable property of its own, so it has to be enabled explicitly.
    this._enable(true);
  }

  getClassName(): string {
    return 'WindPlugin';
  }

  getUniforms() {
    return {
      ubo: [
        { name: 'windPhase', size: 4, type: 'vec4' },
        { name: 'windBend', size: 2, type: 'vec2' },
      ],
      // Used only where the engine has no uniform buffers; harmless otherwise.
      vertex: `#ifdef WIND
uniform vec4 windPhase;
uniform vec2 windBend;
#endif`,
    };
  }

  bindForSubMesh(uniformBuffer: UniformBuffer): void {
    uniformBuffer.updateFloat4('windPhase', WIND_DIR_X, WIND_DIR_Z, SPATIAL_FREQ, field.time * SPEED);
    uniformBuffer.updateFloat2('windBend', AMPLITUDE, this.bendHeight);
  }

  getCustomCode(shaderType: string) {
    if (shaderType !== 'vertex') return null;
    return {
      // Braced so the locals cannot collide with anything else injected at this point.
      CUSTOM_VERTEX_UPDATE_WORLDPOS: `
#ifdef WIND
{
  // Squared, not linear: a linear weight lifts the root off the ground, and on an alpha-test card
  // that reads as the tuft detaching from the terrain.
  float windW = clamp(positionUpdated.y / windBend.y, 0.0, 1.0);
  windW *= windW;
  // Phase from world XZ, so neighbours are out of step and gusts travel across the field.
  float windTheta = dot(worldPos.xz, windPhase.xy) * windPhase.z - windPhase.w;
  // Two incommensurate sines: one alone reads as a metronome.
  float windGust = sin(windTheta) + 0.5 * sin(windTheta * 2.3 + 1.7);
  // XZ only. Vertical motion separates a card from its own ground contact and it has no
  // thickness to hide the gap.
  worldPos.xz += windPhase.xy * (windGust * windBend.x * windW);
}
#endif`,
    };
  }
}
```

- [ ] **Step 2: Apply it to grass and flowers**

In `src/presentation/babylon/scatter.ts`, add the import beside the existing ones:

```ts
import { applyWind } from './wind';
```

The card sizes are currently written twice each — once as `crossCard`'s `size` argument and, after this
change, once as the bend height. They must be the same number, so hoist them to named constants above
`createGroundScatter` rather than repeating the literals:

```ts
/** Grass card height, in local units. Also the wind's bend height — `crossCard` bakes the base to
 *  y=0, so the card's height IS its size argument. The two must not drift apart. */
const GRASS_CARD_SIZE = 0.5;
/** Wildflower card height. Same relationship as GRASS_CARD_SIZE. */
const FLOWER_CARD_SIZE = 0.22;
```

Then rewrite the first four lines of `createGroundScatter` so the materials are held long enough to
bend, and the sizes come from the constants:

```ts
export function createGroundScatter(scene: Scene, shadows: Shadows): void {
  const grassMat = grassMaterial(scene);
  const grass = crossCard(scene, 'grassTuft', GRASS_CARD_SIZE, 3, grassMat);
  grass.thinInstanceSetBuffer('matrix', scatterMatrices({ count: 16000, seed: 1, y: 0, minScale: 0.7, maxScale: 1.3 }).buffer, 16);
  applyWind(grassMat, GRASS_CARD_SIZE);

  const flowerMat = flowerMaterial(scene);
  const flowers = crossCard(scene, 'wildflower', FLOWER_CARD_SIZE, 2, flowerMat);
  flowers.thinInstanceSetBuffer('matrix', scatterMatrices({ count: 1600, seed: 2, y: 0, minScale: 0.7, maxScale: 1.2 }).buffer, 16);
  applyWind(flowerMat, FLOWER_CARD_SIZE);
```

Leave the rest of the function (rocks, bushes, the `shadows.receive`/`shadows.cast` block and its
comment) exactly as it is. Rocks and bushes do not sway — they are stone and dense shrub.

- [ ] **Step 3: Start the wind in the scene**

In `src/presentation/babylon/hubScene.ts`, add the import:

```ts
import { createWind } from './wind';
```

and call it immediately before `createGroundScatter`, so the field exists before anything binds it:

```ts
  const terrain = createTerrain(scene);
  shadows.receive(terrain);
  createWind(scene);
  createGroundScatter(scene, shadows);
```

- [ ] **Step 4: Typecheck and run the existing suite**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

Run: `pnpm test`
Expected: 21 files, 131 tests, all passing — this task adds none and must break none.

- [ ] **Step 5: Verify in the browser**

Start the dev server with `preview_start` (config `dev`) and **make sure the Browser pane is
displayed** — a hidden pane does not composite, so screenshots time out and any timing is void.
Dismiss the AVG intro from the console (see Global Constraints).

Check all four, and screenshot the field:

1. The grass moves, and the motion **travels**: gusts cross the field rather than the whole meadow
   pulsing in unison. If everything moves in lockstep, the wrong hook is in use — re-read spec §3b.
2. Tuft **bases stay planted**. Look along the ground at a shallow angle; roots must not lift or slide
   out of the terrain. If they do, the bend weight is not being squared.
3. Flowers sway too, and less than the grass (they are 0.22 tall against 0.5, so the same world
   amplitude at a shorter card is proportionally more lean — if they look like they are being blown
   flat, that is the signal to lower `AMPLITUDE`, not to special-case flowers).
4. Motion reads **calm**, per the DoD. This is the art-direction gate; tune `AMPLITUDE`, `SPEED` and
   `SPATIAL_FREQ` here, and update each constant's doc comment with what it settled at.

- [ ] **Step 6: Commit**

```bash
git add src/presentation/babylon/wind.ts src/presentation/babylon/scatter.ts src/presentation/babylon/hubScene.ts
git commit -m "feat(p4): wind sway on grass and flowers

A MaterialPluginBase injecting a vertex displacement at
CUSTOM_VERTEX_UPDATE_WORLDPOS -- the only hook where both worldPos and
positionUpdated are in scope, so thin instances can be out of phase with
each other. Grass and flowers only; trees are the next task."
```

---

### Task 2: Wind on the trees, and the shadow question

**Files:**
- Modify: `src/presentation/babylon/trees.ts` (import; `retargetMaterials`, currently lines 118-160)
- Modify: `docs/superpowers/specs/2026-09-04-life-and-motion-design.md` (§3e — record what was seen)
- Test: none. In-browser, per spec §7.

**Interfaces:**
- Consumes: `applyWind(material, bendHeight)` from Task 1.
- Produces: nothing new for later tasks.

The trees are `StandardMaterial` — P2 rebuilt them **off** PBR (see `trees.ts`'s `TREE_TEXTURE_LEVEL`
comment) — so the Task 1 plugin applies unchanged.

- [ ] **Step 1: Measure the GLB's local-space extents before wiring anything**

`bendHeight` is local-space, and a glTF hierarchy can place a canopy high up with a **node transform**
rather than with vertex coordinates. If it does, the canopy's own `position.y` starts near 0, the bend
weight is near 0 across the whole canopy, and the tree will not move — a silent failure that looks
like the plugin is broken. Find out first.

With the scene running, in the browser console:

```js
const s = window.shadows.generator.getLight().getScene();
s.meshes.filter((m) => m.name.startsWith('tree_0_') && m.getTotalVertices() > 0)
  .map((m) => ({
    name: m.name,
    localMaxY: m.getBoundingInfo().boundingBox.maximum.y,
    localMinY: m.getBoundingInfo().boundingBox.minimum.y,
    nodeY: m.position.y,
    verts: m.getTotalVertices(),
  }));
```

Record the output in the commit message. Read it as:

- `localMaxY` comfortably above `localMinY`, `nodeY` ~0 → geometry carries the height. Proceed to
  Step 2 as written.
- `localMaxY - localMinY` small while `nodeY` is large → the height is in a node transform. **Stop and
  report**; Step 2's bounding-box read is wrong for this asset and the fallback needs deciding with
  the numbers in hand, not guessed at now.

- [ ] **Step 2: Bend the tree materials**

In `src/presentation/babylon/trees.ts`, add:

```ts
import { applyWind } from './wind';
```

In `retargetMaterials`, **after** the loop that rebinds `mesh.material` to the replacements and before
the `container.materials = ...` line, insert:

```ts
  // Bend height per material, in LOCAL space, taken from the tallest mesh that uses it — the shader
  // weights by the raw `position` attribute, which is what a bounding box's `maximum` is expressed
  // in. Measured from the container's own meshes, before instantiation and before `root.scaling`
  // multiplies everything by BASE_SCALE: tree.glb is normalized to ~1 unit tall and that
  // normalization is what this reads. A hard-coded 6 here would weight the whole canopy at ~0 and
  // the trees would stand still.
  const bendHeights = new Map<StandardMaterial, number>();
  for (const mesh of container.meshes) {
    const mat = mesh.material;
    if (!(mat instanceof StandardMaterial) || mesh.getTotalVertices() === 0) continue;
    const top = mesh.getBoundingInfo().boundingBox.maximum.y;
    bendHeights.set(mat, Math.max(bendHeights.get(mat) ?? 0, top));
  }
  for (const [mat, height] of bendHeights) {
    // A non-positive extent means the mesh sits entirely at or below its own origin; dividing by it
    // in the shader would be a divide-by-zero or an inverted weight. Skip rather than sway wrongly.
    if (height > 0) applyWind(mat, height);
  }
```

- [ ] **Step 3: Typecheck and run the suite**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

Run: `pnpm test`
Expected: 131 passing, unchanged.

- [ ] **Step 4: Verify the canopy, and answer the shadow question**

In the browser, pane visible:

1. Canopies sway; trunks are effectively still (the squared weight does that).
2. No shearing — the canopy must not slide off the trunk. If it does, `bendHeight` is too small.
3. Trees and grass lean the **same way** at the same moment. They share `WIND_DIR_*` and one clock, so
   a mismatch means one of them is not reading the shared field.

Then the question spec §3e leaves open, which is answered by looking and not by argument. Stand under
and beside a tree with the sun behind it and compare the swaying canopy against its own still shadow
on the ground. Take a screenshot either way.

- **If the mismatch is not noticeable** — expected, at `DARKNESS = 0.15` and with most of a tree's
  shadow falling under its own canopy — record that in spec §3e and ship it.
- **If it reads wrong**, take the fallback the spec names: scale the tree displacement down until the
  mismatch disappears, by passing a reduced amplitude for trees. Record the amplitude it settled at
  and what the mismatch looked like.

Either way §3e must end up stating what was **observed**, replacing its "the plan is to ship the sway
and look at it" with the result.

- [ ] **Step 5: Commit**

```bash
git add src/presentation/babylon/trees.ts docs/superpowers/specs/2026-09-04-life-and-motion-design.md
git commit -m "feat(p4): wind sway on the tree canopies

bendHeight is read from the container meshes' local bounding boxes, not
hard-coded: tree.glb is normalized to ~1 unit and BASE_SCALE multiplies it
later, so a world-space constant would weight the canopy at ~0.

Records in spec 3e what the still shadow under a swaying canopy actually
looks like, replacing the open question."
```

---

### Task 3: Drifting clouds

**Files:**
- Create: `src/domain/math/rng.ts`
- Create: `tests/domain/math/rng.test.ts`
- Create: `src/presentation/babylon/clouds.ts`
- Modify: `src/presentation/babylon/scatter.ts` (delete its private `rng`, lines 24-32; import instead)
- Modify: `src/presentation/babylon/hubScene.ts` (import; call beside `createWater`)

**Interfaces:**
- Consumes: nothing in code. The clouds are coupled to the wind by *direction on screen*, not by an
  import — which way `uOffset` sends them depends on the sphere's UV wrapping, so it is settled by
  looking (Step 7) and by flipping a sign, not by reading `WIND_DIR_*`.
- Produces:
  - `rng(seed: number): () => number` — mulberry32, uniform in [0, 1).
  - `createClouds(scene: Scene): void`.

`clouds.ts` needs a seeded PRNG and `scatter.ts` already has one privately. Move it rather than copy
it — the layouts of the grass and of the clouds must never drift apart because someone edited one copy.

- [ ] **Step 1: Write the failing test that pins the PRNG's output**

This is a **move, and the sequence must not change**: `scatter.ts` seeds the whole hub's layout from
it, so a different implementation silently relocates 16 000 grass tufts, 1 600 flowers, 200 rocks —
and the rock colliders with them. Pin the exact sequence first.

Create `tests/domain/math/rng.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { rng } from '../../../src/domain/math/rng';

describe('rng (mulberry32)', () => {
  it('is deterministic for a seed', () => {
    const a = rng(1);
    const b = rng(1);
    const seqA = [a(), a(), a(), a()];
    const seqB = [b(), b(), b(), b()];
    expect(seqA).toEqual(seqB);
  });

  it('gives different sequences for different seeds', () => {
    const a = rng(1);
    const b = rng(2);
    expect(a()).not.toEqual(b());
  });

  it('stays in [0, 1)', () => {
    const r = rng(99);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  // The guard that makes this a move rather than a rewrite. These four values were produced by the
  // implementation that shipped the hub's layout; if they change, every scattered thing has moved.
  it('reproduces the exact sequence the hub layout was generated from', () => {
    const r = rng(1);
    const got = [r(), r(), r(), r()].map((v) => Number(v.toFixed(12)));
    expect(got).toEqual(EXPECTED_SEED_1);
  });
});
```

Leave `EXPECTED_SEED_1` undefined for now — Step 2 fills it in from the current implementation.

- [ ] **Step 2: Capture the real sequence, then run the test to see it fail**

Capture the values from the implementation as it exists today, so the constant is evidence and not a
guess:

```bash
node -e "
function rng(seed){let a=seed;return()=>{a|=0;a=(a+0x6d2b79f5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};}
const r=rng(1);console.log(JSON.stringify([r(),r(),r(),r()].map(v=>Number(v.toFixed(12)))));
"
```

Paste the printed array into the test file as:

```ts
const EXPECTED_SEED_1 = [/* the four numbers printed above */];
```

Run: `pnpm test tests/domain/math/rng.test.ts`
Expected: FAIL — `Failed to resolve import "../../../src/domain/math/rng"`.

- [ ] **Step 3: Move the PRNG into the domain**

Create `src/domain/math/rng.ts` with the function body moved **verbatim** from `scatter.ts`:

```ts
/**
 * Deterministic PRNG (mulberry32), uniform in [0, 1). Seeded so every procedural layout in the hub is
 * identical on every run — the ground scatter's 16 000 grass tufts and its rock colliders come out of
 * this, so the exact sequence is load-bearing and pinned by a test. Change the algorithm and the whole
 * hub rearranges.
 */
export const rng = (seed: number): (() => number) => {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
```

In `src/presentation/babylon/scatter.ts`, delete the private `rng` function and its doc comment
(currently lines 23-32) and import instead:

```ts
import { rng } from '../../domain/math/rng';
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test`
Expected: PASS — 22 files, 135 tests. The four new ones pass, and nothing else changed.

- [ ] **Step 5: Write the cloud module**

Create `src/presentation/babylon/clouds.ts`:

```ts
import type { Scene } from '@babylonjs/core/scene';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
// Side-effect: registers the StandardMaterial shader (tree-shaken deep imports need this).
import '@babylonjs/core/Materials/standardMaterial';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { rng } from '../../domain/math/rng';

/** Just inside `environment.ts`'s 1000-diameter skydome, so the clouds are in front of the gradient
 *  and behind everything else. Both are `infiniteDistance`, so neither has a real position. */
const DOME_DIAMETER = 900;

/** Texture widths of drift per second. Small: clouds that visibly race read as a timelapse. Tuned in
 *  the browser (Step 7). */
const DRIFT_SPEED = 0.004;

/** Peak alpha of a cloud's centre. Above ~0.7 the layer stops reading as cloud and starts reading as
 *  a painted ceiling. */
const CLOUD_ALPHA = 0.55;

/**
 * A drifting cloud layer: a second inward-facing dome carrying a procedurally drawn alpha texture
 * that scrolls in u.
 *
 * `fogEnabled = false` and `infiniteDistance = true` for the same reason `environment.ts` records for
 * the skydome: at this distance scene fog would flatten the whole thing into a sheet of fog colour.
 * `disableLighting` because a cloud lit by the scene's directional sun would take a terminator across
 * the dome.
 */
export function createClouds(scene: Scene): void {
  const dome = CreateSphere('clouds', { diameter: DOME_DIAMETER, segments: 24, sideOrientation: Mesh.BACKSIDE }, scene);
  dome.infiniteDistance = true;
  dome.isPickable = false;

  const mat = new StandardMaterial('cloudMat', scene);
  mat.disableLighting = true;
  mat.backFaceCulling = false;
  mat.fogEnabled = false;
  const tex = cloudTexture(scene);
  mat.emissiveTexture = tex;
  // The same texture drives coverage: StandardMaterial reads opacity from the alpha channel, which
  // is the channel `cloudTexture` paints the cloud shapes into.
  mat.opacityTexture = tex;
  dome.material = mat;

  // Drift from the same clock as the grass. `uOffset` is in texture widths, so it wraps naturally as
  // long as the texture tiles in u — which `cloudTexture` is drawn to do.
  //
  // Which SIGN sends the clouds the same way the grass leans is a property of how the sphere's UVs
  // wrap against WIND_DIR_*, not something worth deriving on paper. Confirm it in the browser
  // (Step 7) and negate DRIFT_SPEED if they cross.
  scene.onBeforeRenderObservable.add(() => {
    tex.uOffset += (DRIFT_SPEED * scene.getEngine().getDeltaTime()) / 1000;
  });
}

/**
 * Soft white blobs in the upper band of the dome, drawn into an alpha texture.
 *
 * Every blob is drawn three times — at x, x - width and x + width — so a cloud straddling the seam
 * appears on both edges and the texture **tiles in u**. Without that, the drift sweeps a hard vertical
 * cut across the sky once per loop, which is only visible after watching a full period and is
 * therefore very easy to ship.
 */
function cloudTexture(scene: Scene): DynamicTexture {
  const width = 1024;
  const height = 512;
  const tex = new DynamicTexture('cloudLayer', { width, height }, scene, false);
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, width, height);
  const rand = rng(11);
  for (let i = 0; i < 40; i++) {
    const cx = rand() * width;
    // v 0.05..0.5 keeps the band above the horizon; clouds sitting on the skyline would cut through
    // the mountain ring that `terrain.ts` draws there.
    const cy = height * (0.05 + rand() * 0.45);
    const r = 40 + rand() * 90;
    for (const dx of [-width, 0, width]) {
      const g = ctx.createRadialGradient(cx + dx, cy, 0, cx + dx, cy, r);
      g.addColorStop(0, `rgba(255,255,255,${CLOUD_ALPHA})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx + dx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  tex.update(true);
  tex.hasAlpha = true;
  tex.wrapU = Texture.WRAP_ADDRESSMODE; // the drift depends on this
  tex.wrapV = Texture.CLAMP_ADDRESSMODE;
  return tex;
}
```

- [ ] **Step 6: Add the clouds to the scene**

In `src/presentation/babylon/hubScene.ts`, add the import and the call beside the other world builders:

```ts
import { createClouds } from './clouds';
```

```ts
  createGroundScatter(scene, shadows);
  createWater(scene);
  createClouds(scene);
  createLandmark(scene, shadows);
```

- [ ] **Step 7: Typecheck, test, and verify in the browser**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

Run: `pnpm test`
Expected: 135 passing.

In the browser, pane visible:

1. Clouds are visible against the sky gradient and drift slowly.
2. They drift **the same way the grass leans**, not against it. If they cross, negate `DRIFT_SPEED` —
   that is the sign question the code comment leaves to this step.
3. **No seam.** One loop is `1 / DRIFT_SPEED` seconds — 250 s at 0.004, so do not judge this from a
   few seconds of watching. Either wait one full period, or force it: `tex.uOffset = 0.5` and step it
   by hand through a wrap in the console. A vertical cut sweeping past means the three-pass wrapped
   drawing was lost.
4. The dome takes **no fog and no lighting**: its colour must not shift as the sun moves or as you
   walk toward the horizon.
5. The scatter is **unchanged** by the PRNG move — the grass, flowers and rocks are where they were.
   The pinned test is the real guard; this is the visual confirmation.

- [ ] **Step 8: Commit**

```bash
git add src/domain/math/rng.ts tests/domain/math/rng.test.ts src/presentation/babylon/clouds.ts src/presentation/babylon/scatter.ts src/presentation/babylon/hubScene.ts
git commit -m "feat(p4): drifting cloud layer

A second inward-facing dome with a procedurally drawn alpha texture
scrolling in u, along the shared wind direction. Every blob is drawn at
three x offsets so the texture tiles and the drift shows no seam.

Moves scatter.ts's private mulberry32 into src/domain/math/rng.ts so the
clouds share it, with a test pinning the exact sequence -- it seeds the
hub's whole layout, so a rewritten PRNG would silently relocate 16 000
grass tufts and their rock colliders."
```

---

### Task 4: The butterfly flight path (pure domain, TDD)

**Files:**
- Create: `src/domain/hub/butterfly.ts`
- Test: `tests/domain/hub/butterfly.test.ts`

**Interfaces:**
- Consumes: nothing (the domain may not import `wind.ts` — that is presentation. The wind direction is
  re-declared here as a domain constant and Task 5 asserts nothing about the two matching; they are
  hand-kept in step, and the doc comment says so.)
- Produces:
  - `interface ButterflySample { readonly x: number; readonly z: number; readonly heightAboveGround: number; readonly wingPhase: number }`
  - `butterflyAt(seed: number, t: number): ButterflySample`
  - `BUTTERFLY_RADIUS: number`, `MIN_HEIGHT: number`, `MAX_HEIGHT: number`, `MAX_SPEED: number`

- [ ] **Step 1: Write the failing tests**

Create `tests/domain/hub/butterfly.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  butterflyAt,
  BUTTERFLY_RADIUS,
  MIN_HEIGHT,
  MAX_HEIGHT,
  MAX_SPEED,
} from '../../../src/domain/hub/butterfly';

const SEEDS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const TIMES = Array.from({ length: 400 }, (_, i) => i * 0.37);

describe('butterflyAt', () => {
  it('is deterministic', () => {
    expect(butterflyAt(3, 12.5)).toEqual(butterflyAt(3, 12.5));
  });

  it('gives different seeds different paths', () => {
    const a = butterflyAt(1, 5);
    const b = butterflyAt(2, 5);
    expect(a.x === b.x && a.z === b.z).toBe(false);
  });

  it('stays inside the field radius for every seed over a long span', () => {
    for (const seed of SEEDS) {
      for (const t of TIMES) {
        const s = butterflyAt(seed, t);
        expect(Math.hypot(s.x, s.z)).toBeLessThanOrEqual(BUTTERFLY_RADIUS);
      }
    }
  });

  it('stays inside the height band', () => {
    for (const seed of SEEDS) {
      for (const t of TIMES) {
        const s = butterflyAt(seed, t);
        expect(s.heightAboveGround).toBeGreaterThanOrEqual(MIN_HEIGHT);
        expect(s.heightAboveGround).toBeLessThanOrEqual(MAX_HEIGHT);
      }
    }
  });

  it('moves continuously — no teleport at any period boundary', () => {
    const dt = 0.01;
    for (const seed of SEEDS) {
      for (const t of TIMES) {
        const a = butterflyAt(seed, t);
        const b = butterflyAt(seed, t + dt);
        const moved = Math.hypot(b.x - a.x, b.z - a.z, b.heightAboveGround - a.heightAboveGround);
        expect(moved).toBeLessThanOrEqual(MAX_SPEED * dt);
      }
    }
  });

  it('keeps wingPhase in [0, 1) for positive and negative time', () => {
    for (const t of [-13.7, -0.2, 0, 0.2, 13.7]) {
      const p = butterflyAt(4, t).wingPhase;
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThan(1);
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test tests/domain/hub/butterfly.test.ts`
Expected: FAIL — `Failed to resolve import "../../../src/domain/hub/butterfly"`.

- [ ] **Step 3: Write the implementation**

Create `src/domain/hub/butterfly.ts`:

```ts
/**
 * A butterfly's position and wingbeat at a moment in time, as plain data — pure and engine-agnostic,
 * the same way `waterBody.ts` is. `butterflies.ts` turns it into billboards.
 */
export interface ButterflySample {
  readonly x: number;
  readonly z: number;
  /**
   * Height ABOVE THE GROUND, not a world Y. Ground height comes from `terrainHeight`, which lives in
   * the presentation layer; reading it here would drag an engine-adjacent dependency into the domain.
   * The caller adds the two.
   */
  readonly heightAboveGround: number;
  /** Wingbeat position, in [0, 1). What a beat looks like is the presentation layer's business. */
  readonly wingPhase: number;
}

const TAU = Math.PI * 2;

/** No butterfly leaves this radius from the origin. Comfortably inside the hub's ~36-unit walkable
 *  field, so none of them is ever seen out over the barrier slope. The tests assert this bound; the
 *  construction below *guarantees* it rather than clamping to it. The proof: each wander axis is a sum
 *  of two sines whose amplitudes sum to 1, so |alongU| <= WANDER and |acrossV| <= WANDER/WIND_STRETCH,
 *  and the worst case is HOME_MAX + sqrt(WANDER^2 + (WANDER/WIND_STRETCH)^2) = 24 + 4.13 = 28.13.
 *  Changing WANDER, HOME_MAX or WIND_STRETCH means redoing that arithmetic. */
export const BUTTERFLY_RADIUS = 30;

/** Height band above the terrain: knee height to just over the knight's head (~1.9 units). */
export const MIN_HEIGHT = 0.4;
export const MAX_HEIGHT = 2.2;

/** Bound on |d(position)/dt|, in units per second — what the continuity test checks against. Derived,
 *  not measured: each axis is a sum of sinusoids whose derivatives are bounded by
 *  sum(amplitude_i * omega_i), and the value below is that sum over all three axes with margin. */
export const MAX_SPEED = 4;

/** Furthest a butterfly's home can sit from the origin. */
const HOME_MAX = 24;
/** Half-extent of the wander loop around home, per axis. */
const WANDER = 3.5;

/** Wind direction, matching `wind.ts`'s WIND_DIR_X / WIND_DIR_Z. Re-declared rather than imported:
 *  the domain may not import from `src/presentation/`. The two are kept in step by hand — if the wind
 *  direction changes there, change it here, or the butterflies will drift across the gusts. */
const WIND_X = 0.8;
const WIND_Z = 0.6;

/** How much longer the wander loop is along the wind than across it. Elongating the loop is what makes
 *  the butterflies read as going *with* the weather; an actual translating drift would leave the field
 *  eventually, and BUTTERFLY_RADIUS is a guarantee rather than a clamp. */
const WIND_STRETCH = 1.6;

/** Wingbeats per second. */
const WINGBEAT_HZ = 7;

/** Deterministic 0..1 hash of a real number — a per-seed offset generator, not a sequence. */
const hash01 = (n: number): number => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/** Fractional part, always in [0, 1) — including for negative inputs, where `%` would not be. */
const fract = (n: number): number => n - Math.floor(n);

/**
 * Where butterfly `seed` is at time `t`.
 *
 * The path is a slow wander around a fixed home point: two sinusoids per axis at incommensurate
 * frequencies, so it never retraces a visible loop, stretched along the wind direction. Everything is
 * bounded by construction — `|wander| <= WANDER` per axis because the two sine amplitudes sum to 1 —
 * so no clamp is needed and the radius bound is provable rather than enforced.
 */
export const butterflyAt = (seed: number, t: number): ButterflySample => {
  const homeAngle = hash01(seed) * TAU;
  // sqrt() spreads homes evenly over the disc instead of bunching them at the centre.
  const homeDist = HOME_MAX * Math.sqrt(hash01(seed + 1.3));
  const homeX = homeDist * Math.cos(homeAngle);
  const homeZ = homeDist * Math.sin(homeAngle);

  const px = hash01(seed + 2.7) * TAU;
  const pz = hash01(seed + 4.1) * TAU;
  const py = hash01(seed + 5.9) * TAU;

  // Amplitudes sum to exactly 1, so each wander term is bounded by WANDER.
  const wanderU = WANDER * (0.667 * Math.sin(0.37 * t + px) + 0.333 * Math.sin(0.83 * t + px * 1.7));
  const wanderV = WANDER * (0.667 * Math.sin(0.41 * t + pz) + 0.333 * Math.sin(0.91 * t + pz * 1.7));

  // u runs along the wind, v across it. The elongation is done by SHRINKING the across-wind axis, not
  // by stretching the along-wind one: stretching would push |alongU| past WANDER and break the radius
  // proof, whereas shrinking leaves both axes bounded by WANDER and still gives a 1.6:1 loop.
  const alongU = wanderU;
  const acrossV = wanderV / WIND_STRETCH;
  const x = homeX + alongU * WIND_X - acrossV * WIND_Z;
  const z = homeZ + alongU * WIND_Z + acrossV * WIND_X;

  const midHeight = (MIN_HEIGHT + MAX_HEIGHT) / 2;
  const heightSwing = (MAX_HEIGHT - MIN_HEIGHT) / 2;
  const heightAboveGround =
    midHeight + heightSwing * (0.667 * Math.sin(0.53 * t + py) + 0.333 * Math.sin(1.19 * t + py * 1.7));

  return { x, z, heightAboveGround, wingPhase: fract(t * WINGBEAT_HZ + hash01(seed + 7.3)) };
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test tests/domain/hub/butterfly.test.ts`
Expected: PASS, 6 tests.

Run: `pnpm test`
Expected: 23 files, 141 tests, all passing.

- [ ] **Step 5: Commit**

```bash
git add src/domain/hub/butterfly.ts tests/domain/hub/butterfly.test.ts
git commit -m "feat(p4): pure butterfly flight path

Bounded by construction rather than by clamping -- the two sine amplitudes
per axis sum to 1, so HOME_MAX + WANDER*sqrt(2) < BUTTERFLY_RADIUS is a
proof and the test is checking the proof held.

The wander loop is stretched along the wind direction instead of actually
translating with it: a real drift would eventually leave the field."
```

---

### Task 5: Butterflies in the scene

**Files:**
- Create: `src/presentation/babylon/butterflies.ts`
- Modify: `src/presentation/babylon/hubScene.ts` (import; call beside `createClouds`)

**Interfaces:**
- Consumes: `butterflyAt`, `ButterflySample` (Task 4); `rng` (Task 3); `terrainHeight` (existing).
- Produces: `createButterflies(scene: Scene): void`.

- [ ] **Step 1: Write the module**

Create `src/presentation/babylon/butterflies.ts`:

```ts
import type { Scene } from '@babylonjs/core/scene';
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
// Side-effect: registers the StandardMaterial shader (tree-shaken deep imports need this).
import '@babylonjs/core/Materials/standardMaterial';
import { Material } from '@babylonjs/core/Materials/material';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { butterflyAt } from '../../domain/hub/butterfly';
import { rng } from '../../domain/math/rng';
import { terrainHeight } from './terrainHeight';

/** Enough to find one wherever you stand, few enough that the field does not read as infested. */
const COUNT = 10;
/** Wingspan in world units. A real one is ~0.07; this is scaled up so it reads at walking distance. */
const SIZE = 0.35;

/**
 * Ambient butterflies: billboards driven by the pure path in `src/domain/hub/butterfly.ts`.
 *
 * Deliberately NOT registered with `shadows`. A butterfly's shadow is invisible at this size, and the
 * frame measurement (spec §2) puts every shadow caster at four extra draw calls — the knight's 47
 * meshes alone cost 1.73 ms. Not pickable and no physics either: nothing in the game interacts with
 * them.
 *
 * Ten ordinary meshes rather than thin instances, on purpose. Thin-instancing needs a per-frame matrix
 * buffer rewrite to animate, which is more machinery than ten draw calls are worth — and spec §2's
 * ~0.4 ms resolution floor means the difference is very unlikely to be measurable. Measure before
 * changing it.
 */
export function createButterflies(scene: Scene): void {
  const mat = wingMaterial(scene);
  const rand = rng(21);
  // A stable per-butterfly seed, drawn once so the layout is identical every run.
  const seeds = Array.from({ length: COUNT }, () => rand() * 1000);

  const wings = seeds.map((_, i) => {
    const w = CreatePlane(`butterfly_${i}`, { size: SIZE }, scene);
    w.material = mat;
    w.isPickable = false;
    // BILLBOARDMODE_Y, not ALL: a butterfly that pitches to face a camera looking down at it reads as
    // a sticker. Yaw-only keeps it upright in the world.
    w.billboardMode = Mesh.BILLBOARDMODE_Y;
    // Always active: they roam the whole field, and re-testing ten tiny meshes against the frustum
    // each frame buys nothing. Same reasoning as the scatter cards.
    w.alwaysSelectAsActiveMesh = true;
    return w;
  });

  let elapsed = 0;
  scene.onBeforeRenderObservable.add(() => {
    elapsed += scene.getEngine().getDeltaTime() / 1000;
    for (let i = 0; i < wings.length; i++) {
      const s = butterflyAt(seeds[i], elapsed);
      wings[i].position.set(s.x, terrainHeight(s.x, s.z) + s.heightAboveGround, s.z);
      // The wingbeat, as a horizontal squash: a billboard has no third dimension to fold, so scaling
      // x toward 0 and back is what a pair of wings opening and closing looks like edge-on.
      wings[i].scaling.x = 0.25 + 0.75 * Math.abs(Math.cos(s.wingPhase * Math.PI * 2));
    }
  });
}

/** Two pale wings on a dark body, drawn into an alpha-cutout texture. Cutout, not blended, for the
 *  same reason `scatter.ts` gives: no transparency sorting to get wrong. */
function wingMaterial(scene: Scene): StandardMaterial {
  const size = 64;
  const tex = new DynamicTexture('butterflyWings', { width: size, height: size }, scene, false);
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = '#f2e6a8';
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(size / 2 + dir * size * 0.18, size * 0.42, size * 0.17, size * 0.24, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(size / 2 + dir * size * 0.14, size * 0.66, size * 0.12, size * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#3b2f1e';
  ctx.fillRect(size / 2 - size * 0.03, size * 0.28, size * 0.06, size * 0.46);
  tex.update(true);
  tex.hasAlpha = true;

  const mat = new StandardMaterial('butterflyMat', scene);
  mat.diffuseTexture = tex;
  mat.useAlphaFromDiffuseTexture = true;
  mat.transparencyMode = Material.MATERIAL_ALPHATEST;
  mat.backFaceCulling = false;
  mat.specularColor = new Color3(0, 0, 0);
  // The same trick the grass and the canopy use: without a floor, the side turned away from the sun
  // goes black under ACES, and a black butterfly reads as a fly.
  mat.emissiveColor = new Color3(0.35, 0.32, 0.22);
  return mat;
}
```

- [ ] **Step 2: Add them to the scene**

In `src/presentation/babylon/hubScene.ts`:

```ts
import { createButterflies } from './butterflies';
```

```ts
  createWater(scene);
  createClouds(scene);
  createButterflies(scene);
  createLandmark(scene, shadows);
```

- [ ] **Step 3: Typecheck and test**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

Run: `pnpm test`
Expected: 141 passing, unchanged by this task.

- [ ] **Step 4: Verify in the browser**

Pane visible, AVG dismissed. Walk the field (`WASD`, `Shift` to sprint) and check:

1. Butterflies are visible near the spawn area and elsewhere — not all bunched in one place.
2. None sinks into the terrain or floats conspicuously above it, **including on slopes and on the
   barrier ramp**, which is where a height-above-ground bug shows first.
3. Wings beat; the motion reads alive rather than like a sprite being dragged.
4. None leaves the field or crosses the barrier. The domain test proves the radius; this confirms the
   radius is the right one for this map.
5. They stay upright when the camera pitches down (that is `BILLBOARDMODE_Y` doing its job).

Screenshot one at close range and one wide shot of the field.

- [ ] **Step 5: Commit**

```bash
git add src/presentation/babylon/butterflies.ts src/presentation/babylon/hubScene.ts
git commit -m "feat(p4): ambient butterflies

Ten yaw-billboarded cutout planes driven by the pure domain path, riding
terrainHeight so they hold their height over slopes. No shadows, no physics,
no picking; ten plain meshes rather than thin instances until a measurement
says otherwise."
```

---

### Task 6: Correct the shallow-water scope claim

**Files:**
- Modify: `src/domain/hub/waterBody.ts` (the header doc comment, lines 1-5)
- Modify: `docs/HANDOFF.md` (§5, the "P3 left `WaterBody`..." paragraph)

Spec §1 settles that shallow-water feedback is not part of P4. Two files still say it is. Neither
statement is load-bearing for any code — this is purely stopping a wrong claim from outliving the
phase — so it is its own small task rather than being smuggled into an unrelated commit.

- [ ] **Step 1: Fix the domain doc comment**

In `src/domain/hub/waterBody.ts`, replace the header comment's second sentence. It currently reads:

```ts
 * A body of standing water, as plain data. Engine-agnostic on purpose: `water.ts` builds the mesh
 * from this, and P4's shallow-water feedback (splashes, slowdown) will read the same shape rather
 * than re-deriving the pond's geometry from the mesh.
```

Replace with:

```ts
 * A body of standing water, as plain data. Engine-agnostic on purpose: `water.ts` builds the mesh
 * from this, and shallow-water feedback (splashes, slowdown, wet shading) should read the same shape
 * rather than re-deriving the pond's geometry from the mesh.
 *
 * That feedback is NOT built, and it is not P4's — P4 is wind, clouds and ambient life, and shallow
 * water was ruled out of it because it is movement feel and would reach into the pure movement domain
 * (`2026-09-04-life-and-motion-design.md` §1). This shape is still the right one for whoever does
 * build it; it just has no scheduled owner.
```

- [ ] **Step 2: Fix the handoff**

In `docs/HANDOFF.md` §5, the P4 entry ends with:

```
   P3 left `WaterBody` (`src/domain/hub/waterBody.ts`) as the shape P4's shallow-water feedback —
   splashes, slowdown, wet shading — should read, and the plaza's eight pillars are where the
   mode-entrances attach.
```

Replace with:

```
   P3 left `WaterBody` (`src/domain/hub/waterBody.ts`) as the shape shallow-water feedback — splashes,
   slowdown, wet shading — should read when someone builds it. **It is not part of P4**, which is wind,
   clouds and ambient life only: shallow water is movement feel and would reach into the pure movement
   domain, so it was ruled out when P4 was designed (`2026-09-04-life-and-motion-design.md` §1). It has
   no scheduled owner. The plaza's eight pillars are where the mode-entrances attach.
```

- [ ] **Step 3: Verify nothing else repeats the claim**

Run: `grep -rn "P4" src/ docs/HANDOFF.md docs/superpowers/specs/2026-08-18-refined-hub-world-roadmap.md`
Expected: no remaining statement that P4 includes shallow-water feedback. If the roadmap turns out to
carry one too, fix it the same way and add it to the commit.

- [ ] **Step 4: Test and commit**

Run: `pnpm test`
Expected: 141 passing (a comment change must not move anything).

```bash
git add src/domain/hub/waterBody.ts docs/HANDOFF.md
git commit -m "docs: shallow-water feedback is not P4

waterBody.ts and HANDOFF both promised it as part of P4 while the roadmap's
P4 DoD never listed it. The P4 design spec settled it the roadmap's way;
this stops the wrong version outliving the phase."
```

---

### Task 7: Measure the phase, walk the M4 checklist, and record both

**Files:**
- Modify: `docs/superpowers/specs/2026-09-04-life-and-motion-design.md` (a new §10, "Measured")
- Modify: `docs/HANDOFF.md` (§4, add P4; §5, drop P4 from "what's next")
- Modify: `docs/superpowers/specs/2026-08-18-refined-hub-world-roadmap.md` (§4 P4 — mark done)

- [ ] **Step 1: Measure the phase's frame cost**

**The Browser pane must be displayed.** Confirm it in the harness, not by eye — the script below
aborts otherwise, which is the guard that a whole previous session lacked.

Paired A/B, each item disabled against the shipped scene, in the browser console:

```js
(async () => {
  const g = window.shadows.generator;
  const scene = g.getLight().getScene();
  const engine = scene.getEngine();
  const gl = engine._gl;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  if (document.hidden) return { abort: 'pane hidden — every number would be void' };
  engine.stopRenderLoop();
  await sleep(300);

  const clouds = scene.getMeshByName('clouds');
  const wings = scene.meshes.filter((m) => m.name.startsWith('butterfly_'));
  const variants = {
    clouds: { on: () => (clouds.setEnabled(false)), off: () => clouds.setEnabled(true) },
    butterflies: { on: () => wings.forEach((w) => w.setEnabled(false)), off: () => wings.forEach((w) => w.setEnabled(true)) },
  };

  const BATCH = 40;
  const batch = () => {
    for (let i = 0; i < 12; i++) scene.render();
    gl.finish();
    const t0 = performance.now();
    for (let i = 0; i < BATCH; i++) scene.render();
    gl.finish();
    return (performance.now() - t0) / BATCH;
  };
  const pairs = {}; Object.keys(variants).forEach((k) => (pairs[k] = []));
  const fulls = [];
  for (let r = 0; r < 12; r++) {
    for (const name of Object.keys(variants)) {
      const a = batch();
      variants[name].on();
      const b = batch();
      variants[name].off();
      const c = batch();
      fulls.push(a, c);
      pairs[name].push(((a + c) / 2) - b);
      await sleep(40);
    }
  }
  const stats = (arr) => { const s = [...arr].sort((x, y) => x - y); return { median: +s[Math.floor(s.length / 2)].toFixed(3), p25: +s[Math.floor(s.length * 0.25)].toFixed(3), p75: +s[Math.floor(s.length * 0.75)].toFixed(3) }; };
  engine.runRenderLoop(() => scene.render());
  return { fullFrame: stats(fulls), clouds: stats(pairs.clouds), butterflies: stats(pairs.butterflies) };
})()
```

Wind cannot be A/B'd this way — disabling the plugin recompiles the shader, and spec §2's predecessor
records that measuring a recompile and calling it a feature cost is exactly how the last session
produced an impossible number. Get the wind's cost as the residual instead: compare `fullFrame` here
against the **5.10 ms** shipped-scene median recorded in `2026-08-25-shadow-quality-design.md` §7,
minus the clouds and butterflies deltas, and state plainly that it is a residual across two sessions
and therefore weaker evidence than the two paired deltas.

- [ ] **Step 2: Write §10 into the spec**

Add a `## 10. Measured` section recording, for each of the three items: the paired median with p25/p75,
or the words **"unresolved — below the ~0.4 ms floor"** where that is what the data says. Quote the
full-frame figure and the 60 fps headroom that remains. Do not report a number whose IQR straddles
zero as if it were positive; say it straddles zero.

- [ ] **Step 3: Walk the M4 "world done" checklist**

Roadmap §6, from spawn, all of it: rolling terrain the knight rides; distant mountains fading into the
sky; tone-mapped, bloomed lighting with nothing washed out or crushed; a water feature and a landmark,
both with correct collision; wind-swept grass and trees, drifting clouds, ambient life; no clipping
through trees, landmarks or designated-solid props; steady 60 fps.

Record the result item by item in spec §10 — including anything that fails. A failing item is a
finding, not a reason to quietly re-scope: report it and let the user decide.

- [ ] **Step 4: Update the docs to say P4 shipped**

- `docs/HANDOFF.md` §4: add a P4 bullet beside P1/P2/P3, with the measured costs and the shadow-sway
  limitation from spec §3e.
- `docs/HANDOFF.md` §5: remove P4 from "what's next", leaving toon shading and game modes; note that
  M4 is closed (or exactly what is still open, if Step 3 found something).
- The roadmap's §4 P4 entry: mark it done, the way P1–P3 are.

- [ ] **Step 5: Commit**

```bash
git add docs/
git commit -m "docs(p4): measured costs and the M4 world-done walkthrough

Paired deltas on a visible pane, with anything under the machine's ~0.4 ms
resolution floor reported as unresolved rather than as a number. Wind's cost
is a cross-session residual and is labelled as the weaker evidence it is:
toggling the plugin would measure a shader recompile, which is the exact
mistake the shadow-quality session made."
```

---

## Self-Review

**Spec coverage.** §1 scope correction → Task 6. §2 budget discipline → Task 7 (and it constrains
Tasks 3 and 5). §3a–3d wind → Tasks 1 and 2. §3e shadow limitation → Task 2 Step 4, which must write
the observation back into the spec. §4 clouds → Task 3. §5a butterfly domain → Task 4. §5b butterfly
presentation → Task 5. §6 module table → all files appear across Tasks 1–5, plus
`src/domain/math/rng.ts` and its test, which the table does not list because the DRY problem only
surfaced while writing this plan. §7 verification, all six items → Task 1 Step 5, Task 2 Step 4,
Task 3 Step 7, Task 4 Step 4, Task 5 Step 4, Task 7 Step 1. §8 DoD → Task 7 Step 3. §9 out-of-scope →
nothing here builds any of it.

**Type consistency.** `applyWind(material, bendHeight)` is defined in Task 1 and called with those two
arguments in Tasks 1 and 2. `WIND_DIR_X`/`WIND_DIR_Z` are exported in Task 1 and consumed in Task 3;
Task 4 deliberately re-declares them as domain constants instead of importing, and says why in the
code. `rng(seed)` is created in Task 3 and consumed in Tasks 3 and 5. `butterflyAt(seed, t)` returns
`{x, z, heightAboveGround, wingPhase}` in Task 4 and is destructured on exactly those names in Task 5.
`ButterflySample`'s field names match the test's assertions.

**Two things this plan changed about the spec, both recorded rather than silently absorbed:**

1. `src/domain/math/rng.ts` did not exist in the spec's module table. It appeared because `clouds.ts`
   needs a seeded PRNG and `scatter.ts` already had one privately, and copying it would have created
   two sources for the hub's whole layout.
2. Spec §5a says the butterflies "drift gently along the wind direction". A literal translating drift
   is unbounded and would break the radius guarantee the same section asks for, so Task 4 realizes it
   as a wander loop **stretched** along the wind. Same read on screen, and the bound stays a proof.
