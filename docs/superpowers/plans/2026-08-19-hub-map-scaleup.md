# Bigger, Naturally-Bounded Hub Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Grow the hub to 100×100 and replace the hard invisible walls with a steep natural terrain barrier the player can't climb, keeping it lush and 60fps.

**Architecture:** Rescale the coupled map constants together (all rooted in `terrainHeight.ts`'s `FIELD`) and add a `barrierRamp` term to the pure `terrainHeight`: gentle centre → wide walkable rolling belt (≤~30°) → steep rim (>60°, unwalkable). Everything stays thin-instanced / single-mesh; no `src/domain` changes.

**Tech Stack:** TypeScript, `@babylonjs/core`, Havok physics, Vitest, in-browser preview verification.

**Spec:** `docs/superpowers/specs/2026-08-19-hub-map-scaleup-design.md`

---

## File Structure

- **Modify** `src/presentation/babylon/terrainHeight.ts` — bigger radii (`FIELD` 100, `FLAT_RADIUS` 14, `EDGE_RADIUS` 42) + a new `barrierRamp` term (`BARRIER_TOP` 48, `BARRIER_HEIGHT` 12).
- **Modify** `tests/presentation/terrainHeight.test.ts` — assert walkable-belt slope ≤ limit, barrier-belt slope steep, bounds, new golden values.
- **Modify** `src/presentation/babylon/terrain.ts` — `SUBDIVISIONS` 120→200, taller boundary walls, mountain ring moved out + taller.
- **Modify** `src/presentation/babylon/scatter.ts` — `EXTENT` 24→40, counts scaled ~2.7×.
- **Modify** `src/presentation/babylon/trees.ts` — more `SPOTS`, spread over the bigger interior.

`FIELD`/`HALF` already flow from `terrainHeight.ts` into `terrain.ts` and `scatter.ts`, so bumping `FIELD` moves the ground, walls, and grid together; the other per-file values are updated per task below.

---

## Task 1: terrainHeight — bigger map + steep barrier (TDD)

**Files:**
- Modify: `src/presentation/babylon/terrainHeight.ts`
- Test: `tests/presentation/terrainHeight.test.ts`

- [ ] **Step 1: Rewrite the test for the new profile**

Replace the entire contents of `tests/presentation/terrainHeight.test.ts` with:

```ts
import { describe, it, expect } from 'vitest';
import {
  terrainHeight,
  AMPLITUDE,
  BASE_AMPLITUDE,
  BARRIER_HEIGHT,
  FLAT_RADIUS,
  EDGE_RADIUS,
} from '../../src/presentation/babylon/terrainHeight';

/** Max terrain slope (degrees) sampled around the ring at radius r. */
function maxSlopeOnRing(r: number): number {
  const d = 0.5;
  let max = 0;
  for (let a = 0; a < Math.PI * 2; a += 0.04) {
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const gx = (terrainHeight(x + d, z) - terrainHeight(x - d, z)) / (2 * d);
    const gz = (terrainHeight(x, z + d) - terrainHeight(x, z - d)) / (2 * d);
    max = Math.max(max, (Math.atan(Math.hypot(gx, gz)) * 180) / Math.PI);
  }
  return max;
}

describe('terrainHeight', () => {
  it('gently rolls in the central play area — never a dead-flat plane, never a big hill', () => {
    let maxAbs = 0;
    let anyUndulation = false;
    for (let x = -FLAT_RADIUS; x <= FLAT_RADIUS; x += 1) {
      for (let z = -FLAT_RADIUS; z <= FLAT_RADIUS; z += 1) {
        if (Math.hypot(x, z) > FLAT_RADIUS) continue;
        const h = terrainHeight(x, z);
        maxAbs = Math.max(maxAbs, Math.abs(h));
        if (Math.abs(h) > 0.05) anyUndulation = true;
      }
    }
    expect(anyUndulation).toBe(true);
    expect(maxAbs).toBeLessThanOrEqual(BASE_AMPLITUDE + 1e-9);
  });

  it('keeps the walkable belt climbable (≤ 35°) but the rim barrier steep (> 60°)', () => {
    // Rolling hills between the flat centre and the barrier stay comfortably walkable.
    for (let r = FLAT_RADIUS + 1; r < EDGE_RADIUS - 1; r += 1) {
      expect(maxSlopeOnRing(r)).toBeLessThanOrEqual(35);
    }
    // The rim ramp (mid-barrier) is a wall — steeper than the controller's 60° limit.
    let barrierMax = 0;
    for (let r = 43; r <= 47; r += 0.5) barrierMax = Math.max(barrierMax, maxSlopeOnRing(r));
    expect(barrierMax).toBeGreaterThan(60);
  });

  it('is deterministic and reproducible across builds (pinned golden values)', () => {
    expect(terrainHeight(12.3, -7.1)).toBe(terrainHeight(12.3, -7.1));
    expect(terrainHeight(30, 10)).toBeCloseTo(3.146473615124727, 10);
    expect(terrainHeight(-22, 14)).toBeCloseTo(1.738889023831396, 10);
    expect(terrainHeight(5, 5)).toBeCloseTo(0.07281288298824791, 10);
    expect(terrainHeight(45, 0)).toBeCloseTo(9.713762882765149, 10); // on the barrier
  });

  it('stays within [-BASE_AMPLITUDE, AMPLITUDE + BASE_AMPLITUDE + BARRIER_HEIGHT]', () => {
    for (let x = -49; x <= 49; x += 1) {
      for (let z = -49; z <= 49; z += 1) {
        const h = terrainHeight(x, z);
        expect(h).toBeGreaterThanOrEqual(-BASE_AMPLITUDE - 1e-9);
        expect(h).toBeLessThanOrEqual(AMPLITUDE + BASE_AMPLITUDE + BARRIER_HEIGHT + 1e-9);
      }
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run tests/presentation/terrainHeight.test.ts`
Expected: FAIL — `BARRIER_HEIGHT` is not exported yet / golden values differ.

- [ ] **Step 3: Update `terrainHeight.ts`**

Replace the constants block and the `terrainHeight`/`falloff` region. The full new file:

```ts
// Pure procedural terrain height — NO babylon imports, so it unit-tests in the node env and
// scatter/trees can sample it to sit on the surface. Deterministic (seeded), reproducible.
//
// Three layers, summed, by distance r from the centre:
//   • a gentle BASE roll everywhere (never a dead-flat plane),
//   • falloff-gated HILLS across the wide walkable belt (FLAT_RADIUS…EDGE_RADIUS, ≤ ~30°), and
//   • a steep BARRIER rim (EDGE_RADIUS…BARRIER_TOP) that rises past the character controller's
//     walkable slope — the natural boundary that encloses the field instead of an invisible wall.

export const FIELD = 100; // terrain spans FIELD x FIELD, centred on the origin
export const FLAT_RADIUS = 14; // near-flat play area within this radius of the centre
export const EDGE_RADIUS = 42; // walkable hills reach full amplitude here; the barrier begins here
export const AMPLITUDE = 5.5; // max walkable hill height, world units
const HILL_FREQ = 0.05; // long wavelength → broad, walkable hills (physical feature size, not scaled)
export const BASE_AMPLITUDE = 1.8; // rolling undulation everywhere (± this)
const BASE_FREQ = 0.075;
const SEED = 1337;
const LAYER_DECORRELATION = 100; // offsets the hill lattice so the two noise layers don't share peaks
const BARRIER_TOP = 48; // barrier reaches full height here, then plateaus to the rim
export const BARRIER_HEIGHT = 12; // steep unwalkable rise (>60°) that walls the field with landscape

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Deterministic hashed value in [0,1) at integer lattice point (ix, iz). */
function latticeValue(ix: number, iz: number): number {
  let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + SEED) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise in [0,1) at world (x,z) sampled on a lattice of the given frequency:
 *  bilinear blend of four lattice values, smoothstep-eased. */
function valueNoise(x: number, z: number, freq: number): number {
  const gx = x * freq;
  const gz = z * freq;
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

/** 0 inside FLAT_RADIUS, easing to 1 by EDGE_RADIUS — keeps the big hills off the centre. */
function falloff(r: number): number {
  if (r <= FLAT_RADIUS) return 0;
  if (r >= EDGE_RADIUS) return 1;
  return smoothstep((r - FLAT_RADIUS) / (EDGE_RADIUS - FLAT_RADIUS));
}

/** 0 inside EDGE_RADIUS, rising STEEPLY to BARRIER_HEIGHT by BARRIER_TOP (then flat) — the unwalkable
 *  rim that encloses the field. Its mid-slope exceeds the controller's 60° walkable limit. */
function barrierRamp(r: number): number {
  if (r <= EDGE_RADIUS) return 0;
  if (r >= BARRIER_TOP) return BARRIER_HEIGHT;
  return smoothstep((r - EDGE_RADIUS) / (BARRIER_TOP - EDGE_RADIUS)) * BARRIER_HEIGHT;
}

/** Ground height at world (x, z): gentle roll everywhere + walkable hills + a steep rim barrier.
 *  Pure & deterministic. Range ≈ [-BASE_AMPLITUDE, AMPLITUDE + BASE_AMPLITUDE + BARRIER_HEIGHT]. */
export function terrainHeight(x: number, z: number): number {
  const r = Math.hypot(x, z);
  const base = BASE_AMPLITUDE * (valueNoise(x, z, BASE_FREQ) - 0.5) * 2;
  const hills = falloff(r) * AMPLITUDE * valueNoise(x + LAYER_DECORRELATION, z - LAYER_DECORRELATION, HILL_FREQ);
  return base + hills + barrierRamp(r);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run tests/presentation/terrainHeight.test.ts`
Expected: PASS (4 tests). If the golden values fail, the constants above were altered — do NOT edit the goldens; restore the constants.

- [ ] **Step 5: Typecheck & commit**

```bash
pnpm exec tsc --noEmit
git add src/presentation/babylon/terrainHeight.ts tests/presentation/terrainHeight.test.ts
git commit -m "feat(map): grow terrain to 100×100 + steep unwalkable rim barrier

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: terrain.ts — collider density, taller walls, mountains moved out

**Files:**
- Modify: `src/presentation/babylon/terrain.ts`

- [ ] **Step 1: Scale the collider subdivisions**

Change `const SUBDIVISIONS = 120;` to:

```ts
const SUBDIVISIONS = 200; // keeps ~the P1 segment size at the doubled span (≈80k-tri MESH collider)
```

- [ ] **Step 2: Make the safety walls tall enough to cover the barrier rim**

In `createBoundaries`, change `const h = 6;` to:

```ts
const h = 18; // taller than the barrier lip (~17) so a runaway capsule can't clear it
```

(The wall positions already derive from `HALF = FIELD / 2`, now 50, so they move out automatically.)

- [ ] **Step 3: Move the mountain ring out and scale it up**

In `createDistantScenery`, change:

```ts
  const RING_RADIUS = 60; // far enough to read as a distant range, close enough not to float off
  const SEGMENTS = 64; // silhouette resolution
  const BASE_Y = -3; // bottom skirt sits just below the horizon
  const MIN_H = 10;
  const MAX_H = 24;
```

to:

```ts
  const RING_RADIUS = 85; // beyond the enlarged field + barrier rim
  const SEGMENTS = 80; // silhouette resolution (more segments for the bigger ring)
  const BASE_Y = -4; // bottom skirt sits just below the horizon
  const MIN_H = 22; // taller so the range still looms OVER the barrier from inside the field
  const MAX_H = 48;
```

- [ ] **Step 4: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 5: Verify in the browser**

Start the preview (preview_start name `dev`), advance the AVG intro. Then via `javascript_tool` (pump real frames — the pane may be backgrounded):

```js
(() => {
  const { scene } = window.hub; const engine = scene.getEngine();
  for (let i=0;i<8;i++){ engine.beginFrame(); scene.render(); engine.endFrame(); }
  const t = scene.getMeshByName('terrain');
  const pos = t.getVerticesData('position');
  let minY=Infinity,maxY=-Infinity; for (let i=1;i<pos.length;i+=3){ minY=Math.min(minY,pos[i]); maxY=Math.max(maxY,pos[i]); }
  const bb = t.getBoundingInfo().boundingBox;
  return JSON.stringify({ terrainYmin:+minY.toFixed(1), terrainYmax:+maxY.toFixed(1),
    fieldSpan:+(bb.maximumWorld.x - bb.minimumWorld.x).toFixed(0), fps:+engine.getFps().toFixed(0) });
})()
```

Expected: `fieldSpan` ≈ 100; `terrainYmax` ≈ 12–17 (the barrier rim); `fps` ~60. Then `screenshot` — the field is visibly bigger, the edges rise into a steep rim, and the mountain range sits on the horizon **beyond** the rim (still visible). If the MESH collider tanks fps materially (well below 60), note it — the spec's fallback is a `HEIGHTFIELD` collider or a lower `SUBDIVISIONS`.

- [ ] **Step 6: Commit**

```bash
git add src/presentation/babylon/terrain.ts
git commit -m "feat(map): scale terrain collider, walls, and distant mountains to the bigger field

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: scatter.ts — fill the bigger field

**Files:**
- Modify: `src/presentation/babylon/scatter.ts`

- [ ] **Step 1: Widen the scatter extent**

Change `const EXTENT = 24;` to:

```ts
const EXTENT = 40; // scatter across the walkable interior (inside the ~r42 barrier)
```

- [ ] **Step 2: Scale the per-element counts (~2.7× to hold density on the 4× area)**

In `createGroundScatter`, update the four counts:

```ts
export function createGroundScatter(scene: Scene): void {
  const grass = crossCard(scene, 'grassTuft', 0.5, 3, grassMaterial(scene));
  grass.thinInstanceSetBuffer('matrix', scatterMatrices({ count: 11000, seed: 1, y: 0, minScale: 0.7, maxScale: 1.3 }).buffer, 16);

  const flowers = crossCard(scene, 'wildflower', 0.22, 2, flowerMaterial(scene));
  flowers.thinInstanceSetBuffer('matrix', scatterMatrices({ count: 1100, seed: 2, y: 0, minScale: 0.7, maxScale: 1.2 }).buffer, 16);

  const rockScatter = scatterMatrices({ count: 140, seed: 3, y: -0.05, minScale: 0.3, maxScale: 0.9 });
  const rock = rockMesh(scene);
  rock.thinInstanceSetBuffer('matrix', rockScatter.buffer, 16);
  addRockColliders(scene, rockScatter.placements);

  const bush = bushMesh(scene);
  bush.thinInstanceSetBuffer('matrix', scatterMatrices({ count: 110, seed: 4, y: 0, minScale: 0.7, maxScale: 1.3, extent: EXTENT - 2 }).buffer, 16);
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 4: Verify in the browser**

Reload, re-read `window.hub` (stale across reloads), advance the AVG intro, pump frames, `screenshot`. Expected: the enlarged field is covered with grass/flowers/rocks/bushes at roughly the previous density (not sparse), all sitting on the terrain. Check fps stays ~60:

```js
(() => { const { scene } = window.hub; const e = scene.getEngine();
  for (let i=0;i<20;i++){ e.beginFrame(); scene.render(); e.endFrame(); }
  const rc = scene.meshes.filter(m=>m.name==='rockCollider').length;
  return JSON.stringify({ fps:+e.getFps().toFixed(0), rockColliders: rc }); })()
```

Expected: `fps` ~60; `rockColliders` ≈ top-quarter of 140 (~35). If fps dips well below 60, reduce `grass` count (e.g. 11000→8000) and re-check; `log`/note the trim.

- [ ] **Step 5: Commit**

```bash
git add src/presentation/babylon/scatter.ts
git commit -m "feat(map): scale ground scatter to fill the bigger field

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: trees.ts — more trees across the bigger interior

**Files:**
- Modify: `src/presentation/babylon/trees.ts`

- [ ] **Step 1: Replace the `SPOTS` array**

Replace the `SPOTS` constant with a wider spread (~20 trees over the enlarged interior, centre kept clear of the spawn):

```ts
const SPOTS: readonly [number, number, number, number][] = [
  [12, -14, 0.3, 1.0], [-13, -12, 1.9, 1.15], [14, 13, 2.7, 0.9], [-15, 15, 0.8, 1.05],
  [26, 5, 1.2, 1.2], [-25, -7, 2.2, 1.1], [6, -28, 0.5, 1.0], [-8, 27, 3.0, 1.15],
  [30, -22, 1.7, 0.95], [-30, 22, 0.2, 1.0], [34, 12, 2.4, 1.05], [-34, -14, 1.1, 0.95],
  [18, 30, 0.9, 1.1], [-20, -30, 2.6, 1.0], [2, 34, 1.5, 1.05], [-3, -34, 0.4, 0.95],
  [36, -4, 2.0, 1.0], [-36, 6, 0.7, 1.1], [21, -33, 1.3, 0.9], [-24, 33, 2.9, 1.05],
];
```

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Verify in the browser**

Reload, re-read `window.hub`, advance the AVG intro. Confirm ~20 trees are spread across the bigger field, each seated on the terrain with a trunk collider:

```js
(() => { const { scene } = window.hub;
  const trunks = scene.meshes.filter(m=>/_trunk$/.test(m.name)).length;
  return JSON.stringify({ trunkColliders: trunks }); })()
```

Expected: `trunkColliders` = 20. `screenshot` to confirm the spread looks natural (no clumping at the origin).

- [ ] **Step 4: Commit**

```bash
git add src/presentation/babylon/trees.ts
git commit -m "feat(map): more trees spread across the enlarged field

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Final cumulative verification (DoD)

**Files:** none (verification only)

- [ ] **Step 1: Full typecheck + tests**

Run: `pnpm exec tsc --noEmit && pnpm test`
Expected: 0 type errors; all Vitest suites pass (incl. `terrainHeight`).

- [ ] **Step 2: Roam-to-edge check (the natural boundary)**

In the browser (fresh reload, advance the AVG intro), drive the knight from spawn straight toward an edge and confirm the terrain **ramps up and stops** the player (no invisible-wall bump; the barrier visibly looks steep). Drive with synthetic keys + real frames (the pane pauses rAF when backgrounded):

```js
(() => {
  const { scene } = window.hub; const engine = scene.getEngine();
  const press=(t)=>{for(const x of[window,document])x.dispatchEvent(new KeyboardEvent(t,{key:'w',code:'KeyW',keyCode:87,which:87,bubbles:true}));};
  const busy=(ms)=>{const t=Date.now();while(Date.now()-t<ms){}};
  press('keydown'); const traj=[];
  for(let f=0;f<600;f++){ engine.beginFrame(); busy(16); scene.render(); engine.endFrame(); if(f%100===0){const p=window.hub.player.root.position; traj.push([+p.x.toFixed(1),+p.y.toFixed(1),+p.z.toFixed(1)]);} }
  press('keyup');
  const p=window.hub.player.root.position;
  return JSON.stringify({ traj, finalR:+Math.hypot(p.x,p.z).toFixed(1), finalY:+p.y.toFixed(1) });
})()
```

Expected: the player advances out toward the rim then **stalls partway up the barrier** (finalR well short of 50 — roughly 42–45 — and finalY climbing as it hits the ramp), i.e. blocked by terrain, not by reaching the ±50 walls. `screenshot` there — the rim should read as a clearly-steep slope/hill.

- [ ] **Step 3: FPS on the cumulative scene**

```js
(() => { const { scene } = window.hub; const e = scene.getEngine();
  for (let i=0;i<30;i++){ e.beginFrame(); scene.render(); e.endFrame(); }
  return JSON.stringify({ fps:+e.getFps().toFixed(0), meshes: scene.meshes.length }); })()
```

Expected: `fps` ~60. If materially lower, apply the documented levers (trim grass count; or switch the terrain collider to `HEIGHTFIELD` / lower `SUBDIVISIONS`) and note what was changed.

- [ ] **Step 4: Hero screenshot for the user**

Capture a clean gameplay `screenshot` (bigger rolling field, trees/scatter spread out, the rim rising to enclose, mountains on the horizon beyond) to share.

---

## Self-Review Notes (author checklist — already applied)

- **Spec coverage:** size 50→100 (Task 1/2), barrier + natural boundary (Task 1 barrierRamp; Task 2 taller walls), mountain ring moved out+up so it stays visible (Task 2), scatter density (Task 3), more trees (Task 4), collider scaling + HEIGHTFIELD fallback (Task 2/5), tests for walkable-vs-barrier slope + golden (Task 1), roam-to-edge + fps DoD (Task 5). All spec sections mapped.
- **No domain changes:** only `src/presentation/babylon/*` + its test.
- **Constants scale together:** `FIELD` drives `HALF` (walls) and the ground size; `EXTENT`, counts, `SUBDIVISIONS`, `RING_RADIUS`, `SPOTS` updated explicitly per task.
- **Numbers validated up front:** walkable ≤ ~30°, barrier mid > 60° (blocks), terrain max ~17 < mountain-over-barrier sightline (mountains stay visible), golden values computed from the exact constants in Task 1.
- **Determinism:** `terrainHeight` seeded/pure; golden values pinned; scatter/tree layout reproducible.
