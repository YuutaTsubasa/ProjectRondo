# Shadow Quality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Status: shipped.** This plan is the historical record of what was scoped, not a description of the final state — several thresholds and code snippets below were superseded during implementation (see "Deviations from the spec" and the acceptance-threshold table's footnote). Do not execute this plan against a codebase that already has shadow quality merged; read `docs/superpowers/specs/2026-08-25-shadow-quality-design.md` §7 for what actually shipped first.

**Goal:** Make the hub render shadows at all, then make the knight's shadow legible on the ground — sharp near the camera, present at distance, with the body self-shadowing and the face not.

**Architecture:** A new `shadows.ts` owns a `CascadedShadowGenerator` (single-map `ShadowGenerator` fallback on WebGL1) behind a two-method `Shadows` interface, `cast()` and `receive()`. It is the shared mechanism every world module calls into — `shadows.ts` holds no policy of its own; who casts and who receives stays authored per module (`knight.ts`, `trees.ts`, `landmark.ts`, `scatter.ts`, and the terrain call in `hubScene.ts`). A second new module, `shadowPolicy.ts`, holds the Babylon-free head/body split so it can be unit-tested in the node env.

**Tech Stack:** TypeScript (strict, `verbatimModuleSyntax`), Babylon.js 9.21.0 deep tree-shaken imports, Vitest (`environment: 'node'`), pnpm.

**Spec:** [`docs/superpowers/specs/2026-08-25-shadow-quality-design.md`](../specs/2026-08-25-shadow-quality-design.md)

## Global Constraints

- **Babylon deep imports fail silently.** Every side-effect import gets a comment naming what breaks without it. (`shadowGeneratorSceneComponent` turned out not to be an example of this — see the shipped comment in `shadows.ts`, which was corrected after review: on the pinned @babylonjs/core 9.21.0, `ShadowGenerator`'s own constructor registers the scene component itself, so the import is currently inert and kept only against a future Babylon version moving that registration back out.)
- **`verbatimModuleSyntax: true`** — type-only imports MUST use `import type`.
- **`strict: true`** — no implicit `any`, no unchecked nulls.
- **Tests run in `environment: 'node'`** ([`vite.config.ts`](../../../vite.config.ts)). A module that imports Babylon cannot be unit-tested. Only Babylon-free modules get tests.
- **Tests live in `tests/`**, mirroring `src/` — e.g. `tests/presentation/shadowPolicy.test.ts`.
- **Prettier is NOT this project's formatter.** There is no config. Do not run it; match surrounding style by hand.
- **Measured claims only.** Never report a threshold as met without pasting the harness output. The spec's §1d records a false positive produced by skipping this.
- Commands: `pnpm test`, `pnpm typecheck`, `pnpm dev`.

## File Structure

**Create**

| File | Responsibility |
|---|---|
| `src/presentation/babylon/shadowPolicy.ts` | Babylon-free. `HEAD_MESHES` + `knightReceivesShadow()`. The single source of the head list. |
| `src/presentation/babylon/shadows.ts` | The generator, its tuning constants, and `cast`/`receive` registration. |
| `tests/presentation/shadowPolicy.test.ts` | Unit tests for the policy. |

**Modify**

| File | Change |
|---|---|
| `src/presentation/babylon/environment.ts` | Drops the generator; returns `{ sun }` only. |
| `src/presentation/babylon/hubScene.ts` | Hoists the camera above shadow creation; threads `Shadows` to every world module. |
| `src/presentation/babylon/knight.ts` | Imports `HEAD_MESHES` from `shadowPolicy`; takes `Shadows`; casts all, receives per policy. |
| `src/presentation/babylon/trees.ts` | Takes `Shadows`; casts and receives. |
| `src/presentation/babylon/landmark.ts` | Takes `Shadows`; casts and receives. |
| `src/presentation/babylon/terrain.ts` | Drops its own `receiveShadows = true`. |
| `src/presentation/babylon/scatter.ts` | Takes `Shadows`; the four base meshes receive. |
| `docs/HANDOFF.md` | New §7 gotcha for the bias-unit trap. |
| `docs/superpowers/specs/2026-08-25-shadow-quality-design.md` | §7 measurements filled in. |

### Deviations from the spec, deliberate

1. **§4a signature.** The spec wrote `createShadows(scene, sun, camera)`. `scene` is never used — the generator reaches the scene through the light. Dropped: `createShadows(sun, camera)`.
2. **§6 predicate location.** The spec put `knightReceivesShadow` in `knight.ts`. That file imports Babylon, so it cannot load in the node test env. The predicate *and* `HEAD_MESHES` move to the Babylon-free `shadowPolicy.ts`, and `knight.ts` imports the list from there. This also satisfies the spec's "cannot drift apart" requirement structurally rather than by test.
3. **`shadows` is required, not optional.** `createGroundScatter`, `createLandmark`, `loadTrees` and `loadKnight` all take `shadows: Shadows`, not `shadows?: Shadows`. `hubScene.ts` is the only caller of any of them and always supplies one; an optional parameter bought call sites that would silently ship a no-shadows scene — the exact failure class this branch exists to fix — for no benefit.
4. **"Policy reads in one place" (§4d) does not describe what shipped.** `shadows.ts` holds the generator and the two verbs; it holds no policy. Who casts and who receives is still authored per module, same as before this branch, just through a shared interface instead of a shared `ShadowGenerator` reference.

---

## Measurement Harness

Tasks 3–6 all use these probes. Run them with the Browser pane's `javascript_tool` against the dev server. `__shadowProbe` is the whole-frame darkness A/B; `__knightShadow` is the knight-isolated metric the headline figures (the Task 3 grid, Task 4's 220/408/1212 decomposition, Task 8's 1145/1190/1615 px) actually use; `__acne` is threshold 2 — not a darkness A/B, a pedestal-top ROI diffed against a deliberately over-biased reference, and it requires the plaza framing (the ROI is the pedestal top at 1280×720, only valid from that camera position); `__fpsAB` is timing.

The five numbered comments correspond to the spec's §5a steps — none of them are optional. Skipping (1) produced the false positive recorded in spec §1d.

```js
window.__shadowProbe = async ({ x = 0, z = 0 } = {}) => {
  const { engine, scene, follow } = window.hub;
  const V3 = window.charController.getPosition().constructor;
  // (1) freeze the whole frame, not just the animation. Pausing AnimationGroups alone is NOT enough:
  //     driveKnightAnimation re-plays and re-weights them every frame regardless of paused state, and
  //     that gap is what produced the §1d false positive (a 0-vs-0 control that should have read 0 read
  //     169 with only the pause applied). Physics stepping alone accounted for 59 of 64 stray control
  //     pixels, and the water ripple scrolls on its own observable entirely outside animationGroups.
  scene.animationsEnabled = false;
  scene.animationGroups.forEach((g) => g.pause());
  scene.physicsEnabled = false;
  const __water = scene.meshes.find((m) => m.name === 'water');
  const __ripple = __water && __water.material && __water.material.bumpTexture;
  if (__ripple) {
    const u = __ripple.uOffset, v = __ripple.vOffset;
    scene.onBeforeRenderObservable.add(() => { __ripple.uOffset = u; __ripple.vOffset = v; });
  }
  if (window.__hold) scene.onBeforeRenderObservable.remove(window.__hold);
  // (5) the sun travels toward -X-Z, so view from +X,-Z and the shadow lies side-on to the camera
  //     rather than hidden directly behind the knight.
  window.__hold = scene.onBeforeRenderObservable.add(() => {
    follow.camera.position.set(x + 9, 4.5, z - 9);
    follow.camera.setTarget(new V3(x - 1.5, 1.0, z + 1.5));
  });
  // Babylon 9 keys shadow generators by camera; ours is registered under the follow camera, so the
  // no-arg getShadowGenerator() returns null. Prefer the stable dev handle hubScene.ts exposes
  // (window.shadows); fall back to the camera-keyed lookup if that handle isn't there. The fallback
  // must select the sun explicitly: `getShadowGenerator` is declared on Light.prototype, so
  // `find(l => l.getShadowGenerator)` is truthy for every light, and environment.ts constructs the
  // `ambient` HemisphericLight before the `sun` DirectionalLight, so that predicate silently binds to
  // `ambient` (whose getShadowGenerator returns null) instead of falling back correctly.
  const sun = scene.lights.find((l) => l.name === 'sun');
  const sg = window.shadows?.generator ?? sun.getShadowGenerator(scene.activeCamera);
  const canvas = engine.getRenderingCanvas(), W = canvas.width, H = canvas.height, gl = engine._gl;
  const grab = () => {
    for (let i = 0; i < 8; i++) { engine.beginFrame(); scene.render(); engine.endFrame(); }
    engine.restoreDefaultFramebuffer();                     // (2) or readPixels reads the wrong target
    const px = new Uint8Array(W * H * 4);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return px;
  };
  const diff = (a, b) => { let n = 0; for (let k = 0; k < a.length; k += 4) if (Math.abs(b[k] - a[k]) > 4) n++; return n; };
  const luma = (p) => {
    let s = 0, black = 0; const n = p.length / 4;
    for (let k = 0; k < p.length; k += 4) {
      const y = 0.2126 * p[k] + 0.7152 * p[k + 1] + 0.0722 * p[k + 2];
      s += y; if (y < 1) black++;
    }
    return { mean: +(s / n).toFixed(2), crushedPct: +(100 * black / n).toFixed(3) };
  };
  const d0 = sg.getDarkness();
  sg.setDarkness(0); const on = grab();                     // (3) A/B darkness 0 against 1
  sg.setDarkness(1); const off = grab();
  sg.setDarkness(0); const control = grab();                // (4) 0-vs-0 MUST come back exactly 0
  sg.setDarkness(d0);
  return {
    shadowPixels: diff(on, off),
    controlPixels: diff(on, control),
    frame: luma(on),
    size: [W, H],
    onePercentOfFrame: Math.round(W * H / 100),
  };
};

window.__fpsAB = (rounds = 20, framesPer = 40, warmup = 10) => {
  // Never toggle scene.shadowsEnabled for this A/B: it changes material defines and forces shader
  // recompilation, so the "cost" it measures is recompilation, not shadow rendering (spec §7, "Task 6 —
  // performance", method 1). Hold every define fixed and pair shadowMap.refreshRate 1
  // (re-render the map every frame) against 0 (render once, never again) instead.
  const { engine, scene } = window.hub;
  // Match by name, not by `getShadowGenerator` presence — see the harness's __shadowProbe comment
  // above for why that predicate binds to `ambient` instead of `sun`.
  const sun = scene.lights.find((l) => l.name === 'sun');
  const sg = window.shadows?.generator ?? sun.getShadowGenerator(scene.activeCamera);
  const shadowMap = sg.getShadowMap();
  const run = () => {
    for (let i = 0; i < warmup; i++) { engine.beginFrame(); scene.render(); engine.endFrame(); }
    const t0 = performance.now();
    for (let i = 0; i < framesPer; i++) { engine.beginFrame(); scene.render(); engine.endFrame(); }
    return (performance.now() - t0) / framesPer;
  };
  const on = [], off = [];
  for (let r = 0; r < rounds; r++) {                        // round-robin, not two blocks
    shadowMap.refreshRate = 1; on.push(run());
    shadowMap.refreshRate = 0; off.push(run());
  }
  shadowMap.refreshRate = 1;
  const med = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
  return { msWithShadows: +med(on).toFixed(3), msWithout: +med(off).toFixed(3), costMs: +(med(on) - med(off)).toFixed(3) };
};
'harness ready';
```

The Task 3 grid, Task 4's 220/408/1212 px decomposition and Task 8's 1145/1190/1615 px figures all come
from this second probe, not from `__shadowProbe` above. Paste it after the harness above, once per page
load, then verify `reproducibilityControl` is 0 before trusting any reading.

```js
// One-time setup. Run this before any measurement, then verify the reproducibility control is 0.
window.__probeSetup = () => {
  const { scene, engine } = window.hub;
  const canvas = engine.getRenderingCanvas(), gl = engine._gl;
  const V3 = window.charController.getPosition().constructor;

  // Freezing the frame takes all three of these. Pausing AnimationGroups alone is NOT enough:
  // driveKnightAnimation re-plays them every frame, physics stepping moved 59 of 64 stray control
  // pixels, and the water ripple scrolls on its own observable in water.ts.
  scene.animationsEnabled = false;
  scene.animationGroups.forEach((g) => g.pause());
  scene.physicsEnabled = false;
  const water = scene.meshes.find((m) => m.name === 'water');
  const ripple = water && water.material && water.material.bumpTexture;
  if (ripple) {
    const u = ripple.uOffset, v = ripple.vOffset;
    scene.onBeforeRenderObservable.add(() => { ripple.uOffset = u; ripple.vOffset = v; });
  }

  window.__pinCamera = (x = 0, z = 0) => {          // side-on to the sun, which travels toward -X-Z
    if (window.__hold) scene.onBeforeRenderObservable.remove(window.__hold);
    window.__hold = scene.onBeforeRenderObservable.add(() => {
      window.hub.follow.camera.position.set(x + 9, 4.5, z - 9);
      window.hub.follow.camera.setTarget(new V3(x - 1.5, 1.0, z + 1.5));
    });
  };
  window.__grab = () => {
    const W = canvas.width, H = canvas.height;
    for (let i = 0; i < 8; i++) { engine.beginFrame(); scene.render(); engine.endFrame(); }
    engine.restoreDefaultFramebuffer();
    const px = new Uint8Array(W * H * 4);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return px;
  };
  window.__diff = (a, b) => {
    let n = 0;
    for (let k = 0; k < a.length; k += 4) if (Math.abs(b[k] - a[k]) > 4) n++;
    return n;
  };

  const sg = window.shadows.generator;
  const all = sg.getShadowMap().renderList.slice();
  const knight = all.filter((m) => m.skeleton);

  // The knight-isolated metric. A whole-frame darkness A/B does NOT work here: it is dominated by
  // tree and pillar shadows and read 14 640 px while the knight's own contribution was 222 px, so a
  // completely broken knight shadow would have passed. Swap the knight out of the caster list
  // instead, and use the PUBLIC add/removeShadowCaster API — mutating renderList directly corrupts
  // the generator's internal state and silently zeroes every later reading.
  window.__knightShadow = () => {
    window.__grab();
    const a = window.__grab();
    for (const m of knight) sg.removeShadowCaster(m);
    const b = window.__grab();
    for (const m of knight) sg.addShadowCaster(m);
    const c = window.__grab();
    return { px: window.__diff(a, b), restore: window.__diff(a, c) };  // restore MUST be 0
  };

  // Threshold 2. Acne requires a surface that BOTH casts and receives, so it can only be observed with
  // the caster list intact — emptying it (as an earlier version of this probe did) forces 0 px at any
  // bias and certifies nothing. Instead, hold the scene fixed and compare the candidate against a
  // deliberately over-biased reference, which cannot exhibit acne by construction. Whatever differs is
  // acne plus a small floor of legitimate self-shadow the big bias also removed; the floor is visible
  // as the point where the curve plateaus.
  //
  // Frame the plaza first: the pedestal and pillars are curved stone that both casts and receives, the
  // geometry most prone to acne in this scene.
  //   window.hub.follow.camera.position.set(-1.5, 3.0, 27.5);
  //   window.hub.follow.camera.setTarget(new V3(-6, 2.2, 32));
  // The ROI below is the pedestal top at 1280x720 in that framing. Re-derive it if you move the camera.
  window.__acne = (roi = { x0: 440, x1: 850, yTop0: 385, yTop1: 470 }) => {
    const settle = () => { for (let i = 0; i < 12; i++) window.__grab(); };
    const roiDiff = (a, b) => {
      const W = canvas.width, H = canvas.height;
      let n = 0;
      for (let yTop = roi.yTop0; yTop < roi.yTop1; yTop++)
        for (let x = roi.x0; x < roi.x1; x++) {
          const k = ((H - 1 - yTop) * W + x) * 4;      // readPixels is bottom-up
          if (Math.abs(b[k] - a[k]) > 4) n++;
        }
      return n;
    };
    const bias0 = sg.bias, nb0 = sg.normalBias;
    sg.bias = 0.005; sg.normalBias = 0.4; settle();
    const reference = window.__grab();                 // cannot have acne
    sg.bias = bias0; sg.normalBias = nb0; settle();
    const candidate = window.__grab();
    const roiPixels = (roi.x1 - roi.x0) * (roi.yTop1 - roi.yTop0);
    const px = roiDiff(reference, candidate);
    return { acnePx: px, roiPixels, sharePct: +(100 * px / roiPixels).toFixed(2) };
  };

  window.__pinCamera(0, 0);
  for (let i = 0; i < 40; i++) window.__grab();       // settle: receiver shader variants compile lazily
  const a = window.__grab(), b = window.__grab();
  return { reproducibilityControl: window.__diff(a, b), casters: all.length, knightMeshes: knight.length };
};
```

**Every reading is invalid unless `reproducibilityControl` is 0 and the returned `restore` is 0.**
Both controls exist because this branch produced six separate confident-but-wrong measurements; one of
them read 0 px with *both* controls at zero because receiver shader variants had not finished
compiling. Re-run `__probeSetup` after any change to `receiveShadows`, and settle before measuring.

**Acceptance thresholds** (spec §5b), in the units this harness reports at 1280×720:

| # | Check | Threshold |
|---|---|---|
| 1 | Knight ground shadow present | ~~`shadowPixels` ≥ 2000~~ — invented, unphysical; retracted and replaced with reproducibility-based criteria (spec §5b) |
| 2 | No shadow acne | ~~`shadowPixels` < 922 (0.1% of frame) when aimed at open ground with no caster in view~~ — structurally invalid; acne requires a surface that both casts and receives, which "no caster in view" rules out by construction. Replaced by spec §7 Task 8: pedestal-top pixels differing from an over-biased reference, 360 px (1.0% of the 34 850 px ROI) at the shipped `normalBias = 0.04` — converted to the original criterion's own denominator that is 360 / 921 600 = 0.039% of frame, under the < 0.1%-of-frame bar. The replacement passes. |
| 3 | Tint did not brighten the scene | `frame.mean` within ±5% of the pre-change value; `frame.crushedPct` not higher |
| 4 | Perf | ~~`costMs` < 1.5~~ — unmeasured, not passed; every sample on this branch was taken through a hidden, GPU-throttled Browser pane (spec §7, "Task 6 — performance") |

Thresholds 1, 2 and 4 are shown struck through as originally scoped; all three were retracted during implementation rather than met as originally written. See spec §5b and §7 for the corrected criteria and the full measured record.

---

## Task 1: The pure shadow policy module

**Files:**
- Create: `src/presentation/babylon/shadowPolicy.ts`
- Create: `tests/presentation/shadowPolicy.test.ts`
- Modify: `src/presentation/babylon/knight.ts:81` (delete the local `HEAD_MESHES`, import it instead)

**Interfaces:**
- Consumes: nothing.
- Produces: `HEAD_MESHES: readonly string[]` and `knightReceivesShadow(meshName: string): boolean`, both from `src/presentation/babylon/shadowPolicy.ts`. Task 4 calls `knightReceivesShadow`; `knight.ts` keeps using `HEAD_MESHES` for its face-material logic exactly as before.

- [ ] **Step 1: Write the failing test**

Create `tests/presentation/shadowPolicy.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { HEAD_MESHES, knightReceivesShadow } from '../../src/presentation/babylon/shadowPolicy';

describe('knightReceivesShadow', () => {
  it('excludes every head mesh', () => {
    for (const name of HEAD_MESHES) expect(knightReceivesShadow(name)).toBe(false);
  });

  it('includes body meshes', () => {
    expect(knightReceivesShadow('tripo_part_1')).toBe(true);
    expect(knightReceivesShadow('tripo_part_17')).toBe(true);
  });

  it('matches whole names, not prefixes', () => {
    // 'Mesh_3' must not be swallowed by the 'Mesh_33' entry.
    expect(knightReceivesShadow('Mesh_3')).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test shadowPolicy`
Expected: FAIL — cannot resolve `../../src/presentation/babylon/shadowPolicy`.

- [ ] **Step 3: Write the implementation**

Create `src/presentation/babylon/shadowPolicy.ts`:

```ts
// Pure shadow policy — NO babylon imports, so it unit-tests in the node env (see vite.config.ts,
// `environment: 'node'`). knight.ts imports HEAD_MESHES from here rather than declaring its own, so
// the face-material list and the shadow-receiver list cannot drift apart.

/** The three meshes that make up the knight's head. Mesh_0 is face, hair AND the neck collar. */
export const HEAD_MESHES: readonly string[] = ['Mesh_0', 'Mesh_32', 'Mesh_33'];

/**
 * True for every knight mesh that should receive the sun's shadow — everything but the head.
 *
 * The head still CASTS; it just never has a shadow drawn onto it. A shadow edge across a stylised
 * face reads badly, and the face is among the lowest-resolution regions of the shadow map, so it is
 * where stair-stepping would show first. Because Mesh_0 carries the neck collar too, the collar
 * does not receive either — the same coupling FACE_EMISSIVE already lives with.
 */
export function knightReceivesShadow(meshName: string): boolean {
  return !HEAD_MESHES.includes(meshName);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test shadowPolicy`
Expected: PASS, 3 tests.

- [ ] **Step 5: Point knight.ts at the shared list**

In `src/presentation/babylon/knight.ts`, delete line 81:

```ts
const HEAD_MESHES: readonly string[] = ['Mesh_0', 'Mesh_32', 'Mesh_33'];
```

and add to the import block at the top of the file:

```ts
import { HEAD_MESHES } from './shadowPolicy';
```

Leave every existing *use* of `HEAD_MESHES` (lines ~123, ~160, ~165, ~172) untouched.

- [ ] **Step 6: Verify nothing broke**

Run: `pnpm typecheck && pnpm test`
Expected: tsc clean; 131 tests pass (128 existing + 3 new).

- [ ] **Step 7: Commit**

```bash
git add src/presentation/babylon/shadowPolicy.ts tests/presentation/shadowPolicy.test.ts src/presentation/babylon/knight.ts
git commit -m "feat(shadows): pure head/body shadow policy, shared with knight.ts"
```

---

## Task 2: The shadows module, wired end-to-end

This is the task that makes shadows exist. It is one task because a half-wired scene does not run: `environment.ts` stops returning a generator, so every call site must move in the same commit.

**Files:**
- Create: `src/presentation/babylon/shadows.ts`
- Modify: `src/presentation/babylon/environment.ts:6-8,17-20,74,99-103`
- Modify: `src/presentation/babylon/hubScene.ts:47,54-62,70,77`
- Modify: `src/presentation/babylon/terrain.ts:125`
- Modify: `src/presentation/babylon/knight.ts:372-390`
- Modify: `src/presentation/babylon/trees.ts:97,127-128`
- Modify: `src/presentation/babylon/landmark.ts:59,79,92`

**Interfaces:**
- Consumes: nothing from Task 1 (Task 4 is what uses the policy).
- Produces: `interface Shadows { readonly generator: ShadowGenerator; cast(...meshes: readonly AbstractMesh[]): void; receive(...meshes: readonly AbstractMesh[]): void }` and `createShadows(sun: DirectionalLight, camera: Camera): Shadows`, both from `src/presentation/babylon/shadows.ts`. Also `Environment` narrows to `{ readonly sun: DirectionalLight }`.

- [ ] **Step 1: Create the shadows module**

Create `src/presentation/babylon/shadows.ts`:

```ts
import type { Camera } from '@babylonjs/core/Cameras/camera';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { CascadedShadowGenerator } from '@babylonjs/core/Lights/Shadows/cascadedShadowGenerator';
// Side-effect: registers the shadow-map render component. Without it BOTH generators below produce
// no shadows at all, silently — the same class of failure as the StandardMaterial shader import.
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent';

/** Per-cascade resolution. Four of these is roughly an 8 MB half-float texture array. */
const MAP_SIZE = 1024;
/** Babylon's DEFAULT_CASCADES_COUNT is also 4; set explicitly so the memory note above reads. */
const CASCADES = 4;
/** Split distribution: 1 is fully logarithmic (resolution hugs the camera), 0 fully uniform. */
const LAMBDA = 0.8;
/** Shadows stop here. Beyond ~120 units the fog (density 0.0076) has already taken ~60% of the contrast. */
const SHADOW_MAX_Z = 120;
/** Fraction of each cascade blended into the next, hiding the seam. First knob to drop for frame time. */
const CASCADE_BLEND = 0.1;
/**
 * Starting values only — Task 3 replaces them with a measured pair.
 *
 * `bias` is an offset in the light's NORMALIZED depth range, not in world units, so its world-space
 * size scales with the light frustum's depth. That is what broke shadows before this module existed:
 * 0.002 over an auto-extended 83.7-unit ortho box was ~0.2 world units and swallowed every shadow.
 */
const BIAS = 0.0005;
const NORMAL_BIAS = 0.02;
/** 0 is an opaque black shadow, 1 is no shadow. Lifted slightly so shadows are not crushed. */
const DARKNESS = 0.15;
/** Single-map fallback resolution when cascades are unavailable (WebGL1). */
const FALLBACK_MAP_SIZE = 2048;

export interface Shadows {
  /** The live generator — CascadedShadowGenerator, or a plain ShadowGenerator on WebGL1. */
  readonly generator: ShadowGenerator;
  cast(...meshes: readonly AbstractMesh[]): void;
  receive(...meshes: readonly AbstractMesh[]): void;
}

/**
 * Builds the sun's shadow generator and hands back the only two verbs the rest of the scene needs.
 *
 * Must be called AFTER `scene.activeCamera` is set: cascade splits are derived from the camera, and
 * `CascadedShadowGenerator.IsSupported` reads `EngineStore.LastCreatedEngine`, so the engine has to
 * exist too. `hubScene.ts` orders it that way on purpose.
 */
export function createShadows(sun: DirectionalLight, camera: Camera): Shadows {
  let generator: ShadowGenerator;
  if (CascadedShadowGenerator.IsSupported) {
    const csm = new CascadedShadowGenerator(MAP_SIZE, sun, false, camera);
    csm.numCascades = CASCADES;
    csm.lambda = LAMBDA;
    csm.shadowMaxZ = SHADOW_MAX_Z;
    // The camera never stops moving in a third-person game; without stabilization the cascade
    // edges shimmer against the grass every frame, which reads worse than the resolution it costs.
    csm.stabilizeCascades = true;
    csm.cascadeBlendPercentage = CASCADE_BLEND;
    generator = csm;
  } else {
    console.warn('[shadows] cascaded shadow maps unavailable — falling back to a single shadow map.');
    generator = new ShadowGenerator(FALLBACK_MAP_SIZE, sun);
  }

  // CascadedShadowGenerator accepts only FILTER_NONE, FILTER_PCF and FILTER_PCSS; anything else is
  // logged as an error and silently downgraded to FILTER_NONE.
  generator.usePercentageCloserFiltering = true;
  generator.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
  generator.bias = BIAS;
  generator.normalBias = NORMAL_BIAS;
  generator.setDarkness(DARKNESS);

  // Zero-vertex meshes are boundary walls, collider proxies and glTF __root__ nodes. They would
  // render nothing into the map but still cost a draw call per cascade.
  const hasGeometry = (mesh: AbstractMesh) => mesh.getTotalVertices() > 0;

  return {
    generator,
    cast: (...meshes) => {
      for (const mesh of meshes) if (hasGeometry(mesh)) generator.addShadowCaster(mesh);
    },
    receive: (...meshes) => {
      for (const mesh of meshes) if (hasGeometry(mesh)) mesh.receiveShadows = true;
    },
  };
}
```

Superseded by what shipped: the "zero-vertex meshes are boundary walls, collider proxies and glTF
`__root__` nodes" rationale above is wrong and was retracted. `bound_*` walls (`CreateBox`) and rock
collider proxies (`CreateSphere`) both carry vertices; `hasGeometry` never excludes them. They stay out
of the shadow render list only because they are never passed to `cast()`/`receive()` in the first
place — the guard catches `__root__` nodes and other empty transform nodes only. The shipped comment on
`hasGeometry` says this explicitly. `cast()`'s `generator.addShadowCaster(mesh)` call above is also the
pre-fix form; the shipped call is `generator.addShadowCaster(mesh, false)` — `includeDescendants`
defaults to `true` and would walk each mesh's children unfiltered, bypassing `hasGeometry` for any
zero-vertex descendant and making `cast()` reach further than `receive()` for the same mesh list. Every
caller already hands `cast()` a flat, pre-filtered list, so it is disabled.

- [ ] **Step 2: Strip the generator out of environment.ts**

In `src/presentation/babylon/environment.ts`, delete lines 6-8:

```ts
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
// Side-effect: registers the shadow-map render component. Without it the ShadowGenerator produces no shadows.
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent';
```

Narrow the interface (lines 17-20) to:

```ts
export interface Environment {
  readonly sun: DirectionalLight;
}
```

Replace the doc comment on line 74 with:

```ts
/** Builds the outdoor atmosphere: gradient skydome, a directional sun, and a dim ambient fill.
 *  The sun's shadow generator lives in `shadows.ts` — it needs the camera, which does not exist yet. */
```

And replace lines 99-103 with:

```ts
  return { sun };
```

- [ ] **Step 3: Drop terrain's own receiveShadows**

In `src/presentation/babylon/terrain.ts`, delete line 125:

```ts
  terrain.receiveShadows = true;
```

`createTerrain` already returns `terrain`; `hubScene.ts` registers it in Step 5.

- [ ] **Step 4: Swap the three caster call sites to `Shadows`**

`src/presentation/babylon/knight.ts` — change the import on line 4 from `ShadowGenerator` to:

```ts
import type { Shadows } from './shadows';
```

change the parameter (line 375):

```ts
  shadows?: Shadows,
```

and replace lines 389-390:

```ts
  // The knight casts the sun's shadow onto the grass. Receivers are set in Task 4.
  shadows?.cast(...result.meshes);
```

`src/presentation/babylon/trees.ts` — change the import on line 5 to `import type { Shadows } from './shadows';`, the signature on line 97 to `export async function loadTrees(scene: Scene, shadows?: Shadows): Promise<void> {`, and replace lines 127-128 with:

```ts
    // Trees both cast and catch each other's shadows. `cast`/`receive` skip zero-vertex nodes, so
    // the explicit getTotalVertices guard that used to live here is no longer needed.
    if (shadows) {
      const meshes = root.getChildMeshes(false);
      shadows.cast(...meshes);
      shadows.receive(...meshes);
    }
```

`src/presentation/babylon/landmark.ts` — change the import on line 2 to `import type { Shadows } from './shadows';`, the signature on line 59 to `export function createLandmark(scene: Scene, shadows?: Shadows): void {`, replace line 79 with:

```ts
    if (shadows) { shadows.cast(pillar); shadows.receive(pillar); }
```

and line 92 with:

```ts
  if (shadows) { shadows.cast(pedestal); shadows.receive(pedestal); }
```

- [ ] **Step 5: Reorder hubScene.ts**

In `src/presentation/babylon/hubScene.ts`, add to the import block:

```ts
import { createShadows } from './shadows';
```

Change line 47 to `const { sun } = createEnvironment(scene);`, then replace the block currently spanning lines 54-62 (`createTerrain` … `createAtmosphere`) with:

```ts
  // The camera is hoisted above the world build because cascaded shadow maps derive their splits
  // from the active camera. It depends only on playerRoot and the canvas — not on physics, the
  // terrain or the player controller — so moving it earlier is safe.
  const playerRoot = new TransformNode('player', scene);
  const follow = createFollowCamera(scene, playerRoot, canvas);
  scene.activeCamera = follow.camera;
  const shadows = createShadows(sun, follow.camera);

  const terrain = createTerrain(scene);
  shadows.receive(terrain);
  createGroundScatter(scene);
  createWater(scene);
  createLandmark(scene, shadows);

  createAtmosphere(scene, follow.camera);
```

Delete the now-duplicated `playerRoot` / `follow` / `scene.activeCamera` / `createAtmosphere` lines that followed. Change the knight and tree calls to pass `shadows`:

```ts
  const knight = await loadKnight(scene, playerRoot, shadows);
  ...
  await loadTrees(scene, shadows);
```

- [ ] **Step 6: Typecheck and test**

Run: `pnpm typecheck && pnpm test`
Expected: tsc clean; 131 tests pass.

- [ ] **Step 7: Verify shadows now exist**

Start `pnpm dev`, open the Browser pane, paste the Measurement Harness, then run:

```js
await window.__shadowProbe();
```

Expected: `controlPixels: 0` and `shadowPixels` well above 0. Record the number — Task 3 tunes from it. If `shadowPixels` is 0, do NOT proceed; the likely causes in order are a missing `shadowGeneratorSceneComponent` import, `createShadows` running before `scene.activeCamera` is set, or `BIAS` still too large.

- [ ] **Step 8: Commit**

```bash
git add src/presentation/babylon/shadows.ts src/presentation/babylon/environment.ts src/presentation/babylon/hubScene.ts src/presentation/babylon/terrain.ts src/presentation/babylon/knight.ts src/presentation/babylon/trees.ts src/presentation/babylon/landmark.ts
git commit -m "feat(shadows): cascaded shadow maps behind a Shadows module"
```

---

## Task 3: Measure and fix the bias

**Files:**
- Modify: `src/presentation/babylon/shadows.ts` (the `BIAS` and `NORMAL_BIAS` constants)
- Modify: `docs/superpowers/specs/2026-08-25-shadow-quality-design.md` (§7)

**Interfaces:**
- Consumes: `createShadows` from Task 2.
- Produces: measured `BIAS` and `NORMAL_BIAS` values. Tasks 4–6 assume shadows are visible and acne-free.

- [ ] **Step 1: Sweep both parameters**

With the harness loaded, run the knight-present case at the origin:

```js
(async () => {
  // getShadowGenerator() with no argument returns null — Babylon 9 keys generators by camera, and
  // ours is registered under the follow camera. Prefer the stable window.shadows dev handle; if it
  // isn't there, match the light by name rather than by `getShadowGenerator` presence — that method
  // is declared on Light.prototype, so it is truthy for every light, and environment.ts constructs
  // `ambient` before `sun`, so a presence check silently binds to `ambient` (getShadowGenerator ->
  // null) instead of `sun`.
  const { scene } = window.hub;
  const sun = scene.lights.find(l => l.name === 'sun');
  const sg = window.shadows?.generator ?? sun.getShadowGenerator(scene.activeCamera);
  // Use the knight-isolated probe, not __shadowProbe's whole-frame darkness A/B: the whole-frame
  // reading is dominated by tree and pillar shadows (14 640 px, against the knight's own 222 px — see
  // the __probeSetup comment above), so it cannot resolve what this grid is tuning. __probeSetup()
  // must have been run once already; it pins the camera at the origin.
  const rows = [];
  for (const b of [0, 1e-4, 2.5e-4, 5e-4, 1e-3])
    for (const nb of [0, 0.01, 0.02, 0.04]) {
      sg.bias = b; sg.normalBias = nb;
      const { px, restore } = window.__knightShadow();
      rows.push({ bias: b, normalBias: nb, px, restore });
    }
  return rows;
})()
```

- [ ] **Step 2: Sweep the acne case**

Teleport the knight to open ground with no tree in frame and repeat, so the same pairs are measured for false shadow on unoccluded terrain:

```js
window.charController.setPosition(new (window.charController.getPosition().constructor)(20, 5, 20));
```

Step 1's loop uses `window.__knightShadow()`, which takes no arguments and has no framing parameter —
the camera framing comes from `__probeSetup`'s `__pinCamera(x, z)` instead, and its own comment notes
that `__probeSetup()` pins the camera at the origin by default. So before re-running, move the pin to
match the teleport:

```js
window.__pinCamera(20, 20);
```

Then re-run the Step 1 loop unchanged (same sweep, same `const { px, restore } = window.__knightShadow();`
call). Here `px` is the acne count and ~~must come in **under 922**~~ — still worth recording as raw sweep data, but this pass/fail bar is retracted (see below).

- [ ] **Step 3: Pick the pair and edit the constants**

~~Choose the smallest `(bias, normalBias)` satisfying threshold 1 (≥ 2000 px, knight case) and threshold 2 (< 922 px, open-ground case). Update `BIAS` and `NORMAL_BIAS` in `shadows.ts`. If no pair satisfies both, stop and report — that means `stabilizeCascades` or `numCascades` needs revisiting, which is a design change, not a tuning one.`~~

Superseded by what shipped: both criteria above are the same retracted thresholds struck through in
the Task 3 preamble's table (rows 1 and 2). No `(bias, normalBias)` pair reaches 2000 px at this
geometry — this is not a sign the design is broken, and reaching the "stop and report" sentence
above is not a signal to revisit `stabilizeCascades`/`numCascades`. Use spec §5c's corrected rule
instead: take the smallest pair where the knight's ground shadow is non-zero and reproducible with a
zero restore-control (replacing threshold 1), and where the Task 8 pedestal-top ROI acne diff — not
the empty-caster-list reading Step 2 above produces — is at the curve's floor (replacing threshold 2).
The shipped values, `BIAS = 0.0001` and `NORMAL_BIAS = 0.04`, were picked by that rule; see spec §7
Task 3 and Task 8 for the measured tables.

- [ ] **Step 4: Re-verify against the edited source**

Reload the page (the dev server forces a full reload on any source change) and run ~~`await window.__shadowProbe()` once more. Confirm thresholds 1 and 2 both hold with the values now in the file, not just in the console.~~

Superseded by Step 3's note above: thresholds 1 and 2 as originally defined are retracted, and
`__shadowProbe` cannot check either replacement. Re-verify threshold 1's replacement with
`window.__knightShadow()` (non-zero `px`, `restore` 0). Threshold 2's replacement is the Task 8
pedestal-top ROI diff — reload, frame the plaza (the camera pose in the `__acne` setup comment above),
run `window.__probeSetup()`, then `window.__acne()` — this cannot be done from this step's origin
framing.

- [ ] **Step 5: Record both tables in the spec**

Replace the placeholder body of §7 in the spec with the two sweep tables and a sentence naming the chosen pair and why.

- [ ] **Step 6: Commit**

```bash
git add src/presentation/babylon/shadows.ts docs/superpowers/specs/2026-08-25-shadow-quality-design.md
git commit -m "fix(shadows): measured bias and normalBias"
```

---

## Task 4: Extend the receivers — and test the grass hypothesis

Spec §1b claims the missing `receiveShadows` flags are why the knight's shadow is drowned out by grass. **That claim is not established** — a runtime probe with `bias` already at 0 changed nothing visible. This task is the checkpoint that settles it.

**Files:**
- Modify: `src/presentation/babylon/scatter.ts:237-251`
- Modify: `src/presentation/babylon/hubScene.ts` (pass `shadows` to `createGroundScatter`)
- Modify: `src/presentation/babylon/knight.ts:389`
- Modify: `docs/superpowers/specs/2026-08-25-shadow-quality-design.md` (§1b verdict, §7)

**Interfaces:**
- Consumes: `knightReceivesShadow` from Task 1; `Shadows` from Task 2.
- Produces: `createGroundScatter(scene: Scene, shadows?: Shadows): void` — a second parameter added to the existing export.

- [ ] **Step 1: Capture the before number**

~~Before changing anything, run `await window.__shadowProbe()` and save `shadowPixels`. This is the baseline the hypothesis is judged against.~~

Superseded: `__shadowProbe`'s whole-frame `shadowPixels` cannot resolve this hypothesis — the harness
preamble above and `__probeSetup`'s own comment say so (a whole-frame A/B read 14 640 px while the
knight's own contribution was 222 px, so a completely broken knight shadow would have passed). The
baseline actually judged against is `__knightShadow`'s knight-isolated figure, decomposed into
configuration A (neither ground detail nor body receives): 220 px. See spec §7 Task 4.

- [ ] **Step 2: Make ground detail receive**

In `src/presentation/babylon/scatter.ts`, add `import type { Shadows } from './shadows';`, change the signature to:

```ts
export function createGroundScatter(scene: Scene, shadows?: Shadows): void {
```

and add as the last statement of the function body:

```ts
  // Ground detail receives but never casts. 16 000 alpha-tested cross cards redrawn once per
  // cascade is the most expensive option on the table and reads as speckle noise, not foliage.
  shadows?.receive(grass, flowers, rock, bush);
```

Superseded by Task 7 (spec §7, not a task in this file): rock and bush were measured to cast cheaply
and read as intended contact shadows, so the shipped function also calls `shadows.cast(rock, bush)`.
Grass and flowers stay cast-off for the reason in the comment above. The shipped signature is also
`shadows: Shadows` (required), not `shadows?: Shadows` — see "Deviations from the spec" note 3.

- [ ] **Step 3: Pass shadows in**

In `src/presentation/babylon/hubScene.ts`, change `createGroundScatter(scene);` to `createGroundScatter(scene, shadows);`.

- [ ] **Step 4: Apply the knight body/face split**

In `src/presentation/babylon/knight.ts`, add `import { knightReceivesShadow } from './shadowPolicy';` (merging with the `HEAD_MESHES` import added in Task 1) and replace the cast line from Task 2 with:

```ts
  // The whole knight casts — including the head, so its shadow lands on the ground and the
  // shoulders. Only the body receives; a shadow edge across the face reads badly.
  if (shadows) {
    shadows.cast(...result.meshes);
    shadows.receive(...result.meshes.filter((m) => knightReceivesShadow(m.name)));
  }
```

- [ ] **Step 5: Typecheck and test**

Run: `pnpm typecheck && pnpm test`
Expected: tsc clean; 131 tests pass.

- [ ] **Step 6: Judge the hypothesis**

~~Reload and run `await window.__shadowProbe()`. Compare `shadowPixels` against the Step 1 baseline, and take a screenshot of the knight standing in dense grass.~~

Superseded, same reason as Step 1: judge with `__knightShadow()` instead, decomposed into the three
configurations spec §7 Task 4 records — A: neither ground detail nor body receives, 220 px; B: ground
detail only, 408 px (+188 from grass); C: ground detail and body, 1212 px (+804 from self-shadow).
Removing the knight from the caster list removes both its ground shadow and its self-shadow at once,
so a single before/after `__knightShadow()` reading conflates the two causes and cannot separate them
either — the three-configuration decomposition is required, not optional. Take a screenshot of the
knight standing in dense grass as before.

- If the number rose meaningfully and the shadow visibly crosses the grass blades, §1b is **confirmed**.
- If it barely moved, §1b is **refuted** and the real limit is texel density (§1c). Say so plainly and report it; the follow-up would be raising `MAP_SIZE` or lowering `SHADOW_MAX_Z`, which is a new decision for the user, not something to do silently here.

Either way, replace the §1b hypothesis paragraph in the spec with the verdict and the two numbers.

- [ ] **Step 7: Commit**

```bash
git add src/presentation/babylon/scatter.ts src/presentation/babylon/hubScene.ts src/presentation/babylon/knight.ts docs/superpowers/specs/2026-08-25-shadow-quality-design.md
git commit -m "feat(shadows): ground detail receives; knight body self-shadows, face does not"
```

---

## Task 5: Lift and tint the shadows

**Files:**
- Modify: `src/presentation/babylon/environment.ts:89-91`
- Modify: `docs/superpowers/specs/2026-08-25-shadow-quality-design.md` (§7)

**Interfaces:**
- Consumes: `HORIZON_HEX` from `./atmosphereColors` (already imported by `environment.ts` at line 15).
- Produces: nothing new; `DARKNESS = 0.15` was already set in Task 2.

- [ ] **Step 1: Capture the before frame**

~~Run `await window.__shadowProbe()` and save `frame.mean` and `frame.crushedPct`. Threshold 3 is measured against these.~~

Superseded (spec §7 Task 5): this cross-reload before/after comparison is retracted. An earlier pass
measured "before" (reload, `groundColor` black) against "after" (reload, `groundColor` tinted) and
both returned `frame.mean` = 138.00 exactly — a reload artifact, not a real measurement; do not reuse
that baseline. Threshold 3 is instead judged by toggling `groundColor` within a **single page state**
(same framing, same settle, zero reload). The pre-tint reading by that method is `frame.mean` =
**114.11**, `frame.crushedPct` = **0**. `__shadowProbe()` performs the full three-part freeze itself
(step (1) above) before grabbing frames, so this measurement is valid whether or not `__probeSetup()`
has been run first.

- [ ] **Step 2: Tint the ambient**

In `src/presentation/babylon/environment.ts`, add near the other module constants:

```ts
/** How much of the horizon colour the ambient's ground half carries. See the comment at its use. */
const AMBIENT_GROUND_SCALE = 0.35;
```

and replace lines 89-91 with:

```ts
  // Ambient fill — dim so the sun's shadow stays visible (was intensity 1 as the only light).
  const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), scene);
  ambient.intensity = 0.45;
  // Shadowed surfaces are lit by ambient alone, so tinting the ground half of the hemisphere toward
  // the sky colour is what makes shadows read as sky-blue rather than dead grey. Scaled well below
  // full because groundColor defaults to BLACK: the undimmed #dcecf7 would nearly double the ambient
  // term on every downward-facing surface and brighten the whole scene, not just the shadows.
  ambient.groundColor = Color3.FromHexString(HORIZON_HEX).scale(AMBIENT_GROUND_SCALE);
```

- [ ] **Step 3: Measure threshold 3**

~~Reload and run `await window.__shadowProbe()`. `frame.mean` must be within ±5% of the Step 1 value and `frame.crushedPct` must not be higher. If `mean` overshoots, lower `AMBIENT_GROUND_SCALE` and repeat; record every value tried, not just the one that passed.~~

Superseded, same reason as Step 1: do not reload between readings. In the same page state, toggle
`groundColor` and compare `__shadowProbe()`'s `frame.mean`/`frame.crushedPct` against the Step 1
single-page-state baseline (114.11 / 0); the ±5% allowance and the "lower `AMBIENT_GROUND_SCALE` and
repeat" instruction still apply. Adopted result: scale 0.30 gives `frame.mean` = 119.62 (+4.83%),
`crushedPct` = 0.001, within threshold — see spec §7 Task 5's full sweep table. As in Step 1,
`__shadowProbe()` freezes the frame itself, so no separate `__probeSetup()` call is required here.

- [ ] **Step 4: Screenshot for the art call**

Capture the knight in shadow, side-on, and share it. `DARKNESS` (0.15) and `AMBIENT_GROUND_SCALE` are art-direction knobs — if the user wants them moved, that is a normal adjustment, not a failure.

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck && pnpm test`
Expected: tsc clean; 131 tests pass.

- [ ] **Step 6: Record and commit**

Add the tried scale factors and the final luma numbers to spec §7.

```bash
git add src/presentation/babylon/environment.ts docs/superpowers/specs/2026-08-25-shadow-quality-design.md
git commit -m "feat(shadows): lift shadows off black and tint them toward the sky"
```

---

## Task 6: Perf, docs, and the handoff gotcha

**Files:**
- Modify: `docs/HANDOFF.md` (new bullet in §7, which starts at line 164)
- Modify: `docs/superpowers/specs/2026-08-25-shadow-quality-design.md` (§7 perf row)

**Interfaces:**
- Consumes: everything above. Produces: nothing consumed by later tasks.

- [ ] **Step 1: Measure the cost**

Run `window.__fpsAB()`. Threshold 4 is `costMs < 1.5`. This pairs `shadowMap.refreshRate` 1 against 0 with every define held fixed — never `scene.shadowsEnabled`, which forces shader recompilation and times that instead of shadow rendering. It is still a within-session delta, because HANDOFF §5 records that P2's and P3's absolute figures came from different machines and are not comparable. Run it only with the Browser pane visible — a hidden/backgrounded pane GPU-throttles the page and invalidates every sample (spec §7, "Task 6 — performance").

If `costMs` exceeds 1.5, the ordered knobs are `cascadeBlendPercentage` → 0, then `numCascades` → 3, then `MAP_SIZE` → 512. Apply the smallest change that lands under budget and record what was tried.

- [ ] **Step 2: Add the HANDOFF gotcha**

Append to §7 of `docs/HANDOFF.md`:

```markdown
- **`ShadowGenerator.bias` is normalized light-space depth, not world units.** Its world-space size
  scales with the light frustum's depth range, so the "safe" value depends entirely on how big the
  shadow frustum is. A `bias` of 0.002 over an `autoUpdateExtends` frustum covering the whole hub
  (83.7 x 65.3 units) worked out to roughly 0.2 world units and silently suppressed *every* shadow in
  the scene for three phases — the receiver shaders compiled with `SHADOW1`/`SHADOWPCF1` and the map
  re-rendered every frame, so nothing looked wrong anywhere except the picture. Only objects thicker
  than the offset cast at all. If you change the cascade count, `shadowMaxZ`, or swap the generator,
  re-run the sweep in `docs/superpowers/specs/2026-08-25-shadow-quality-design.md` §7 — the old value
  will not carry over.
- **Verifying shadows: freeze the animations first.** A darkness-on/darkness-off pixel diff with the
  idle clip running measures the character *moving between the two captures*, not shadow. That
  produced a confident, wrong "shadows are working" reading. Always pause every `AnimationGroup`,
  always run the 0-vs-0 control (it must come back exactly 0), and always place the camera side-on to
  the sun — the sun travels toward -X-Z, so a camera on the +X+Z side hides the shadow behind its own
  caster. The harness is in the plan: `docs/superpowers/plans/2026-08-25-shadow-quality.md`.
```

Superseded by what shipped: "pause every `AnimationGroup`" turned out not to be enough by itself —
`driveKnightAnimation` re-plays and re-weights the groups every frame regardless of their paused
state, so a 0-vs-0 control that should have read 0 read 169 with only the pause applied. The
`__probeSetup` harness earlier in this file already carries the fix, and the shipped
`docs/HANDOFF.md` §7 bullet ("Verifying shadows: freeze the whole frame, not just the animation")
states the corrected three-part freeze: `scene.animationsEnabled = false` (the mechanism that
actually stops the knight — pausing groups alone does not), `scene.physicsEnabled = false` (physics
stepping alone accounted for 59 of 64 stray control pixels), and pinning the water ripple, which
scrolls independently of `animationGroups` on its own `onBeforeRenderObservable` in `water.ts`. Use
the shipped HANDOFF text, not the block above.

- [ ] **Step 3: Fill in the spec's perf row**

Add the `__fpsAB` output to §7 and mark the four acceptance thresholds pass/fail with their numbers.

- [ ] **Step 4: Final verification**

Run: `pnpm typecheck && pnpm test`
Expected: tsc clean; 131 tests pass.

- [ ] **Step 5: Commit**

```bash
git add docs/HANDOFF.md docs/superpowers/specs/2026-08-25-shadow-quality-design.md
git commit -m "docs(shadows): record the measurements and the bias-unit gotcha"
```

---

## Self-Review

**Spec coverage**

| Spec section | Task |
|---|---|
| §4a `Shadows` interface, zero-vertex guard | 2 (signature deviation noted above) |
| §4b `environment.ts` gives up the generator | 2 |
| §4c `hubScene.ts` init order | 2 |
| §4d call sites, `terrain.ts:125` removal | 2 |
| §4e cascade configuration | 2 |
| §4f bias measured, not guessed | 3 |
| §4g darkness 0.15 | 2 (constant) + 5 (tint) |
| §4h cast/receive policy — terrain | 2 |
| §4h — grass, flowers, rocks, bushes | 4 |
| §4h — trees, pillars, pedestal | 2 |
| §4h — knight body yes, head no | 4 |
| §4h — water, sky, mountains excluded | covered by omission; nothing registers them |
| §5a harness (all five steps) | Measurement Harness section |
| §5b thresholds 1–4 | 3, 4, 5, 6 respectively |
| §5c tuning procedure | 3 |
| §6 pure predicate + tests | 1 (relocated to `shadowPolicy.ts`, noted above) |
| §7 measurements | 3, 4, 5, 6 all write to it |
| §8 follow-ups | deliberately not implemented |

**Placeholder scan:** none. Every code step carries the literal text to write; the two "record the numbers" steps are outputs of a command given in the same task.

**Type consistency:** `Shadows`, `createShadows(sun, camera)`, `cast`, `receive`, `generator`, `HEAD_MESHES`, `knightReceivesShadow`, `createGroundScatter(scene, shadows?)` are spelled identically in every task that mentions them. `Environment` narrows to `{ sun }` in Task 2 and no later task expects `shadowGenerator` on it.

**One risk flagged for the executor:** Task 2 Step 5 is the only step that both moves and deletes lines. After it, confirm `playerRoot`, `follow`, `scene.activeCamera` and `createAtmosphere` each appear exactly once in `hubScene.ts`.
