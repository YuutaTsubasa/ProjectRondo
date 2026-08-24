# M4 · P3 — Water & Landmarks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the hub two destinations — a wadeable pond in a natural terrain low, and a stone colonnade on the high ground that later hosts NPCs and mode-entrances.

**Architecture:** Two new presentation builders (`water.ts`, `landmark.ts`) called once each from `hubScene`, following the shape of `trees.ts` and `scatter.ts`: one exported function, owning its own materials and colliders. One new pure data module in `domain/` describing the pond. Both features sit on the existing height field — `terrainHeight.ts` and `terrain.ts` are not modified.

**Tech Stack:** TypeScript (strict), Svelte 5, Babylon.js 9.21 with deep tree-shaken imports, Havok physics, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-24-water-landmarks-design.md`

## Global Constraints

- **Branch:** `claude/p3-water-landmarks`, already created off `main` (`9d01d7b`); the spec is committed as `82c69c6`.
- **Babylon imports are deep and tree-shaken.** Every feature needs its own import path, and a missing side-effect import fails **silently** — no error, no effect (HANDOFF §7).
- **Everything fog reaches is a `StandardMaterial` in gamma space.** Do not introduce a `PBRMaterial`, a `NodeMaterial`, or `@babylonjs/materials`. The trees bleached grey because they were the one PBR surface (P2 spec §11); water is large and often distant, so it must not become the next one.
- **`terrainHeight.ts` and `terrain.ts` must not be modified.**
- **The 124 existing tests stay green.** This plan adds 4 in Task 1, so the suite ends at **128**. `pnpm test`.
- **`npx tsc --noEmit` must be clean.** Allow ~3 minutes; it is slow.
- **Do not run prettier.** It is not this project's formatter — there is no config — and it rewrites whole files (205 lines on one file last phase).
- **Babylon scene code is not unit-tested here.** It is verified in-browser (HANDOFF §6).
- **`gh` is not on PATH.** Invoke it as `"/c/Program Files/GitHub CLI/gh.exe"`.

---

### Task 1: The pond's description, and proof it sits in a basin

**Files:**
- Create: `src/domain/hub/waterBody.ts`
- Create: `tests/presentation/waterPlacement.test.ts`

**Interfaces:**
- Consumes: `terrainHeight` from `src/presentation/babylon/terrainHeight` (existing, pure).
- Produces: `interface WaterBody { readonly centreX: number; readonly centreZ: number; readonly radius: number; readonly surfaceY: number }` and `const POND: WaterBody`. Task 2 builds the mesh from `POND`.

The test lives under `tests/presentation/` rather than `tests/domain/` because its value comes from checking the constant against `terrainHeight`, which is a presentation module. A pure value-shape test would assert nothing a reader could not see.

- [ ] **Step 1: Write the failing test**

Create `tests/presentation/waterPlacement.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { POND } from '../../src/domain/hub/waterBody';
import { terrainHeight } from '../../src/presentation/babylon/terrainHeight';

/** Samples the terrain on a 1-unit grid inside `radius` of the pond centre. */
function sampleDisc(radius: number): { x: number; z: number; y: number }[] {
  const cells: { x: number; z: number; y: number }[] = [];
  for (let dx = -radius; dx <= radius; dx += 1)
    for (let dz = -radius; dz <= radius; dz += 1) {
      if (Math.hypot(dx, dz) > radius) continue;
      const x = POND.centreX + dx;
      const z = POND.centreZ + dz;
      cells.push({ x, z, y: terrainHeight(x, z) });
    }
  return cells;
}

describe('pond placement', () => {
  it('sits over a basin — the centre is below the water surface', () => {
    expect(terrainHeight(POND.centreX, POND.centreZ)).toBeLessThan(POND.surfaceY);
  });

  it('floods a pool broad enough to read as water, not a puddle', () => {
    const submerged = sampleDisc(POND.radius).filter((c) => c.y < POND.surfaceY);
    // area = pi*r^2, so a >=6-unit-radius pool needs >=113 one-unit cells
    expect(submerged.length).toBeGreaterThanOrEqual(113);
  });

  it('is shallow enough to wade rather than swim', () => {
    const floor = Math.min(...sampleDisc(POND.radius).map((c) => c.y));
    expect(POND.surfaceY - floor).toBeLessThan(1.0);
  });

  it('has a shore — the disc is oversized, so its rim is dry land the bank can occlude', () => {
    const rim = sampleDisc(POND.radius).filter(
      (c) => Math.hypot(c.x - POND.centreX, c.z - POND.centreZ) > POND.radius - 1,
    );
    expect(rim.every((c) => c.y > POND.surfaceY)).toBe(true);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
pnpm vitest run tests/presentation/waterPlacement.test.ts
```

Expected: FAIL — `Failed to resolve import "../../src/domain/hub/waterBody"`.

- [ ] **Step 3: Write the module**

Create `src/domain/hub/waterBody.ts`:

```typescript
/**
 * A body of standing water, as plain data. Engine-agnostic on purpose: `water.ts` builds the mesh
 * from this, and P4's shallow-water feedback (splashes, slowdown) will read the same shape rather
 * than re-deriving the pond's geometry from the mesh.
 */
export interface WaterBody {
  readonly centreX: number;
  readonly centreZ: number;
  /**
   * Radius of the *rendered surface*, deliberately larger than the flooded contour (~7.7 units).
   * Where terrain rises above `surfaceY` it occludes the water, so an oversized disc disappears
   * into the bank, while an undersized one would leave a visible gap at the shoreline.
   */
  readonly radius: number;
  readonly surfaceY: number;
}

/**
 * The hub's pond. Centre and radius come from flood-filling the basin at the surface height, not from
 * eyeballing the lowest point: at y = −0.95 the connected flooded region is 238 cells spanning
 * x −23..−9, with its centroid at (−15.3, −4.8). Centring on the lowest *point* instead put the disc
 * 2–3 units off, leaving a fifth of its rim underwater — a visible gap at the shoreline.
 *
 * Radius 12 is the smallest that keeps the whole rim on dry land, which is what lets the bank occlude
 * it. 0.58 m at the deepest — knee-height on the ~1.9-unit knight — so it wades.
 *
 * ~16 units from spawn, and 38 from the plaza in `landmark.ts`, so the two destinations do not crowd.
 */
export const POND: WaterBody = {
  centreX: -15,
  centreZ: -5,
  radius: 12,
  surfaceY: -0.95,
};
```

- [ ] **Step 4: Run the test again**

```bash
pnpm vitest run tests/presentation/waterPlacement.test.ts
```

Expected: PASS, 4 tests. Measured values at these constants: centre y −1.507, 238 submerged cells, depth 0.584, 0 of 64 rim cells wet.

If "floods a pool broad enough" fails, the basin is shallower than measured — do **not** raise `surfaceY` past `-0.53` to force it, because that breaks the wade test. If "has a shore" fails, the disc is too small for the basin at that centre — grow `radius`, do not shrink the test. Report either mismatch rather than tuning past it.

- [ ] **Step 5: Full suite and typecheck**

```bash
pnpm test
npx tsc --noEmit
```

Expected: 128 tests passing (124 existing + 4 new), tsc silent.

- [ ] **Step 6: Commit**

```bash
git add src/domain/hub/waterBody.ts tests/presentation/waterPlacement.test.ts
git commit -m "feat(p3): describe the pond, and test that it sits in a real basin"
```

---

### Task 2: The pond surface

**Files:**
- Create: `src/presentation/babylon/water.ts`
- Modify: `src/presentation/babylon/hubScene.ts` (import, and one call after `createGroundScatter`)

**Interfaces:**
- Consumes: `POND` and `WaterBody` from `src/domain/hub/waterBody`.
- Produces: `export function createWater(scene: Scene): void`. Task 3 does not depend on it; Task 4 verifies it.

- [ ] **Step 1: Write the module**

Create `src/presentation/babylon/water.ts`:

```typescript
import type { Scene } from '@babylonjs/core/scene';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { CreateDisc } from '@babylonjs/core/Meshes/Builders/discBuilder';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { FresnelParameters } from '@babylonjs/core/Materials/fresnelParameters';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
// Side-effect: registers the StandardMaterial shader. Required with tree-shaken deep imports.
import '@babylonjs/core/Materials/standardMaterial';
import { POND, type WaterBody } from '../../domain/hub/waterBody';

/** Edge length of the square ripple texture. Small on purpose — it is tiled and blurred by motion. */
const RIPPLE_TEXTURE_SIZE = 256;
/** How many times the ripple texture repeats across the pond. */
const RIPPLE_TILING = 6;
/** Surface scroll, world units per second, applied diagonally. */
const SCROLL_U_PER_SEC = 0.015;
const SCROLL_V_PER_SEC = 0.009;
/** Base transparency. `opacityFresnelParameters` varies it by view angle around this. */
const WATER_ALPHA = 0.72;

/**
 * Ripple normals, painted procedurally so no binary asset is added — the same technique as the sky
 * gradient in `environment.ts` and the grass cutouts in `scatter.ts`.
 *
 * Two sine frequencies are summed into the ONE texture rather than scrolled as two layers, because
 * `StandardMaterial` has a single `bumpTexture` slot: claiming two scrolling layers would be a claim
 * the material cannot deliver. The result is encoded as a tangent-space normal map, where flat is
 * (0.5, 0.5, 1.0) — the blue channel stays high because these are shallow ripples, not deep waves.
 */
function rippleNormalTexture(scene: Scene): DynamicTexture {
  const size = RIPPLE_TEXTURE_SIZE;
  const tex = new DynamicTexture('waterRipple', { width: size, height: size }, scene, false);
  const ctx = tex.getContext();
  const image = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * Math.PI * 2;
      const v = (y / size) * Math.PI * 2;
      // Two frequencies, the second finer and rotated, so the surface does not read as one wave train.
      const dx = 0.6 * Math.cos(u * 2) + 0.4 * Math.cos(u * 5 + v * 3);
      const dy = 0.6 * Math.cos(v * 2) + 0.4 * Math.cos(v * 5 - u * 3);
      const i = (y * size + x) * 4;
      image.data[i] = 128 + dx * 40;
      image.data[i + 1] = 128 + dy * 40;
      image.data[i + 2] = 255;
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  tex.update();
  tex.uScale = RIPPLE_TILING;
  tex.vScale = RIPPLE_TILING;
  return tex;
}

/**
 * Builds the pond: a disc at the water surface with animated ripple normals.
 *
 * `StandardMaterial` in gamma space, with `fogEnabled` left on, is the load-bearing choice and is a
 * direct consequence of P2. Every surface fog reaches in this hub is a StandardMaterial; the trees
 * bleached to grey because they were the one PBR surface, since PBR blends fog in linear space where
 * a small blend toward a near-white fog colour multiplies a dark pixel several-fold (P2 spec §11).
 *
 * The water carries **no collider**. The terrain underneath is already walkable, so wading is what
 * happens when nothing is added — blocking would be the option that costs work.
 */
export function createWater(scene: Scene, body: WaterBody = POND): void {
  const surface = CreateDisc('water', { radius: body.radius, tessellation: 64 }, scene);
  // CreateDisc builds in the XY plane facing +Z; rotate it flat, normal up.
  surface.rotation.x = Math.PI / 2;
  surface.position.set(body.centreX, body.surfaceY, body.centreZ);
  surface.isPickable = false;

  const mat = new StandardMaterial('waterMat', scene);
  mat.diffuseColor = new Color3(0.16, 0.34, 0.42);
  // Water is the one surface here that should carry a highlight — unlike the trees, where specular
  // is zeroed because PBR roughness 0.5 never produced one.
  mat.specularColor = new Color3(0.55, 0.6, 0.6);
  mat.specularPower = 96;
  mat.ambientColor = new Color3(1, 1, 1); // pick up the hemispheric ambient, as the rocks do
  mat.alpha = WATER_ALPHA;
  // Held as a DynamicTexture, NOT read back off `mat.bumpTexture` — that is typed
  // `Nullable<BaseTexture>`, and `uOffset` lives on `Texture`, so the scroll below would not compile.
  const ripple = rippleNormalTexture(scene);
  mat.bumpTexture = ripple;
  // Edge-versus-centre opacity: looking straight down the water is clearer, at a grazing angle it
  // turns opaque. The largest "reads as water" gain available without a render target.
  mat.opacityFresnelParameters = new FresnelParameters();
  mat.opacityFresnelParameters.leftColor = Color3.White();
  mat.opacityFresnelParameters.rightColor = new Color3(0.35, 0.35, 0.35);
  mat.opacityFresnelParameters.power = 2;
  mat.backFaceCulling = false; // the camera can dip below the surface at the bank
  surface.material = mat;

  scene.onBeforeRenderObservable.add(() => {
    const dt = scene.getEngine().getDeltaTime() / 1000;
    ripple.uOffset += SCROLL_U_PER_SEC * dt;
    ripple.vOffset += SCROLL_V_PER_SEC * dt;
  });
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: silent. If `FresnelParameters` or `CreateDisc` cannot be resolved, the import path is wrong — search `node_modules/@babylonjs/core` for the file rather than guessing.

- [ ] **Step 3: Wire it into the scene**

In `src/presentation/babylon/hubScene.ts`, add to the local import block (below the `@babylonjs` imports, above nothing — locals go last):

```typescript
import { createWater } from './water';
```

and call it immediately after `createGroundScatter(scene);`:

```typescript
  createTerrain(scene);
  createGroundScatter(scene);
  createWater(scene);
```

- [ ] **Step 4: Typecheck and run the suite**

```bash
npx tsc --noEmit
pnpm test
```

Expected: tsc silent, 128 tests passing.

- [ ] **Step 5: Look at it**

Start the dev server with the Browser pane (`preview_start` with `{name: "dev"}`), then in the page:

```javascript
(() => {
  const { scene } = window.hub;
  const w = scene.meshes.find((m) => m.name === 'water');
  return {
    exists: !!w,
    position: w?.position.asArray(),
    materialClass: w?.material?.getClassName(),
    fogEnabled: w?.material?.fogEnabled,
    hasBump: !!w?.material?.bumpTexture,
    alpha: w?.material?.alpha,
  };
})()
```

Expected: `materialClass: "StandardMaterial"`, `fogEnabled: true`, `hasBump: true`, position `[-13, -0.95, -7]`.

Then take a screenshot from the bank. Drive frames manually and call `engine.restoreDefaultFramebuffer()` before any `readPixels` — otherwise you read a post-process render target and get a flat colour that looks like a broken scene (HANDOFF §7).

- [ ] **Step 6: Commit**

```bash
git add src/presentation/babylon/water.ts src/presentation/babylon/hubScene.ts
git commit -m "feat(p3): a wadeable pond with scrolling ripple normals"
```

---

### Task 3: The stone plaza

**Files:**
- Create: `src/presentation/babylon/landmark.ts`
- Modify: `src/presentation/babylon/hubScene.ts` (import, and one call after `createWater`)

**Interfaces:**
- Consumes: `terrainHeight` from `./terrainHeight`.
- Produces: `export function createLandmark(scene: Scene, shadowGenerator?: ShadowGenerator): void`.

`hubScene` already holds `shadowGenerator` from `createEnvironment` and passes it to `loadTrees`; pass it here the same way.

- [ ] **Step 1: Write the module**

Create `src/presentation/babylon/landmark.ts`:

```typescript
import type { Scene } from '@babylonjs/core/scene';
import type { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import { PhysicsAggregate } from '@babylonjs/core/Physics/v2/physicsAggregate';
import { PhysicsShapeType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
// Side-effect: registers the StandardMaterial shader. Required with tree-shaken deep imports.
import '@babylonjs/core/Materials/standardMaterial';
import { terrainHeight } from './terrainHeight';

/**
 * Where the colonnade stands. Chosen by sampling `terrainHeight`: of the sites flat enough for a
 * radius-8 ring, this is the only one above y = 0 (1.17, with 1.26 m of spread across the ring and
 * 6.1° of slope), and it is 40 units from the pond so the two destinations do not crowd each other.
 *
 * Worth knowing before moving it: in this height field the flattest ground IS the lowest ground,
 * because the flat places are basin floors. The high ground runs 16–17° across a ring this wide.
 */
const PLAZA_X = -6;
const PLAZA_Z = 32;
const RING_RADIUS = 8;
/** Eight, so each pillar can later carry one mode-entrance with room to spare for three modes. */
const PILLAR_COUNT = 8;
const PILLAR_RADIUS = 0.45;
/** Height of the pillar crowns above the plaza centre's ground level. */
const CROWN_HEIGHT = 4.2;
const PEDESTAL_RADIUS = 1.6;
const PEDESTAL_HEIGHT = 0.55;

/** Reuses `scatter.ts`'s rock colour so the structure lands inside P2's grade rather than beside it. */
function stoneMaterial(scene: Scene): StandardMaterial {
  const mat = new StandardMaterial('stoneMat', scene);
  mat.diffuseColor = new Color3(0.55, 0.54, 0.52);
  mat.specularColor = new Color3(0.05, 0.05, 0.05);
  mat.ambientColor = new Color3(1, 1, 1); // pick up the hemispheric ambient so shaded faces aren't black
  return mat;
}

/**
 * A ring of stone pillars around a central pedestal — the hub's destination, and the site where NPCs
 * and the future mode-entrances attach. The shape is chosen for what plugs into it later: a colonnade
 * is inherently a *set* of positions, where an arch would have been one entrance for three modes.
 *
 * Each pillar seats on the terrain under its own base, like the trees, but they all reach the same
 * crown height — so the ring reads level across 6° of slope while the bases follow the ground.
 *
 * There is deliberately no plinth. One was designed to absorb the ring's 1.26 m spread and dropped:
 * a 1.3 m platform needs steps or it is an invisible wall, and seating the pillars individually
 * removes the problem instead of solving it.
 */
export function createLandmark(scene: Scene, shadowGenerator?: ShadowGenerator): void {
  const mat = stoneMaterial(scene);
  const crownY = terrainHeight(PLAZA_X, PLAZA_Z) + CROWN_HEIGHT;

  for (let i = 0; i < PILLAR_COUNT; i++) {
    const angle = (i / PILLAR_COUNT) * Math.PI * 2;
    const x = PLAZA_X + RING_RADIUS * Math.cos(angle);
    const z = PLAZA_Z + RING_RADIUS * Math.sin(angle);
    const baseY = terrainHeight(x, z);
    // Sink the base slightly so no pillar hovers over a dip between terrain samples.
    const height = crownY - baseY + 0.3;
    const pillar = CreateCylinder(
      `plazaPillar_${i}`,
      { diameter: PILLAR_RADIUS * 2, height, tessellation: 12 },
      scene,
    );
    pillar.position.set(x, baseY - 0.3 + height / 2, z);
    pillar.material = mat;
    pillar.isPickable = false;
    new PhysicsAggregate(pillar, PhysicsShapeType.CYLINDER, { mass: 0 }, scene);
    if (shadowGenerator) shadowGenerator.addShadowCaster(pillar);
  }

  const pedestalY = terrainHeight(PLAZA_X, PLAZA_Z);
  const pedestal = CreateCylinder(
    'plazaPedestal',
    { diameter: PEDESTAL_RADIUS * 2, height: PEDESTAL_HEIGHT, tessellation: 24 },
    scene,
  );
  pedestal.position.set(PLAZA_X, pedestalY + PEDESTAL_HEIGHT / 2, PLAZA_Z);
  pedestal.material = mat;
  pedestal.isPickable = false;
  new PhysicsAggregate(pedestal, PhysicsShapeType.CYLINDER, { mass: 0 }, scene);
  if (shadowGenerator) shadowGenerator.addShadowCaster(pedestal);
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: silent.

- [ ] **Step 3: Wire it into the scene**

In `src/presentation/babylon/hubScene.ts`, add to the local imports:

```typescript
import { createLandmark } from './landmark';
```

and call it after `createWater(scene);`:

```typescript
  createWater(scene);
  createLandmark(scene, shadowGenerator);
```

- [ ] **Step 4: Typecheck and run the suite**

```bash
npx tsc --noEmit
pnpm test
```

Expected: tsc silent, 128 tests passing.

- [ ] **Step 5: Check it in the browser**

```javascript
(() => {
  const { scene } = window.hub;
  const pillars = scene.meshes.filter((m) => m.name.startsWith('plazaPillar_'));
  const pedestal = scene.meshes.find((m) => m.name === 'plazaPedestal');
  const crowns = pillars.map((p) => +(p.position.y + p.getBoundingInfo().boundingBox.extendSize.y).toFixed(3));
  return {
    pillarCount: pillars.length,
    crownSpread: +(Math.max(...crowns) - Math.min(...crowns)).toFixed(3),
    baseSpread: +(Math.max(...pillars.map((p) => p.position.y)) - Math.min(...pillars.map((p) => p.position.y))).toFixed(3),
    pedestalAt: pedestal?.position.asArray().map((v) => +v.toFixed(2)),
    materialClass: pillars[0]?.material?.getClassName(),
  };
})()
```

Expected: `pillarCount: 8`, `crownSpread` under 0.01 (they share a crown), `baseSpread` around 1.2 (the bases follow the ground), `materialClass: "StandardMaterial"`.

A `crownSpread` near 1.2 and a `baseSpread` near 0 means the height calculation was inverted.

- [ ] **Step 6: Commit**

```bash
git add src/presentation/babylon/landmark.ts src/presentation/babylon/hubScene.ts
git commit -m "feat(p3): a stone colonnade as the hub's destination"
```

---

### Task 4: Definition of done — measure it, don't assert it

**Files:**
- Modify: `docs/superpowers/specs/2026-08-24-water-landmarks-design.md` (append a measured DoD section)
- Modify: `docs/HANDOFF.md` (§4 gains P3; §5 drops it)

No source changes. If this task finds a defect, fix it in the module it belongs to and note the fix here.

- [ ] **Step 1: Confirm the water participates in fog**

The same off/on comparison used on the trees. In the page, with the camera held on the pond from ~25 units:

```javascript
(() => {
  const { engine, scene } = window.hub;
  const gl = (c => c.getContext('webgl2') || c.getContext('webgl'))(engine.getRenderingCanvas());
  const shot = () => { for (let i = 0; i < 8; i++) { engine.beginFrame(); scene.render(); engine.endFrame(); } engine.restoreDefaultFramebuffer(); };
  const patch = (fx, fyTop, r = 5) => {
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, n = 2 * r + 1, b = new Uint8Array(n * n * 4);
    gl.readPixels(Math.floor(w * fx) - r, Math.floor(h * (1 - fyTop)) - r, n, n, gl.RGBA, gl.UNSIGNED_BYTE, b);
    let R = 0, G = 0, B = 0;
    for (let i = 0; i < n * n; i++) { R += b[i * 4]; G += b[i * 4 + 1]; B += b[i * 4 + 2]; }
    return [R, G, B].map((v) => Math.round(v / (n * n)));
  };
  const fm = scene.fogMode;
  scene.fogMode = 0; shot(); const off = patch(0.5, 0.55);
  scene.fogMode = 2; shot(); const on = patch(0.5, 0.55);
  scene.fogMode = fm; shot();
  return { off: off.join(','), on: on.join(','), moved: on.join(',') !== off.join(',') };
})()
```

Expected: `moved: true`. If false, the water material has `fogEnabled` off or the sample point is not on the water.

- [ ] **Step 2: Exercise the collision, do not assume it**

Walk the character into a pillar and confirm it stops; stand on the pedestal; walk into the pond and confirm the character keeps moving on the terrain below. Record what happened in one line each. "Colliders were created" is not evidence that they work.

- [ ] **Step 3: Whole-frame clipping stats at three viewpoints**

Pond from the bank, plaza from spawn distance, and a wide shot holding both. For each, report the fraction of the frame at pure black and the fraction blown, using the whole frame — not sampled points. P2's post-fix baseline was 0 % / 0 % / 0.179 % crushed with no blown pixels anywhere; new geometry should not introduce either.

- [ ] **Step 4: fps, with the method that works**

Round-robin across configs with medians, all shader variants pre-compiled first, `gl.finish()` between samples. Compare P3 against P3-with-the-two-new-builders-skipped.

Do **not** measure each config in its own block — that method produced a 44 % spread on identical configs and reported impossible orderings last phase (P2 spec §12).

- [ ] **Step 5: Record the measurements in the spec**

Append a `## 9. Definition of done — measured` section to the design doc with the numbers from Steps 1–4, in the shape P2 §12 uses. State plainly which DoD criteria hold and which do not; a criterion that was not met is recorded as not met, not folded into a summary.

- [ ] **Step 6: Update HANDOFF**

`§4` gains a P3 bullet next to the other completed phases. `§5` drops P3 from the "what's next" list and renumbers, leaving the toon item and P4. Record any gotcha this phase produced in `§7`.

- [ ] **Step 7: Commit**

```bash
git add docs/
git commit -m "docs(p3): record the measured definition of done"
```

- [ ] **Step 8: Push and open the PR**

```bash
git push -u origin claude/p3-water-landmarks
"/c/Program Files/GitHub CLI/gh.exe" pr create --base main --head claude/p3-water-landmarks \
  --title "feat(p3): water & landmarks" --body-file pr-body.md
```

Write `pr-body.md` first, in a scratch directory rather than the repo. It states what shipped, the
Step 1–4 measurements as a table, and anything deferred or not met. Then hand back and stop: the repo
owner merges, and has done for every PR in this project.

---

## Notes for whoever executes this

**Verification traps, all of which cost real time last phase:**

- `readPixels` after `endFrame()` can return a post-process render target rather than the canvas. It comes back a flat uniform colour and looks exactly like a broken scene. Call `engine.restoreDefaultFramebuffer()` first.
- With the preview pane hidden, `requestAnimationFrame` never fires. Drive frames manually with `beginFrame`/`render`/`endFrame`; awaiting a render observable will simply hang.
- Right after a reload or a resize, the first render can come back blank. Warm up in one call, measure in the next.
- Judge image quality on whole frames, not sampled points. An emissive floor looked like a no-op on sampled lit pixels and turned out to be the difference between 10.5 % and 0.2 % of the frame at pure black.
