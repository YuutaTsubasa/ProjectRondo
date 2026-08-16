# Hub Grassland Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the hub's flat grey placeholder ground into a starting grassland — grass ground, gradient sky, a sun that casts the knight's shadow, scattered trees, and edge boundaries.

**Architecture:** Presentation-only babylon scene-building. Three new focused modules under `src/presentation/babylon/` — `environment.ts` (sky + sun + shadows + ambient), `ground.ts` (grass ground + collider + boundary walls), `trees.ts` (load + scatter a user GLB) — plus a `hubScene.ts` refactor to call them. No `src/domain` changes, no Vitest (pure-visual → verified in the browser preview).

**Tech Stack:** babylon.js (deep subpath imports + side-effect modules), Havok physics, TypeScript, Vite, Svelte host.

**Spec:** `docs/superpowers/specs/2026-08-16-hub-grassland-design.md`

**Conventions (match existing code):**
- Deep babylon imports (`@babylonjs/core/...`) + side-effect imports for shaders/components (see `hubScene.ts` StandardMaterial/physics side-effects; the memory `babylon-web-verification` documents this gotcha — a missing side-effect makes meshes render nothing).
- Right-handed scene (`useRightHandedSystem = true`), Havok, follow camera derives forward from local −Z.
- `import.meta.env.DEV` exposes `window.hub`; the Vite `forceFullReload` plugin full-reloads on source edits; GLB URLs are versioned (`?v=N`).
- Verify in-browser: `preview_start {name:'dev'}`, wait ~9s for Havok+knight, then `javascript_tool` against `window.hub` / DOM, and `computer{action:'screenshot'}` for visuals. **Note:** when the preview pane is backgrounded, the rAF loop pauses and `getDeltaTime()`→0; that only affects movement tests, not the static-scene checks used here.

**No unit tests:** these are pure-visual/physics presentation modules. Each task's "verify" step is an in-browser check with concrete assertions. Typecheck (`pnpm run typecheck` → 0/0) and build (`pnpm build`) must stay green after every task.

---

### Task 1: `environment.ts` — sky dome + sun + shadows + ambient

**Files:**
- Create: `src/presentation/babylon/environment.ts`
- Modify: `src/presentation/babylon/hubScene.ts` (remove the inline `HemisphericLight`, call `createEnvironment`)

- [ ] **Step 1: Write `environment.ts`**

```ts
// src/presentation/babylon/environment.ts
import type { Scene } from '@babylonjs/core/scene';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
// Side-effect: registers the shadow-map render component. Without it the ShadowGenerator produces no shadows.
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
// Side-effect: registers the StandardMaterial shader (tree-shaken deep imports need this).
import '@babylonjs/core/Materials/standardMaterial';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';

export interface Environment {
  readonly shadowGenerator: ShadowGenerator;
  readonly sun: DirectionalLight;
}

/** A vertical zenith→horizon gradient painted on a DynamicTexture, for the unlit skydome. */
function skyGradientTexture(scene: Scene): DynamicTexture {
  const tex = new DynamicTexture('skyGradient', { width: 16, height: 512 }, scene, false);
  const ctx = tex.getContext();
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0.0, '#2b6cb0'); // zenith: deep sky blue
  g.addColorStop(0.5, '#7fb2e5'); // mid sky
  g.addColorStop(1.0, '#dcecf7'); // horizon: pale
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 16, 512);
  tex.update();
  return tex;
}

/** Builds the outdoor atmosphere: gradient skydome, directional sun with a shadow generator, and a dim ambient fill. */
export function createEnvironment(scene: Scene): Environment {
  // Skydome: a large inward-facing sphere, unlit, infinitely far so it stays put as the camera moves.
  const sky = CreateSphere('sky', { diameter: 1000, sideOrientation: Mesh.BACKSIDE }, scene);
  sky.infiniteDistance = true;
  sky.isPickable = false;
  const skyMat = new StandardMaterial('skyMat', scene);
  skyMat.backFaceCulling = false;
  skyMat.disableLighting = true;
  skyMat.emissiveTexture = skyGradientTexture(scene);
  sky.material = skyMat;

  // Ambient fill — dim so the sun's shadow stays visible (was intensity 1 as the only light).
  const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), scene);
  ambient.intensity = 0.45;

  // Sun: an angled directional light that casts shadows.
  const sun = new DirectionalLight('sun', new Vector3(-0.5, -1, -0.5), scene);
  sun.position = new Vector3(30, 60, 30);
  sun.intensity = 1.1;
  sun.diffuse = new Color3(1, 0.98, 0.9);

  const shadowGenerator = new ShadowGenerator(1024, sun);
  shadowGenerator.usePercentageCloserFiltering = true;
  shadowGenerator.bias = 0.002;

  return { shadowGenerator, sun };
}
```

- [ ] **Step 2: Wire it into `hubScene.ts`**

Remove the inline hemispheric light and add the environment call. In `src/presentation/babylon/hubScene.ts`:

Delete line 46 (`new HemisphericLight('light', new Vector3(0, 1, 0), scene);`) and its now-unused import on line 5 (`import { HemisphericLight } ...`). Add the import near the other local imports (after line 24):
```ts
import { createEnvironment } from './environment';
```
Then, immediately after `scene.useRightHandedSystem = true;` (line 44) and the blank line, insert:
```ts
  const { shadowGenerator } = createEnvironment(scene);
```
(Leave the ground/physics block for Task 2; `shadowGenerator` is used in Tasks 2–4.)

- [ ] **Step 3: Typecheck**

Run: `pnpm run typecheck`
Expected: `0 ERRORS 0 WARNINGS`. (`shadowGenerator` is unused until Task 3 — harmless, `noUnusedLocals` is off in this tsconfig.)

- [ ] **Step 4: Verify in-browser**

`preview_start {name:'dev'}`, wait ~9s, then `javascript_tool`:
```js
(() => {
  const { scene } = window.hub;
  const sky = scene.getMeshByName('sky');
  return JSON.stringify({
    skyPresent: !!sky,
    skyInfinite: sky?.infiniteDistance,
    skyHasEmissive: !!sky?.material?.emissiveTexture,
    sun: !!scene.getLightByName('sun'),
    ambientIntensity: scene.getLightByName('ambient')?.intensity,
    shadowMaps: scene.getEngine().scenes[0].lights.filter(l => l.getShadowGenerator()).length,
  });
})()
```
Expected: `skyPresent:true, skyInfinite:true, skyHasEmissive:true, sun:true, ambientIntensity:0.45, shadowMaps:1`. Then `computer{action:'screenshot'}` — the background is now a blue→pale gradient sky instead of grey.

- [ ] **Step 5: Commit**

```bash
git add src/presentation/babylon/environment.ts src/presentation/babylon/hubScene.ts
git commit -m "feat(hub): gradient skydome + directional sun + shadow generator"
```

---

### Task 2: `ground.ts` — grass ground + collider + boundary walls

**Files:**
- Create: `src/presentation/babylon/ground.ts`
- Modify: `src/presentation/babylon/hubScene.ts` (replace the inline ground with `createGround`)

- [ ] **Step 1: Write `ground.ts`**

```ts
// src/presentation/babylon/ground.ts
import type { Scene } from '@babylonjs/core/scene';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import '@babylonjs/core/Materials/standardMaterial'; // side-effect: StandardMaterial shader
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { PhysicsAggregate } from '@babylonjs/core/Physics/v2/physicsAggregate';
import { PhysicsShapeType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin';

const FIELD = 50;      // ground is FIELD x FIELD
const HALF = FIELD / 2;

/** Deterministic 0..1 PRNG (mulberry32) so the grass texture looks identical every run. */
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A tiling grass texture: a green base speckled with lighter/darker tufts. */
function grassTexture(scene: Scene): DynamicTexture {
  const size = 256;
  const tex = new DynamicTexture('grass', { width: size, height: size }, scene, false);
  const ctx = tex.getContext();
  ctx.fillStyle = '#4f7a3a';
  ctx.fillRect(0, 0, size, size);
  const rand = rng(1337);
  const tufts = ['#5c8a44', '#456b33', '#6b9a4e', '#3f5f2e'];
  for (let i = 0; i < 1600; i++) {
    ctx.fillStyle = tufts[(rand() * tufts.length) | 0];
    const x = rand() * size, y = rand() * size;
    ctx.fillRect(x, y, 1 + rand() * 2, 1 + rand() * 2);
  }
  tex.update();
  tex.uScale = 8;
  tex.vScale = 8;
  return tex;
}

/** Adds four thin, invisible, static wall colliders at the field edges so the player can't walk off. */
function createBoundaries(scene: Scene): void {
  const t = 1, h = 6; // wall thickness / height
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
    new PhysicsAggregate(wall, PhysicsShapeType.BOX, { mass: 0 }, scene);
  }
}

/** Builds the flat grass ground (with its box collider + edge boundaries) and returns the ground mesh. */
export function createGround(scene: Scene): AbstractMesh {
  const ground = CreateGround('ground', { width: FIELD, height: FIELD }, scene);
  const mat = new StandardMaterial('groundMat', scene);
  mat.diffuseTexture = grassTexture(scene);
  mat.diffuseColor = new Color3(1, 1, 1);
  mat.specularColor = new Color3(0.05, 0.05, 0.05);
  ground.material = mat;
  ground.receiveShadows = true;
  new PhysicsAggregate(ground, PhysicsShapeType.BOX, { mass: 0 }, scene);
  createBoundaries(scene);
  return ground;
}
```

- [ ] **Step 2: Wire it into `hubScene.ts`**

In `src/presentation/babylon/hubScene.ts`, remove the inline ground block (current lines 48–51 and the `new PhysicsAggregate(ground, ...)` on line 58) and the now-unused imports `CreateGround`, `Color3`, and the `StandardMaterial` value import (keep the physics side-effect import). Add near the local imports:
```ts
import { createGround } from './ground';
```
Physics must be enabled before the ground collider, so **after** `scene.enablePhysics(...)` (line 57), replace the old `new PhysicsAggregate(ground, ...)` line with:
```ts
  createGround(scene);
```
(`createGround` attaches the ground's own collider internally, so `hubScene` doesn't keep the mesh reference.)
Note: `createEnvironment` (Task 1) does not need physics, so it can stay where it is (after `useRightHandedSystem`). The final order is: enablePhysics → createEnvironment (already added) can be before or after; keep `createGround` strictly after `enablePhysics`.

- [ ] **Step 3: Typecheck + build**

Run: `pnpm run typecheck` → `0 ERRORS 0 WARNINGS`.
Run: `pnpm build` → succeeds.

- [ ] **Step 4: Verify in-browser**

Reload the preview (navigate to the URL again), wait ~9s, `javascript_tool`:
```js
(() => {
  const { scene } = window.hub;
  const g = scene.getMeshByName('ground');
  const bounds = scene.meshes.filter(m => m.name.startsWith('bound_'));
  return JSON.stringify({
    groundHasTexture: !!g?.material?.diffuseTexture,
    receivesShadows: g?.receiveShadows,
    boundaryCount: bounds.length,
    physicsBodies: scene.getPhysicsEngine()?.getBodies?.().length ?? 'n/a',
  });
})()
```
Expected: `groundHasTexture:true, receivesShadows:true, boundaryCount:4`. Screenshot — the ground is now green grass. (Player-can't-leave is re-checked end-to-end in Task 5.)

- [ ] **Step 5: Commit**

```bash
git add src/presentation/babylon/ground.ts src/presentation/babylon/hubScene.ts
git commit -m "feat(hub): grass ground with procedural texture + edge boundary colliders"
```

---

### Task 3: Knight casts a shadow

**Files:**
- Modify: `src/presentation/babylon/knight.ts` (add optional `shadowGenerator` param, register meshes)
- Modify: `src/presentation/babylon/hubScene.ts` (pass `shadowGenerator` to `loadKnight`)

- [ ] **Step 1: Extend `loadKnight`**

In `src/presentation/babylon/knight.ts`, add the import at the top:
```ts
import type { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
```
Change the signature (line 32) from:
```ts
export async function loadKnight(scene: Scene, parent: TransformNode): Promise<KnightAnimations> {
```
to:
```ts
export async function loadKnight(scene: Scene, parent: TransformNode, shadowGenerator?: ShadowGenerator): Promise<KnightAnimations> {
```
Immediately after the existing `for (const mesh of result.meshes) mesh.alwaysSelectAsActiveMesh = true;` (line 43), add:
```ts
  // The knight casts the sun's shadow onto the grass.
  if (shadowGenerator) for (const mesh of result.meshes) shadowGenerator.addShadowCaster(mesh);
```

- [ ] **Step 2: Pass it from `hubScene.ts`**

In `src/presentation/babylon/hubScene.ts`, change `const knight = await loadKnight(scene, playerRoot);` (line 66) to:
```ts
  const knight = await loadKnight(scene, playerRoot, shadowGenerator);
```

- [ ] **Step 3: Typecheck**

Run: `pnpm run typecheck` → `0 ERRORS 0 WARNINGS`.

- [ ] **Step 4: Verify in-browser**

Reload, wait ~9s, `javascript_tool`:
```js
(() => {
  const { scene } = window.hub;
  const sg = scene.getLightByName('sun')?.getShadowGenerator();
  const map = sg?.getShadowMap();
  return JSON.stringify({
    hasShadowGenerator: !!sg,
    shadowCasterCount: map?.renderList?.length ?? 0, // knight submeshes (~34)
  });
})()
```
Expected: `hasShadowGenerator:true, shadowCasterCount` > 0 (the knight's meshes). Screenshot from a slightly high angle — a soft shadow sits under the knight on the grass.

- [ ] **Step 5: Commit**

```bash
git add src/presentation/babylon/knight.ts src/presentation/babylon/hubScene.ts
git commit -m "feat(hub): knight casts the sun's shadow on the grass"
```

---

### Task 4: `trees.ts` — scatter a user-supplied tree GLB (graceful if absent)

**Files:**
- Create: `src/presentation/babylon/trees.ts`
- Modify: `src/presentation/babylon/hubScene.ts` (call `loadTrees`)

- [ ] **Step 1: Write `trees.ts`**

```ts
// src/presentation/babylon/trees.ts
import type { Scene } from '@babylonjs/core/scene';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { ImportMeshAsync } from '@babylonjs/core/Loading/sceneLoader';
import '@babylonjs/loaders/glTF'; // side-effect: registers the glTF loader

/** Fixed scatter: [x, z, yawRadians, scale]. Includes the old Godot pillar corners (±8, ±8); the
 *  centre (~radius 5) is left clear so no tree spawns on the player's spawn point. */
const SPOTS: readonly [number, number, number, number][] = [
  [8, -8, 0.3, 1.0], [-8, -8, 1.9, 1.15], [8, 8, 2.7, 0.9], [-8, 8, 0.8, 1.05],
  [17, 3, 1.2, 1.2], [-16, -4, 2.2, 1.1], [3, -18, 0.5, 1.0], [-5, 18, 3.0, 1.15],
  [19, -15, 1.7, 0.95], [-19, 14, 0.2, 1.0],
];

/**
 * Loads /models/tree.glb and scatters copies across the field as shadow-casting trees. If the GLB is
 * absent (not added yet), logs a note and no-ops so the rest of the scene still renders.
 * The GLB should be texture-optimized offline like the knight (gltf-transform: `resize --width 1024
 * --height 1024` then `webp --quality 80`; do NOT run geometry/animation optimization).
 */
export async function loadTrees(scene: Scene, shadowGenerator?: ShadowGenerator): Promise<void> {
  let result;
  try {
    result = await ImportMeshAsync('/models/tree.glb?v=1', scene);
  } catch {
    console.info('[trees] /models/tree.glb not found — skipping trees (add the GLB to enable them).');
    return;
  }
  const root = result.meshes[0] as TransformNode;
  const registerCasters = (node: TransformNode) => {
    if (shadowGenerator)
      for (const m of node.getChildMeshes(false)) if (m.getTotalVertices() > 0) shadowGenerator.addShadowCaster(m);
  };

  // Tree #0 = the loaded model itself; the rest are clones (geometry is shared by reference).
  const place = (node: TransformNode, [x, z, yaw, scale]: readonly [number, number, number, number]) => {
    node.position.set(x, 0, z);
    node.rotation.set(0, yaw, 0);
    node.scaling.setAll(scale);
    registerCasters(node);
  };
  place(root, SPOTS[0]);
  for (let i = 1; i < SPOTS.length; i++) {
    const clone = root.clone(`tree_${i}`, null);
    if (clone) place(clone, SPOTS[i]);
  }
}
```

- [ ] **Step 2: Wire it into `hubScene.ts`**

Add the import near the local imports:
```ts
import { loadTrees } from './trees';
```
After the `driveKnightAnimation(...)` block (ends line 70), add:
```ts
  await loadTrees(scene, shadowGenerator);
```

- [ ] **Step 3: Typecheck + build**

Run: `pnpm run typecheck` → `0 ERRORS 0 WARNINGS`.
Run: `pnpm build` → succeeds.

- [ ] **Step 4: Verify in-browser (no asset yet)**

Reload, wait ~9s. Check `read_console_messages` — expect the info line `[trees] /models/tree.glb not found — skipping trees…` and **no error**. `javascript_tool`:
```js
(() => {
  const { scene } = window.hub;
  return JSON.stringify({
    treeMeshes: scene.meshes.filter(m => m.name.startsWith('tree_')).length, // 0 until the GLB exists
    sceneStillRenders: !!scene.getMeshByName('ground') && !!scene.getMeshByName('sky'),
  });
})()
```
Expected: `treeMeshes:0, sceneStillRenders:true`. (When a `public/models/tree.glb` is later added, reloading makes trees appear and cast shadows — no code change needed.)

- [ ] **Step 5: Commit**

```bash
git add src/presentation/babylon/trees.ts src/presentation/babylon/hubScene.ts
git commit -m "feat(hub): scatter user tree.glb via clones (graceful no-op if absent)"
```

---

### Task 5: End-to-end verification

**Files:** none (verification only).

- [ ] **Step 1: Reload + gather**

`preview_start {name:'dev'}`, wait ~9s. `read_console_messages {onlyErrors:true}` → none.

- [ ] **Step 2: Visual check**

`computer{action:'screenshot'}` — confirm: green grass ground, blue→pale gradient sky, a soft shadow under the knight. Capture it for the user.

- [ ] **Step 3: Boundary check**

`javascript_tool` — drive the player toward an edge with real frames (the pane may be backgrounded, so pump frames manually):
```js
(() => {
  const { scene, player } = window.hub;
  const engine = scene.getEngine();
  const busy = (ms) => { const t = performance.now(); while (performance.now() - t < ms) {} };
  window.hub.suspendInput(false);
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }));
  for (let i = 0; i < 240; i++) { engine.beginFrame(); busy(16); scene.render(); engine.endFrame(); }
  window.dispatchEvent(new KeyboardEvent('keyup', { key: 'w' }));
  const p = player.root.position;
  return JSON.stringify({ x: +p.x.toFixed(1), z: +p.z.toFixed(1), insideField: Math.abs(p.x) <= 25.5 && Math.abs(p.z) <= 25.5 });
})()
```
Expected: `insideField:true` (the player stops at the boundary wall rather than sailing past ±25).

- [ ] **Step 4: Full green build**

Run: `pnpm run typecheck` → `0 ERRORS 0 WARNINGS`. Run: `pnpm build` → succeeds. Run: `pnpm test` → existing 71 tests still pass (unchanged — presentation-only).

- [ ] **Step 5: Commit any fixups**

```bash
git commit -am "test(hub): grassland end-to-end verification fixups" # only if changes were needed
```

---

## Self-review coverage map

- Spec §4 grass ground → Task 2. §5 skydome → Task 1. §6 sun+shadows → Task 1 (generator) + Task 3 (knight caster) + Task 2 (`receiveShadows`). §7 trees → Task 4. §8 boundaries → Task 2. §9 hubScene refactor → Tasks 1–4. §10 testing → per-task in-browser + Task 5.
- Deferred per spec (not in plan): heightmap terrain, grass geometry + wind, `SkyMaterial`, splatmaps, tree LOD, per-tree collision.
- Assets: no new assets required to ship (grass + sky are procedural); trees activate when the user adds `public/models/tree.glb`.
