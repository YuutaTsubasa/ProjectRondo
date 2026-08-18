# Hub Terrain & Collision (P1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat hub ground with central-flat / edge-hill rolling terrain the player rides, and add solid collision for the terrain, trees, and the large scatter rocks.

**Architecture:** One pure, seeded `terrainHeight(x,z)` (babylon-free, unit-tested) is the single source of truth: a new `terrain.ts` displaces a subdivided ground by it and attaches a static MESH collider; `scatter.ts` and `trees.ts` sample it to sit on the surface. Collision is added as trunk colliders on trees and render/physics-decoupled invisible static spheres on the largest rocks (thin-instance visuals stay one draw call). Distant silhouette mountains give depth.

**Tech Stack:** TypeScript, `@babylonjs/core` (mesh builders, VertexData, Physics v2 / Havok), Vitest (pure function), in-browser verification via the preview tools.

**Spec:** `docs/superpowers/specs/2026-08-18-hub-terrain-collision-design.md`

---

## File Structure

- **Create** `src/presentation/babylon/terrainHeight.ts` — pure, no babylon imports: `terrainHeight(x,z)` + seeded value noise + radial falloff + exported constants (`FIELD`, `FLAT_RADIUS`, `EDGE_RADIUS`, `AMPLITUDE`).
- **Create** `tests/presentation/terrainHeight.test.ts` — Vitest for the pure function.
- **Create** `src/presentation/babylon/terrain.ts` — babylon: `createTerrain(scene)` (displaced ground + grass material + MESH collider + boundary walls + distant scenery). Imports `terrainHeight`.
- **Delete** `src/presentation/babylon/ground.ts` — its material + `createBoundaries` fold into `terrain.ts`; the flat-ground builder is retired.
- **Modify** `src/presentation/babylon/hubScene.ts` — call `createTerrain` instead of `createGround`.
- **Modify** `src/presentation/babylon/scatter.ts` — sample `terrainHeight` for each instance's Y; emit invisible static sphere colliders for large rocks.
- **Modify** `src/presentation/babylon/trees.ts` — sample `terrainHeight` for tree Y; add a trunk collider per tree.

---

## Task 1: Pure `terrainHeight` (TDD)

**Files:**
- Create: `src/presentation/babylon/terrainHeight.ts`
- Test: `tests/presentation/terrainHeight.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/presentation/terrainHeight.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  terrainHeight,
  AMPLITUDE,
  FLAT_RADIUS,
  EDGE_RADIUS,
} from '../../src/presentation/babylon/terrainHeight';

describe('terrainHeight', () => {
  it('is flat (exactly 0) at the centre and everywhere inside the flat radius', () => {
    expect(terrainHeight(0, 0)).toBe(0);
    for (let x = -FLAT_RADIUS; x <= FLAT_RADIUS; x += 1) {
      for (let z = -FLAT_RADIUS; z <= FLAT_RADIUS; z += 1) {
        if (Math.hypot(x, z) <= FLAT_RADIUS) expect(terrainHeight(x, z)).toBe(0);
      }
    }
  });

  it('is deterministic — same input always yields the same height', () => {
    expect(terrainHeight(12.3, -7.1)).toBe(terrainHeight(12.3, -7.1));
    expect(terrainHeight(20, 20)).toBe(terrainHeight(20, 20));
  });

  it('stays within [0, AMPLITUDE] across the whole field', () => {
    for (let x = -EDGE_RADIUS; x <= EDGE_RADIUS; x += 1) {
      for (let z = -EDGE_RADIUS; z <= EDGE_RADIUS; z += 1) {
        const h = terrainHeight(x, z);
        expect(h).toBeGreaterThanOrEqual(0);
        expect(h).toBeLessThanOrEqual(AMPLITUDE);
      }
    }
  });

  it('raises real hills toward the edges (global max clearly above the flat centre)', () => {
    let max = 0;
    for (let x = -EDGE_RADIUS; x <= EDGE_RADIUS; x += 1) {
      for (let z = -EDGE_RADIUS; z <= EDGE_RADIUS; z += 1) {
        max = Math.max(max, terrainHeight(x, z));
      }
    }
    expect(max).toBeGreaterThan(2);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run tests/presentation/terrainHeight.test.ts`
Expected: FAIL — cannot resolve `../../src/presentation/babylon/terrainHeight`.

- [ ] **Step 3: Write the implementation**

Create `src/presentation/babylon/terrainHeight.ts`:

```ts
// Pure procedural terrain height — NO babylon imports, so it unit-tests in the node env and
// scatter/trees can sample it to sit on the surface. Deterministic (seeded), reproducible.

export const FIELD = 50; // terrain spans FIELD x FIELD, centred on the origin
export const FLAT_RADIUS = 10; // near-flat play area within this radius of the centre
export const EDGE_RADIUS = 24; // hills reach full amplitude by here (inside the ±25 walls)
export const AMPLITUDE = 5; // maximum hill height, world units
const NOISE_FREQ = 0.12; // lattice cells per world unit (smaller = broader, gentler hills)
const SEED = 1337;

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Deterministic hashed value in [0,1) at integer lattice point (ix, iz). */
function latticeValue(ix: number, iz: number): number {
  let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + SEED) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise in [0,1): bilinear blend of four lattice values, smoothstep-eased. */
function valueNoise(x: number, z: number): number {
  const gx = x * NOISE_FREQ;
  const gz = z * NOISE_FREQ;
  const x0 = Math.floor(gx);
  const z0 = Math.floor(gz);
  const fx = smoothstep(gx - x0);
  const fz = smoothstep(gz - z0);
  const v00 = latticeValue(x0, z0);
  const v10 = latticeValue(x0 + 1, z0);
  const v01 = latticeValue(x0, z0 + 1);
  const v11 = latticeValue(x0 + 1, z0 + 1);
  const a = v00 + (v10 - v00) * fx;
  const b = v01 + (v11 - v01) * fx;
  return a + (b - a) * fz;
}

/** 0 inside FLAT_RADIUS, easing to 1 by EDGE_RADIUS — flat centre, raised rim. */
function falloff(r: number): number {
  if (r <= FLAT_RADIUS) return 0;
  if (r >= EDGE_RADIUS) return 1;
  return smoothstep((r - FLAT_RADIUS) / (EDGE_RADIUS - FLAT_RADIUS));
}

/** Ground height at world (x, z): flat centre, hills toward the edges. Pure & deterministic. */
export function terrainHeight(x: number, z: number): number {
  return falloff(Math.hypot(x, z)) * AMPLITUDE * valueNoise(x, z);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run tests/presentation/terrainHeight.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck & commit**

```bash
pnpm exec tsc --noEmit
git add src/presentation/babylon/terrainHeight.ts tests/presentation/terrainHeight.test.ts
git commit -m "feat(terrain): pure seeded terrainHeight (flat centre, edge hills)"
```

---

## Task 2: `terrain.ts` — displaced ground + MESH collider; retire `ground.ts`

**Files:**
- Create: `src/presentation/babylon/terrain.ts`
- Modify: `src/presentation/babylon/hubScene.ts:20,51`
- Delete: `src/presentation/babylon/ground.ts`

- [ ] **Step 1: Create `terrain.ts`**

```ts
import type { Scene } from '@babylonjs/core/scene';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import '@babylonjs/core/Materials/standardMaterial'; // side-effect: StandardMaterial shader
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { PhysicsAggregate } from '@babylonjs/core/Physics/v2/physicsAggregate';
import { PhysicsShapeType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin';
import { FIELD, terrainHeight } from './terrainHeight';

const HALF = FIELD / 2;
const SUBDIVISIONS = 120; // enough segments to read the hills smoothly
const GRASS_TILING = 6;

/** Four thin invisible static walls at the field rim (belt-and-suspenders past the edge hills). */
function createBoundaries(scene: Scene): void {
  const t = 1;
  const h = 6;
  const walls: [string, number, number, number, number][] = [
    ['n', FIELD + 2 * t, t, 0, -HALF - t / 2],
    ['s', FIELD + 2 * t, t, 0, HALF + t / 2],
    ['w', t, FIELD, -HALF - t / 2, 0],
    ['e', t, FIELD, HALF + t / 2, 0],
  ];
  for (const [name, w, d, x, z] of walls) {
    const wall = CreateBox(`bound_${name}`, { width: w, height: h, depth: d }, scene);
    wall.position.set(x, h / 2, z);
    wall.isVisible = false;
    wall.isPickable = false;
    new PhysicsAggregate(wall, PhysicsShapeType.BOX, { mass: 0 }, scene);
  }
}

/** A ring of low-poly silhouette mountains beyond the walls — static, no collider — so the world
 *  reads as bigger than the field and gives P2's fog something to fade into. */
function createDistantScenery(scene: Scene): void {
  const mat = new StandardMaterial('mountainMat', scene);
  mat.diffuseColor = new Color3(0.42, 0.5, 0.55); // hazy blue-grey
  mat.specularColor = new Color3(0, 0, 0);
  const RING_RADIUS = 70;
  const COUNT = 28;
  for (let i = 0; i < COUNT; i++) {
    const a = (i / COUNT) * Math.PI * 2;
    const height = 16 + (i % 5) * 4; // deterministic variety
    const m = CreateCylinder(`mtn_${i}`, { diameterTop: 0, diameterBottom: height * 0.9, height, tessellation: 5 }, scene);
    m.position.set(Math.cos(a) * RING_RADIUS, height / 2 - 4, Math.sin(a) * RING_RADIUS);
    m.material = mat;
    m.isPickable = false;
    m.alwaysSelectAsActiveMesh = true;
  }
}

/** Builds the rolling grass terrain: a subdivided ground displaced by terrainHeight with a static
 *  MESH collider (so the player rides it), the rim walls, and distant scenery. Returns the mesh. */
export function createTerrain(scene: Scene): AbstractMesh {
  const terrain = CreateGround('terrain', { width: FIELD, height: FIELD, subdivisions: SUBDIVISIONS }, scene);

  const pos = terrain.getVerticesData(VertexBuffer.PositionKind)!;
  for (let i = 0; i < pos.length; i += 3) pos[i + 1] = terrainHeight(pos[i], pos[i + 2]);
  terrain.updateVerticesData(VertexBuffer.PositionKind, pos);
  terrain.createNormals(false); // recompute lighting normals for the new relief

  const mat = new StandardMaterial('groundMat', scene);
  const grass = new Texture('/textures/grass.jpg', scene);
  grass.uScale = GRASS_TILING;
  grass.vScale = GRASS_TILING;
  mat.diffuseTexture = grass;
  mat.specularColor = new Color3(0.05, 0.05, 0.05);
  terrain.material = mat;
  terrain.receiveShadows = true;

  new PhysicsAggregate(terrain, PhysicsShapeType.MESH, { mass: 0 }, scene);
  createBoundaries(scene);
  createDistantScenery(scene);
  return terrain;
}
```

- [ ] **Step 2: Wire it into `hubScene.ts`**

Replace the import (line 20) and the call (line 51).

Import: change `import { createGround } from './ground';` to:

```ts
import { createTerrain } from './terrain';
```

Call: change `createGround(scene);` to:

```ts
createTerrain(scene);
```

- [ ] **Step 3: Delete the retired flat-ground module**

```bash
git rm src/presentation/babylon/ground.ts
```

- [ ] **Step 4: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: 0 errors (nothing else imports `ground.ts`).

- [ ] **Step 5: Verify in the browser**

Start the preview (preview_start name `dev`), open the scene, then (the AVG intro may be up — advance/skip it):

- `read_console_messages` (onlyErrors) → no errors; no "No Physics Engine available".
- Pump real frames and check the terrain relief + that the player rests on the ground, via `javascript_tool`:

```js
(() => {
  const { scene } = window.hub; const engine = scene.getEngine();
  for (let i=0;i<6;i++){ engine.beginFrame(); scene.render(); engine.endFrame(); }
  const t = scene.getMeshByName('terrain');
  const pos = t.getVerticesData('position');
  let min=Infinity, max=-Infinity;
  for (let i=1;i<pos.length;i+=3){ min=Math.min(min,pos[i]); max=Math.max(max,pos[i]); }
  const p = window.hub.player.root.position;
  return JSON.stringify({ terrainYmin:+min.toFixed(2), terrainYmax:+max.toFixed(2), playerY:+p.y.toFixed(2) });
})()
```

Expected: `terrainYmin` ≈ 0, `terrainYmax` ≈ 3–5 (hills exist); `playerY` ≈ CAPSULE_HEIGHT/2 (~1.0), i.e. the player rests at the flat centre, not falling or floating.
- `screenshot` → visibly rolling ground with grass draped over it; distant mountains on the horizon; terrain lit correctly (NOT dark — if the ground is black, normals came out inward: add after `createNormals`, flip them like the rock fix in `scatter.ts`, i.e. negate the normal buffer when Σ(normal·up) < 0).

- [ ] **Step 6: Commit**

```bash
git add src/presentation/babylon/terrain.ts src/presentation/babylon/hubScene.ts
git commit -m "feat(terrain): rolling terrain mesh + MESH collider + distant mountains; retire flat ground"
```

---

## Task 3: Re-seat scatter onto the terrain

**Files:**
- Modify: `src/presentation/babylon/scatter.ts` (imports; `scatterMatrices`)

- [ ] **Step 1: Import the height sampler**

Add near the other imports in `scatter.ts`:

```ts
import { terrainHeight } from './terrainHeight';
```

- [ ] **Step 2: Sample the height when placing each instance**

In `scatterMatrices`, replace the single `pos.set(...)` line:

```ts
    pos.set((rand() * 2 - 1) * ext, o.y, (rand() * 2 - 1) * ext);
```

with (draw X and Z first, in the same order, then look up the ground height):

```ts
    const px = (rand() * 2 - 1) * ext;
    const pz = (rand() * 2 - 1) * ext;
    pos.set(px, terrainHeight(px, pz) + o.y, pz);
```

- [ ] **Step 3: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 4: Verify in the browser**

Reload (re-read `window.hub` after reload — it goes stale), advance the AVG intro, pump frames, `screenshot`. Expected: grass/flowers/rocks/bushes sit ON the sloped ground — none floating above a hill or buried in it. Spot-check on a hillside near an edge.

- [ ] **Step 5: Commit**

```bash
git add src/presentation/babylon/scatter.ts
git commit -m "feat(terrain): seat ground scatter on the terrain surface"
```

---

## Task 4: Re-seat trees + trunk colliders

**Files:**
- Modify: `src/presentation/babylon/trees.ts` (imports; the `SPOTS.forEach` body)

- [ ] **Step 1: Add imports**

Add to the imports in `trees.ts`:

```ts
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import { PhysicsAggregate } from '@babylonjs/core/Physics/v2/physicsAggregate';
import { PhysicsShapeType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin';
import { terrainHeight } from './terrainHeight';
```

- [ ] **Step 2: Add trunk-size constants**

Below `const BASE_SCALE = 6;` add:

```ts
/** Trunk collider: a thin invisible cylinder so the player stops at the trunk, not the canopy. */
const TRUNK_RADIUS = 0.5;
const TRUNK_HEIGHT = 4;
```

- [ ] **Step 3: Seat each tree on the terrain and add its trunk collider**

In the `SPOTS.forEach(([x, z, yaw, scale], i) => { ... })` body, replace:

```ts
    const root = rootNodes[0] as TransformNode;
    root.position.set(x, 0, z);
```

with:

```ts
    const root = rootNodes[0] as TransformNode;
    const y = terrainHeight(x, z);
    root.position.set(x, y, z);

    const trunk = CreateCylinder(`tree_${i}_trunk`, { diameter: TRUNK_RADIUS * 2, height: TRUNK_HEIGHT }, scene);
    trunk.position.set(x, y + TRUNK_HEIGHT / 2, z);
    trunk.isVisible = false;
    trunk.isPickable = false;
    new PhysicsAggregate(trunk, PhysicsShapeType.CYLINDER, { mass: 0 }, scene);
```

- [ ] **Step 4: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 5: Verify in the browser**

Reload, re-read `window.hub`, advance the AVG intro. First confirm every tree has a trunk collider seated on the terrain:

```js
(() => {
  const { scene } = window.hub;
  const trunks = scene.meshes.filter(m => /_trunk$/.test(m.name));
  const sample = trunks.slice(0, 3).map(t => [+t.position.x.toFixed(1), +t.position.y.toFixed(2), +t.position.z.toFixed(1)]);
  return JSON.stringify({ trunkColliders: trunks.length, sample });
})()
```

Expected: `trunkColliders` = 10 (one per `SPOTS` entry); each `y` ≈ `terrainHeight(x,z) + TRUNK_HEIGHT/2`. Then, in the preview, walk the knight (WASD) straight into a trunk — the knight stops, doesn't pass through. Trees should also look planted (trunk meeting the surface, not floating/sunk). `screenshot` for proof.

- [ ] **Step 6: Commit**

```bash
git add src/presentation/babylon/trees.ts
git commit -m "feat(terrain): seat trees on terrain + trunk colliders (no more walking through trees)"
```

---

## Task 5: Large-rock colliders (render/physics decoupled)

**Files:**
- Modify: `src/presentation/babylon/scatter.ts` (`scatterMatrices` return shape; imports; `createGroundScatter`; new `addRockColliders`)

- [ ] **Step 1: Add imports**

Add to `scatter.ts` imports:

```ts
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import { PhysicsAggregate } from '@babylonjs/core/Physics/v2/physicsAggregate';
import { PhysicsShapeType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin';
```

- [ ] **Step 2: Have `scatterMatrices` also return per-instance placements**

Replace the `scatterMatrices` interface/signature and body so it returns the matrix buffer **and** the placements (needed to position colliders). Replace:

```ts
interface ScatterOpts { count: number; seed: number; y: number; minScale: number; maxScale: number; extent?: number; }

/** A 16×count matrix buffer of randomly placed/rotated/scaled instances on the field. */
function scatterMatrices(o: ScatterOpts): Float32Array {
  const rand = rng(o.seed);
  const ext = o.extent ?? EXTENT;
  const buf = new Float32Array(o.count * 16);
  const m = Matrix.Identity();
  const scale = new Vector3();
  const pos = new Vector3();
  for (let i = 0; i < o.count; i++) {
    const s = o.minScale + rand() * (o.maxScale - o.minScale);
    scale.set(s, s, s);
    const px = (rand() * 2 - 1) * ext;
    const pz = (rand() * 2 - 1) * ext;
    pos.set(px, terrainHeight(px, pz) + o.y, pz);
    Matrix.ComposeToRef(scale, Quaternion.RotationAxis(Vector3.UpReadOnly, rand() * Math.PI * 2), pos, m);
    m.copyToArray(buf, i * 16);
  }
  return buf;
}
```

with:

```ts
interface ScatterOpts { count: number; seed: number; y: number; minScale: number; maxScale: number; extent?: number; }
interface Placement { x: number; y: number; z: number; s: number; }
interface ScatterResult { buffer: Float32Array; placements: Placement[]; }

/** A 16×count matrix buffer of randomly placed/rotated/scaled instances on the terrain, plus the
 *  per-instance placements (so callers can attach colliders without decoding the matrix buffer). */
function scatterMatrices(o: ScatterOpts): ScatterResult {
  const rand = rng(o.seed);
  const ext = o.extent ?? EXTENT;
  const buffer = new Float32Array(o.count * 16);
  const placements: Placement[] = [];
  const m = Matrix.Identity();
  const scale = new Vector3();
  const pos = new Vector3();
  for (let i = 0; i < o.count; i++) {
    const s = o.minScale + rand() * (o.maxScale - o.minScale);
    scale.set(s, s, s);
    const px = (rand() * 2 - 1) * ext;
    const pz = (rand() * 2 - 1) * ext;
    const py = terrainHeight(px, pz) + o.y;
    pos.set(px, py, pz);
    Matrix.ComposeToRef(scale, Quaternion.RotationAxis(Vector3.UpReadOnly, rand() * Math.PI * 2), pos, m);
    m.copyToArray(buffer, i * 16);
    placements.push({ x: px, y: py, z: pz, s });
  }
  return { buffer, placements };
}
```

- [ ] **Step 3: Add the large-rock collider helper**

Add above `createGroundScatter`:

```ts
const ROCK_COLLIDER_MIN_SCALE = 0.75; // only the biggest rocks (top ~quarter) block the player
const ROCK_BASE_RADIUS = 0.4; // matches rockMesh's icosphere radius

/** Invisible static sphere colliders for the large rocks only. Rendering stays a single thin-instance
 *  draw call; these decoupled bodies just stop the player at the big rocks. */
function addRockColliders(scene: Scene, placements: Placement[]): void {
  for (const p of placements) {
    if (p.s < ROCK_COLLIDER_MIN_SCALE) continue;
    const proxy = CreateSphere('rockCollider', { diameter: 2 * ROCK_BASE_RADIUS * p.s, segments: 3 }, scene);
    proxy.position.set(p.x, p.y, p.z);
    proxy.isVisible = false;
    proxy.isPickable = false;
    new PhysicsAggregate(proxy, PhysicsShapeType.SPHERE, { mass: 0 }, scene);
  }
}
```

- [ ] **Step 4: Update `createGroundScatter` call sites for the new return shape**

Replace the body of `createGroundScatter` so each `thinInstanceSetBuffer` reads `.buffer`, and rocks also get colliders:

```ts
export function createGroundScatter(scene: Scene): void {
  const grass = crossCard(scene, 'grassTuft', 0.5, 3, grassMaterial(scene));
  grass.thinInstanceSetBuffer('matrix', scatterMatrices({ count: 4000, seed: 1, y: 0, minScale: 0.7, maxScale: 1.3 }).buffer, 16);

  const flowers = crossCard(scene, 'wildflower', 0.22, 2, flowerMaterial(scene));
  flowers.thinInstanceSetBuffer('matrix', scatterMatrices({ count: 400, seed: 2, y: 0, minScale: 0.7, maxScale: 1.2 }).buffer, 16);

  const rockScatter = scatterMatrices({ count: 50, seed: 3, y: -0.05, minScale: 0.3, maxScale: 0.9 });
  const rock = rockMesh(scene);
  rock.thinInstanceSetBuffer('matrix', rockScatter.buffer, 16);
  addRockColliders(scene, rockScatter.placements);

  const bush = bushMesh(scene);
  bush.thinInstanceSetBuffer('matrix', scatterMatrices({ count: 40, seed: 4, y: 0, minScale: 0.7, maxScale: 1.3, extent: EXTENT - 2 }).buffer, 16);
}
```

- [ ] **Step 5: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 6: Verify in the browser**

Reload, re-read `window.hub`. Confirm the collider count and that big rocks block while small ones don't:

```js
(() => {
  const { scene } = window.hub;
  const colliders = scene.meshes.filter(m => m.name === 'rockCollider');
  return JSON.stringify({ rockColliders: colliders.length });
})()
```

Expected: `rockColliders` ≈ 8–14 (the large ones), not 50. Then walk the knight into a large rock (blocked) and through a small rock / grass (passes). `screenshot` for proof.

- [ ] **Step 7: Commit**

```bash
git add src/presentation/babylon/scatter.ts
git commit -m "feat(terrain): invisible static colliders for large rocks (visuals stay one draw call)"
```

---

## Task 6: Verify & tune movement on slopes

**Files:**
- Possibly modify: `src/presentation/babylon/playerController.ts` (only if a symptom below appears)

No code change up front — this task *verifies* the flagged risk and applies a targeted fix only if a specific symptom shows.

- [ ] **Step 1: Verify riding the terrain (uphill & downhill)**

In the browser, drive the knight from the flat centre out toward an edge hill and back. Sample whether the capsule tracks the ground (real frames, since a hidden pane pauses rAF):

```js
(() => {
  const { scene, player } = window.hub; const engine = scene.getEngine();
  const samples = [];
  for (let f=0; f<180; f++) {
    engine.beginFrame(); scene.render(); engine.endFrame();
    if (f % 30 === 0) { const p = player.root.position; samples.push([+p.x.toFixed(1), +p.y.toFixed(2), +p.z.toFixed(1)]); }
  }
  return JSON.stringify(samples);
})()
```

(Combine with manual WASD in the preview for real traversal.) Expected while walking: `y` rises/falls smoothly with the hills; the capsule never sinks through the mesh (y far below the local `terrainHeight`) nor floats (y far above `terrainHeight + CAPSULE_HEIGHT/2`).

- [ ] **Step 2: Check for the two known symptoms**

Walk **downhill**: the knight should stay glued to the ground, not hop/stair-step down. Walk **uphill**: the knight should keep climbing steadily and stay grounded (idle/walk animation stays grounded; no stutter from the character flicking to "airborne").

- [ ] **Step 3 (only if uphill un-grounds): base `ascending` on jump intent, not the collide-and-slide residual**

Symptom: walking uphill makes the knight jitter or lose traction because the post-solve `velocity.y` is slightly positive on an upslope, and `playerController.ts` treats any `velocity.y > 0` as "ascending" → not grounded. Fix — only treat upward motion from an actual jump as ascending. In `playerController.ts`, replace:

```ts
    const ascending = player.motion.velocity.y > 0;
    const grounded = support.supportedState === CharacterSupportedState.SUPPORTED && !ascending;
```

with:

```ts
    // Only a real jump should defeat ground support; a small positive velocity.y from
    // collide-and-slide up a slope must NOT read as "airborne" (that dropped traction on hills).
    const JUMP_ASCENT_EPS = 0.5;
    const ascending = player.motion.velocity.y > JUMP_ASCENT_EPS;
    const grounded = support.supportedState === CharacterSupportedState.SUPPORTED && !ascending;
```

Re-verify Step 1–2. (Jump still works: the domain jump velocity `jumpSpeed = 9` is far above the 0.5 threshold.)

- [ ] **Step 4 (only if downhill hops): keep the capsule snapped descending**

Symptom: descending a hill the capsule briefly leaves the ground and drops in steps. If seen, increase the support-probe distance so the controller keeps contact on descent. In `playerController.ts`, the `checkSupport(dt, DOWN)` call already probes down; if hopping persists, document the exact babylon version's ground-keeping option found during implementation and apply it. If no hopping is observed, skip this step (leave a note in the commit that descent was clean).

- [ ] **Step 5: Typecheck & commit (only if a fix was applied)**

```bash
pnpm exec tsc --noEmit
pnpm test
git add src/presentation/babylon/playerController.ts
git commit -m "fix(terrain): keep the character grounded on slopes"
```

If no fix was needed, record that in Task 8's summary instead (nothing to commit here).

---

## Task 7: Final cumulative verification (DoD)

**Files:** none (verification only)

- [ ] **Step 1: Full typecheck + tests**

Run: `pnpm exec tsc --noEmit && pnpm test`
Expected: 0 type errors; all Vitest suites pass (including `terrainHeight`).

- [ ] **Step 2: Walk-through against the P1 DoD**

In the browser (fresh reload, advance the AVG intro), confirm every DoD item and capture a screenshot for each notable one:
- Terrain reads as rolling: central flat area + edge hills; grass drapes the relief; terrain lit correctly (not dark).
- Everything sits on the ground: grass/flowers/rocks/bushes/trees rest on slopes, none floating/buried.
- Collision: into a tree trunk → blocked; into a large rock → blocked; small rock / grass → pass through; up/down hills → rides the surface, no fall-through / float / bounce; central area fully walkable.
- Distant mountains visible past the field.
- FPS: check `scene.getEngine().getFps().toFixed(0)` on the cumulative scene → ~60 (vsync-capped).

- [ ] **Step 3: FPS check snippet**

```js
(() => {
  const { scene } = window.hub; const engine = scene.getEngine();
  for (let i=0;i<30;i++){ engine.beginFrame(); scene.render(); engine.endFrame(); }
  return JSON.stringify({ fps:+engine.getFps().toFixed(0), meshes: scene.meshes.length });
})()
```

Expected: `fps` in the high-50s/60. If it dropped materially versus pre-P1 (~59), the likely cost is the 120² MESH collider — note it and, if needed, reduce `SUBDIVISIONS` or switch the terrain collider to `HEIGHTFIELD` (follow-up).

- [ ] **Step 4: Screenshot proof for the user**

Capture a clean gameplay `screenshot` (rolling terrain + trees/rocks seated + distant mountains) to share.

---

## Self-Review Notes (author checklist — already applied)

- **Spec coverage:** terrainHeight (Task 1), terrain mesh + MESH collider + boundaries + distant scenery (Task 2, 7), re-seat scatter (Task 3), re-seat trees + trunk colliders (Task 4), large-rock decoupled colliders (Task 5), slope-movement verification & targeted fix (Task 6), perf/DoD (Task 7). All spec sections mapped.
- **No domain changes:** confirmed — only `playerController.ts` may change, and only the `ascending`/grounded presentation logic, not `src/domain`.
- **Determinism:** `terrainHeight` is seeded/pure and unit-tested for reproducibility; scatter/tree Y and rock-collider positions derive from it, so placement is reproducible.
- **Type consistency:** `scatterMatrices` returns `ScatterResult { buffer, placements }`; every call site uses `.buffer`, rocks use `.placements`; `Placement { x,y,z,s }` used by `addRockColliders`.
