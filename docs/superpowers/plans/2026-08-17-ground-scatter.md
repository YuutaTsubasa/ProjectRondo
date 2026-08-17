# Ground Scatter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scatter procedural ground detail — grass tufts, wildflowers, rocks, bushes — across the hub field so it's no longer bare between the trees.

**Architecture:** One presentation module `src/presentation/babylon/scatter.ts` that builds a small base mesh per element type and fills its **thin-instance** matrix buffer with a deterministic scatter (one draw call per type). Called once from `hubScene`. No `src/domain`, no Vitest — verified in the browser.

**Tech Stack:** babylon.js (deep imports + side-effects), TypeScript, Vite.

**Spec:** `docs/superpowers/specs/2026-08-17-ground-scatter-design.md`

**Conventions:** deep babylon imports + side-effect imports (see `ground.ts`/`environment.ts`); seeded mulberry32 PRNG for determinism (as in `ground.ts`); base meshes get `isPickable = false` and `alwaysSelectAsActiveMesh = true` (thin-instances span the whole field, so don't let the base mesh be frustum-culled). Verify in-browser: `preview_start {name:'dev'}`, wait ~9s, `javascript_tool` against `window.hub`, `computer{action:'screenshot'}`. No unit tests (pure-visual). Keep `pnpm run typecheck` at 0/0 and `pnpm build` green after every task.

---

### Task 1: `scatter.ts` core + grass tufts

**Files:**
- Create: `src/presentation/babylon/scatter.ts`
- Modify: `src/presentation/babylon/hubScene.ts` (call `createGroundScatter`)

- [ ] **Step 1: Write `scatter.ts` (helpers + grass + entry point)**

```ts
import type { Scene } from '@babylonjs/core/scene';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import '@babylonjs/core/Materials/standardMaterial'; // side-effect: StandardMaterial shader
import { Material } from '@babylonjs/core/Materials/material';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';

const EXTENT = 24; // scatter within ±EXTENT (inside the ±25 boundary walls)

/** Deterministic 0..1 PRNG (mulberry32) so each scatter layout is identical every run. */
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

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
    pos.set((rand() * 2 - 1) * ext, o.y, (rand() * 2 - 1) * ext);
    Matrix.ComposeToRef(scale, Quaternion.RotationAxis(Vector3.UpReadOnly, rand() * Math.PI * 2), pos, m);
    m.copyToArray(buf, i * 16);
  }
  return buf;
}

/** Transparent texture with a handful of tapered green blades rising from the bottom edge. */
function grassAlphaTexture(scene: Scene): DynamicTexture {
  const size = 256;
  const tex = new DynamicTexture('grassBlades', { width: size, height: size }, scene, false);
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, size, size);
  const rand = rng(99);
  const greens = ['#3f7a2e', '#4f8f38', '#5fa043', '#356b28'];
  for (let i = 0; i < 14; i++) {
    const x0 = 20 + rand() * (size - 40);
    const w = 6 + rand() * 8;
    const h = size * 0.5 + rand() * size * 0.42;
    const lean = (rand() * 2 - 1) * 40;
    ctx.fillStyle = greens[(rand() * greens.length) | 0];
    ctx.beginPath();
    ctx.moveTo(x0, size);
    ctx.quadraticCurveTo(x0 + lean * 0.5, size - h * 0.5, x0 + lean, size - h);
    ctx.quadraticCurveTo(x0 + lean + w * 0.4, size - h * 0.5, x0 + w, size);
    ctx.closePath();
    ctx.fill();
  }
  tex.update(true);
  tex.hasAlpha = true;
  return tex;
}

/** Builds a cross-card base mesh (n crossed upright quads merged, base at y=0) with `mat`. */
function crossCard(scene: Scene, name: string, size: number, planes: number, mat: StandardMaterial): Mesh {
  const parts: Mesh[] = [];
  for (let i = 0; i < planes; i++) {
    const p = CreatePlane(`${name}_p${i}`, { size }, scene);
    p.rotation.y = (i * Math.PI) / planes;
    parts.push(p);
  }
  const card = Mesh.MergeMeshes(parts, true, true)!; // world rotations baked into geometry
  card.name = name;
  card.position.y = size / 2;            // lift so the card's base sits at y=0…
  card.bakeCurrentTransformIntoVertices(); // …and bake it in
  card.material = mat;
  card.isPickable = false;
  card.alwaysSelectAsActiveMesh = true;
  return card;
}

function grassMaterial(scene: Scene): StandardMaterial {
  const mat = new StandardMaterial('grassScatterMat', scene);
  const tex = grassAlphaTexture(scene);
  mat.diffuseTexture = tex;
  mat.useAlphaFromDiffuseTexture = true;
  mat.transparencyMode = Material.MATERIAL_ALPHATEST; // cutout — no transparency sorting
  mat.backFaceCulling = false;
  mat.specularColor = new Color3(0, 0, 0);
  return mat;
}

/** Scatters procedural ground detail (grass, and — added in later tasks — flowers/rocks/bushes). */
export function createGroundScatter(scene: Scene): void {
  const grass = crossCard(scene, 'grassTuft', 0.5, 3, grassMaterial(scene));
  grass.thinInstanceSetBuffer('matrix', scatterMatrices({ count: 4000, seed: 1, y: 0, minScale: 0.7, maxScale: 1.3 }), 16);
}
```

- [ ] **Step 2: Wire it into `hubScene.ts`**

Add the import near the other local imports:
```ts
import { createGroundScatter } from './scatter';
```
Immediately after `createGround(scene);` add:
```ts
  createGroundScatter(scene);
```

- [ ] **Step 3: Typecheck + build**

Run: `pnpm run typecheck` → `0 ERRORS 0 WARNINGS`.
Run: `pnpm build` → succeeds.

- [ ] **Step 4: Verify in-browser**

`preview_start {name:'dev'}`, wait ~9s, `javascript_tool`:
```js
(() => {
  const { scene } = window.hub;
  const g = scene.getMeshByName('grassTuft');
  return JSON.stringify({
    grassPresent: !!g,
    instanceCount: g?.thinInstanceCount ?? 0,   // expect 4000
    alphaTest: g?.material?.transparencyMode,    // expect 1 (MATERIAL_ALPHATEST)
    hasAlphaTex: !!g?.material?.diffuseTexture?.hasAlpha,
  });
})()
```
Expected: `grassPresent:true, instanceCount:4000, alphaTest:1, hasAlphaTex:true`. Screenshot — grass tufts cover the field; each sits on the ground (not floating/sunk); no obvious transparency-sort artifacts.

- [ ] **Step 5: Commit**

```bash
git add src/presentation/babylon/scatter.ts src/presentation/babylon/hubScene.ts
git commit -m "feat(hub): scatter grass tufts (billboard cross-cards, thin-instanced)"
```

---

### Task 2: Wildflowers

**Files:**
- Modify: `src/presentation/babylon/scatter.ts` (flower texture + material + scatter call)

- [ ] **Step 1: Add the flower texture + material builders**

In `scatter.ts`, add above `createGroundScatter`:
```ts
/** Transparent texture with a few small blossoms (white/yellow/purple) for wildflower cards. */
function flowerAlphaTexture(scene: Scene): DynamicTexture {
  const size = 128;
  const tex = new DynamicTexture('flowerTex', { width: size, height: size }, scene, false);
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, size, size);
  const rand = rng(51);
  const colors = ['#f4f4f0', '#f2d24b', '#c58bd8'];
  for (let f = 0; f < 5; f++) {
    const cx = 20 + rand() * (size - 40);
    const cy = 20 + rand() * (size * 0.55);
    const col = colors[(rand() * colors.length) | 0];
    // stem
    ctx.strokeStyle = '#4f8f38'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx, size); ctx.lineTo(cx, cy); ctx.stroke();
    // 5 petals + centre
    ctx.fillStyle = col;
    for (let p = 0; p < 5; p++) {
      const a = (p / 5) * Math.PI * 2;
      ctx.beginPath(); ctx.arc(cx + Math.cos(a) * 5, cy + Math.sin(a) * 5, 4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#f2c33b';
    ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fill();
  }
  tex.update(true);
  tex.hasAlpha = true;
  return tex;
}

function flowerMaterial(scene: Scene): StandardMaterial {
  const mat = new StandardMaterial('flowerScatterMat', scene);
  mat.diffuseTexture = flowerAlphaTexture(scene);
  mat.useAlphaFromDiffuseTexture = true;
  mat.transparencyMode = Material.MATERIAL_ALPHATEST;
  mat.backFaceCulling = false;
  mat.specularColor = new Color3(0, 0, 0);
  return mat;
}
```

- [ ] **Step 2: Scatter flowers in `createGroundScatter`**

Append to the body of `createGroundScatter`:
```ts
  const flowers = crossCard(scene, 'wildflower', 0.22, 2, flowerMaterial(scene));
  flowers.thinInstanceSetBuffer('matrix', scatterMatrices({ count: 400, seed: 2, y: 0, minScale: 0.7, maxScale: 1.2 }), 16);
```

- [ ] **Step 3: Typecheck + build**

Run: `pnpm run typecheck` → 0/0. Run: `pnpm build` → succeeds.

- [ ] **Step 4: Verify in-browser**

Reload, wait ~9s, `javascript_tool`:
```js
(() => {
  const f = window.hub.scene.getMeshByName('wildflower');
  return JSON.stringify({ present: !!f, count: f?.thinInstanceCount ?? 0, alphaTest: f?.material?.transparencyMode });
})()
```
Expected: `present:true, count:400, alphaTest:1`. Screenshot — small flowers dot the grass.

- [ ] **Step 5: Commit**

```bash
git add src/presentation/babylon/scatter.ts
git commit -m "feat(hub): scatter wildflowers among the grass"
```

---

### Task 3: Rocks

**Files:**
- Modify: `src/presentation/babylon/scatter.ts`

- [ ] **Step 1: Add the rock mesh builder**

In `scatter.ts`, add the import for the icosphere builder at the top (with the other builder imports):
```ts
import { CreateIcoSphere } from '@babylonjs/core/Meshes/Builders/icoSphereBuilder';
```
Add above `createGroundScatter`:
```ts
/** A chunky low-poly rock: an icosphere with vertices perturbed by a seeded random factor. */
function rockMesh(scene: Scene): Mesh {
  const rock = CreateIcoSphere('rock', { radius: 0.4, subdivisions: 1 }, scene);
  const pos = rock.getVerticesData(VertexBuffer.PositionKind)!;
  const rand = rng(7);
  for (let i = 0; i < pos.length; i += 3) {
    const f = 0.8 + rand() * 0.5;
    pos[i] *= f; pos[i + 1] *= f * 0.7; pos[i + 2] *= f; // squash vertically a touch
  }
  rock.updateVerticesData(VertexBuffer.PositionKind, pos);
  rock.createNormals(false);
  const mat = new StandardMaterial('rockMat', scene);
  mat.diffuseColor = new Color3(0.5, 0.5, 0.52);
  mat.specularColor = new Color3(0.05, 0.05, 0.05);
  rock.material = mat;
  rock.isPickable = false;
  rock.alwaysSelectAsActiveMesh = true;
  return rock;
}
```

- [ ] **Step 2: Scatter rocks in `createGroundScatter`**

Append:
```ts
  const rock = rockMesh(scene);
  rock.thinInstanceSetBuffer('matrix', scatterMatrices({ count: 50, seed: 3, y: -0.05, minScale: 0.3, maxScale: 0.9 }), 16);
```

- [ ] **Step 3: Typecheck + build**

Run: `pnpm run typecheck` → 0/0. Run: `pnpm build` → succeeds.

- [ ] **Step 4: Verify in-browser**

Reload, wait ~9s, `javascript_tool`:
```js
(() => {
  const r = window.hub.scene.getMeshByName('rock');
  return JSON.stringify({ present: !!r, count: r?.thinInstanceCount ?? 0, verts: r?.getTotalVertices() });
})()
```
Expected: `present:true, count:50, verts` > 0. Screenshot — grey rocks scattered, sitting slightly into the ground.

- [ ] **Step 5: Commit**

```bash
git add src/presentation/babylon/scatter.ts
git commit -m "feat(hub): scatter low-poly rocks"
```

---

### Task 4: Bushes

**Files:**
- Modify: `src/presentation/babylon/scatter.ts`

- [ ] **Step 1: Add the bush mesh builder**

In `scatter.ts`, add above `createGroundScatter`:
```ts
/** A small bush: two or three overlapping green icosphere blobs merged, base at y=0. */
function bushMesh(scene: Scene): Mesh {
  const spec: [number, number, number, number][] = [
    [0, 0.30, 0, 0.50], [0.24, 0.22, 0.10, 0.38], [-0.20, 0.24, -0.12, 0.36],
  ];
  const blobs: Mesh[] = [];
  for (const [x, y, z, r] of spec) {
    const b = CreateIcoSphere(`bb`, { radius: r, subdivisions: 1 }, scene);
    b.position.set(x, y, z);
    blobs.push(b);
  }
  const bush = Mesh.MergeMeshes(blobs, true, true)!;
  bush.name = 'bush';
  const mat = new StandardMaterial('bushMat', scene);
  mat.diffuseColor = new Color3(0.28, 0.45, 0.22);
  mat.specularColor = new Color3(0.03, 0.03, 0.03);
  bush.material = mat;
  bush.isPickable = false;
  bush.alwaysSelectAsActiveMesh = true;
  return bush;
}
```

- [ ] **Step 2: Scatter bushes in `createGroundScatter`**

Append:
```ts
  const bush = bushMesh(scene);
  bush.thinInstanceSetBuffer('matrix', scatterMatrices({ count: 40, seed: 4, y: 0, minScale: 0.7, maxScale: 1.3, extent: EXTENT - 2 }), 16);
```

- [ ] **Step 3: Typecheck + build**

Run: `pnpm run typecheck` → 0/0. Run: `pnpm build` → succeeds.

- [ ] **Step 4: Verify in-browser**

Reload, wait ~9s, `javascript_tool`:
```js
(() => {
  const b = window.hub.scene.getMeshByName('bush');
  return JSON.stringify({ present: !!b, count: b?.thinInstanceCount ?? 0, verts: b?.getTotalVertices() });
})()
```
Expected: `present:true, count:40, verts` > 0. Screenshot — green bushes among the field.

- [ ] **Step 5: Commit**

```bash
git add src/presentation/babylon/scatter.ts
git commit -m "feat(hub): scatter bushes"
```

---

### Task 5: End-to-end verification

**Files:** none (verification only).

- [ ] **Step 1: Reload + errors**

`preview_start {name:'dev'}`, wait ~9s. `read_console_messages {onlyErrors:true}` → none (ignore transient Vite `504 Outdated Optimize Dep` on the first load after new imports — reload once).

- [ ] **Step 2: Walk through it**

`javascript_tool` — dismiss the intro (SKIP → choose → SKIP), then drive the player with real frames and confirm it walks through the scatter (no colliders) and the ground looks populated:
```js
(() => {
  const { scene, player } = window.hub;
  const engine = scene.getEngine();
  const busy = (ms) => { const t = performance.now(); while (performance.now() - t < ms) {} };
  window.hub.suspendInput(false);
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }));
  for (let i = 0; i < 120; i++) { engine.beginFrame(); busy(16); scene.render(); engine.endFrame(); }
  window.dispatchEvent(new KeyboardEvent('keyup', { key: 'w' }));
  const counts = ['grassTuft','wildflower','rock','bush'].map(n => scene.getMeshByName(n)?.thinInstanceCount ?? 0);
  return JSON.stringify({ counts, fps: +engine.getFps().toFixed(0), playerMoved: +player.root.position.z.toFixed(1) });
})()
```
Expected: `counts:[4000,400,50,40]`, `playerMoved` != 0 (walked through freely).

- [ ] **Step 3: Screenshot**

`computer{action:'screenshot'}` from ground level — grass, flowers, rocks, bushes populate the field; no floating/sunk grass, no transparency-sort破圖. Capture it for the user.

- [ ] **Step 4: Full green**

Run: `pnpm run typecheck` → 0/0. Run: `pnpm build` → succeeds. Run: `pnpm test` → existing 71 tests still pass (presentation-only, unchanged).

- [ ] **Step 5: Commit any fixups**

```bash
git commit -am "test(hub): ground-scatter end-to-end verification fixups" # only if changes were needed
```

---

## Self-review coverage map

- Spec §4 grass → Task 1. §5 flowers → Task 2. §6 rocks → Task 3. §7 bushes → Task 4. §8 distribution/thin-instances/seeded PRNG → `scatterMatrices` (Task 1) used by all. §9 lit + non-caster → element materials never call `addShadowCaster` (none added). §10 hubScene wiring → Task 1. §11 testing → per-task + Task 5.
- Deferred per spec (not in plan): wind shader, LOD/fade, per-element collision/shadows, hi-fi assets.
