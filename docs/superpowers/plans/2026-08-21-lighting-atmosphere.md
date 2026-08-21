# Lighting & Atmosphere (P2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the hub visible depth — ACES tone mapping, a restrained bloom and distance fog tuned to the scene's geometry — without changing the palette.

**Architecture:** One new module, `postProcessing.ts`, owns a `DefaultRenderingPipeline` on the follow camera plus the scene's fog. `environment.ts` keeps building the lights and sky but exempts the skydome from fog and widens its gradient's pale band so the mountains blend across their whole height. Existing emissive floors are then corrected by measurement, because they were tuned without tone mapping.

**Tech Stack:** TypeScript, `@babylonjs/core` 9.21, in-browser preview verification (this phase has no unit-testable logic — see *Verification method* below).

**Spec:** `docs/superpowers/specs/2026-08-21-lighting-atmosphere-design.md`

## Global Constraints

- **The palette does not change.** If the scene can only be made to read well by warming or saturating it, stop and report — that is an art-direction change, not tuning (spec §6).
- **Godrays are out of scope**, as are depth of field, chromatic aberration, grain and sharpening. Leave every unused pipeline effect disabled so no render target is allocated for it (spec §4, §9).
- **fps is measured on the whole loaded scene**, before and after, by the same method. If bloom costs more than it gives, bloom is what gets cut (spec §7, roadmap §7).
- **Deep babylon subpath imports need their side-effect import** or the effect silently does nothing (HANDOFF §7). Every import block below is exact — copy it.
- **Do not change `src/domain/`.** This phase is presentation only.

## Verification method

Babylon scene code is not unit-tested in this project (HANDOFF §6); it is verified in-browser. So each task's "test" is a scripted measurement with an expected result, not a Vitest case. Task 1 installs a shared harness every later task reuses.

Three rules make the measurements trustworthy:

- **Fix the camera before sampling**, and prove it took. Stopping the render loop is not enough on its own — see the `__view` comment in Task 1 — so every sampling step checks the `cameraAt` the harness returns before trusting the numbers that follow.
- **Trust `readPixels`, not the source values** — the same rule the terrain work landed on (HANDOFF §7).
- **Compare A against B in ONE session, not against a stored baseline.** Every effect in this phase can be toggled at runtime — `scene.fogMode = 0`, `pipeline.imageProcessing.toneMappingEnabled = false`, `pipeline.bloomEnabled = false` — so render the same pose twice, once with the effect off and once on, and diff those. The stored baseline drifts: it was captured with the drawing buffer at 300x300-ish defaults while the pane was hidden, and the buffer changes when the pane state changes, which silently invalidates cross-session comparison. A same-session A/B has no such exposure. Keep the baseline file only as a rough historical record.
- **`readPixels` is the only measurement that works headless.** Screenshots and live fps both need the Browser pane to be *displayed*, which is the human's UI state and cannot be set by any agent: while the pane is hidden the page never composites (`document.hidden` stays true), `requestAnimationFrame` is frozen, and `engine.getFps()` returns a stale cached number rather than a measurement. Tasks therefore gate on pixel samples; screenshots and the real fps figure are collected once, at Task 7, with the pane open.

Run `pnpm test` and `pnpm exec tsc --noEmit` at the end of every task regardless: 124 tests and a clean typecheck are the pre-existing baseline and must stay that way.

---

## File Structure

- **Create** `src/presentation/babylon/postProcessing.ts` — `createAtmosphere(scene, camera)`: the pipeline and the scene fog. The only new module.
- **Modify** `src/presentation/babylon/hubScene.ts` — call `createAtmosphere` after the camera exists.
- **Modify** `src/presentation/babylon/environment.ts` — `skyMat.fogEnabled = false`; re-weighted sky gradient stops; possible ambient nudge.
- **Modify** `src/presentation/babylon/scatter.ts`, `trees.ts`, `terrain.ts` — emissive/colour corrections **only where measurement shows drift** (Task 5). Do not pre-emptively edit these.
- **Modify** `docs/HANDOFF.md` — record P2 (Task 7).

Fog lives with the pipeline rather than in `environment.ts` because both are camera/frame concerns tuned together; `environment.ts` stays "what objects exist in the sky".

---

## Task 1: Baseline harness and before-measurements

Nothing in this phase can be judged without a fixed "before". This task produces it and the tooling every later task reuses.

**Files:**
- Create: `docs/superpowers/plans/2026-08-21-p2-baseline.md` (measurements only, committed as evidence)

- [ ] **Step 1: Start the dev server and clear the intro dialogue**

Use `preview_start` with the `dev` configuration, open the page, and click through the AVG intro (SKIP, pick a branch, SKIP) until `document.body.innerText.trim()` is empty. If the dialogue stalls because the pane is not compositing, drive frames manually first (the harness in Step 2 provides `f()`), or call `window.hub.suspendInput(false)` to release input without dismissing the overlay — but the overlay **must** be gone before any screenshot.

- [ ] **Step 2: Install the shared harness**

Run in the page console (`javascript_tool`). Every later task assumes these globals exist; re-run after any reload.

```js
(async () => {
  const th = await import('/src/presentation/babylon/terrainHeight.ts');
  const cap = await import('/src/presentation/babylon/capsule.ts');
  const { engine, scene, player } = window.hub;
  const V3 = player.root.getAbsolutePosition().constructor;
  const busy = (ms) => { const t0 = performance.now(); while (performance.now() - t0 < ms) {} };

  window.__f = (n) => { for (let i = 0; i < n; i++) { engine.beginFrame(); busy(16); scene.render(); engine.endFrame(); } };
  window.__place = (x, z) => {
    window.charController.setPosition(new V3(x, th.terrainHeight(x, z) + cap.CAPSULE_HALF + 0.1, z));
    player.motion = { ...player.motion, velocity: { x: 0, y: 0, z: 0 } };
    window.__f(30);
  };

  // Fixed viewpoints. `stopRenderLoop()` alone is NOT enough: followCamera.ts registers an
  // onBeforeRenderObservable that recomputes the camera from the player on every scene.render(),
  // manual ones included, so a plain position/setTarget is overwritten before the draw and every
  // viewpoint collapses to the default follow pose. Reassert from an observer added *after* the
  // camera's own — babylon notifies observers in registration order — then remove it.
  window.__view = (name) => {
    const spots = {
      spawn:     { at: [0, 0],    eye: [0, 3.2, -6],    look: [0, 1.2, 0] },
      mountains: { at: [0, 0],    eye: [0, 6, -10],     look: [0, 14, 90] },
      shade:     { at: [-26, -6], eye: [-30, 3, -10],   look: [-26, 1.2, -6] },
    };
    const s = spots[name];
    engine.stopRenderLoop();
    window.__place(s.at[0], s.at[1]);
    const cam = window.hub.follow.camera;
    const obs = scene.onBeforeRenderObservable.add(() => {
      cam.position.set(s.eye[0], s.eye[1], s.eye[2]);
      cam.setTarget(new V3(s.look[0], s.look[1], s.look[2]));
    });
    engine.beginFrame(); scene.render(); engine.endFrame();
    scene.onBeforeRenderObservable.remove(obs);
    // Returned so every caller can prove the pose took; if this is not the requested eye, the
    // samples that follow are of the wrong picture.
    return { name, cameraAt: [+cam.position.x.toFixed(2), +cam.position.y.toFixed(2), +cam.position.z.toFixed(2)] };
  };

  // Pixel samples at fixed fractions of the canvas, bottom-left origin (readPixels convention).
  window.__sample = () => {
    const canvas = engine.getRenderingCanvas();
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const pts = { sky: [0.5, 0.92], mountain: [0.5, 0.66], farGround: [0.5, 0.45], nearGround: [0.5, 0.12] };
    const out = {};
    for (const [k, [fx, fy]] of Object.entries(pts)) {
      const p = new Uint8Array(4);
      gl.readPixels(Math.floor(w * fx), Math.floor(h * fy), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, p);
      out[k] = [p[0], p[1], p[2]];
    }
    return out;
  };

  // fps with the real render loop, so the number is comparable across tasks.
  window.__fps = async () => {
    engine.runRenderLoop(() => scene.render());
    await new Promise((r) => setTimeout(r, 3000));
    const fps = Math.round(engine.getFps());
    return { fps, drawCalls: scene.getEngine()._drawCalls?.current ?? null, activeMeshes: scene.getActiveMeshes().length };
  };
  return { ready: true };
})()
```

- [ ] **Step 3: Record the before-state**

For each of `spawn`, `mountains`, `shade`: call `window.__view(name)`, take a screenshot, then call `window.__sample()`. Then measure fps once with `await window.__fps()`.

- [ ] **Step 4: Write the baseline down**

Create `docs/superpowers/plans/2026-08-21-p2-baseline.md` with a table of the three viewpoints' RGB samples and the fps/drawCalls figure, plus the three screenshots described in words (attach them to the PR). This file is the reference every later task compares against — without it the DoD is unfalsifiable.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/plans/2026-08-21-p2-baseline.md
git commit -m "docs(p2): record the pre-atmosphere baseline"
```

---

## Task 2: Distance fog, with the sky exempted

Fog first and alone: it is where the depth actually comes from, and landing it before tone mapping keeps the two effects separable when something looks wrong.

**Files:**
- Create: `src/presentation/babylon/postProcessing.ts`
- Modify: `src/presentation/babylon/hubScene.ts`
- Modify: `src/presentation/babylon/environment.ts`

**Interfaces:**
- Produces: `createAtmosphere(scene: Scene): void` — fog only for now. Task 4 widens it to take the camera as well; do **not** add the camera parameter here, or `hubScene` will not compile against this task's call site.

- [ ] **Step 1: Create the module with fog only**

Create `src/presentation/babylon/postProcessing.ts`:

```ts
import { Scene } from '@babylonjs/core/scene';
import { Color3 } from '@babylonjs/core/Maths/math.color';

/**
 * Distance fog and (from Task 4) the camera's rendering pipeline — the frame-level half of the
 * atmosphere, as opposed to `environment.ts`, which builds the lights and sky themselves.
 */

/**
 * Fog colour. Matches the sky gradient's horizon stop, because fog is what the distant mountains
 * dissolve *into*: any mismatch shows up as a visible band where they meet the sky.
 */
const FOG_COLOR = Color3.FromHexString('#dcecf7');

/**
 * EXP2 density, chosen from the scene's real distances rather than by eye: the field's half-extent is
 * 50, the mountain ring sits at radius 85, and the barrier confines the player to about 42 — so the
 * far side of the field is up to ~100 units away and the mountains 85–127.
 *
 * With `factor = exp(-(d * density)^2)`, this value leaves ~9 % haze at 40 units (the field the player
 * is actually looking across stays clear) and ~50 % at 110 (the mountains read as far off). Squared
 * falloff rather than linear because aerial perspective builds with distance; linear fog reads as a
 * flat curtain hung in front of the scene.
 */
const FOG_DENSITY = 0.0076;

/** Applies the scene's atmosphere. Call once, after the camera exists. */
export function createAtmosphere(scene: Scene): void {
  scene.fogMode = Scene.FOGMODE_EXP2;
  scene.fogColor = FOG_COLOR;
  scene.fogDensity = FOG_DENSITY;
}
```

- [ ] **Step 2: Exempt the skydome from fog**

In `src/presentation/babylon/environment.ts`, immediately after `skyMat.emissiveTexture = skyGradientTexture(scene);` add:

```ts
  // The skydome is 500 units out, so scene fog would render it as a flat sheet of fog colour and
  // throw the gradient away. It is the thing fog fades *into*, not something to fade.
  skyMat.fogEnabled = false;
```

- [ ] **Step 3: Wire it into the scene**

In `src/presentation/babylon/hubScene.ts`, add to the imports:

```ts
import { createAtmosphere } from './postProcessing';
```

and immediately after `scene.activeCamera = follow.camera;` add:

```ts
  createAtmosphere(scene);
```

- [ ] **Step 4: Verify**

Reload, clear the dialogue, re-install the harness, then:

```js
window.__view('mountains'); window.__sample()
```

Expected, against the Task 1 baseline:
- `sky` — **unchanged within ±3 per channel**. If it has moved toward `#dcecf7` across the whole frame, `fogEnabled = false` did not take.
- `mountain` — moved **measurably toward** `(220, 236, 247)`; the mountains were a flat `rgb(122, 140, 148)`-ish haze grey, so expect a clear lift in all three channels.
- `nearGround` — **within ±5**. Fog must not touch the ground the player is standing on.

Also check `window.__view('spawn'); window.__sample()` shows `nearGround` within ±5 of baseline.

- [ ] **Step 5: Confirm nothing else broke**

```bash
pnpm test
pnpm exec tsc --noEmit
```

Expected: 124 passed, clean.

- [ ] **Step 6: Commit**

```bash
git add src/presentation/babylon/postProcessing.ts src/presentation/babylon/hubScene.ts src/presentation/babylon/environment.ts
git commit -m "feat(p2): distance fog tuned to the scene's depth, sky exempted"
```

---

## Task 3: Widen the sky's pale band so the mountains blend across their height

Fog alone melts the mountains' bases into the horizon and leaves their tops against mid-blue. This is the second half of the chosen approach (spec §5 B).

**Files:**
- Modify: `src/presentation/babylon/environment.ts`

- [ ] **Step 1: Re-weight the gradient**

In `skyGradientTexture`, replace the three stops:

```ts
  g.addColorStop(0.0, '#2b6cb0'); // zenith: deep sky blue
  g.addColorStop(0.5, '#7fb2e5'); // mid sky
  g.addColorStop(1.0, '#dcecf7'); // horizon: pale
```

with:

```ts
  // The pale band reaches higher than a physical sky would, so the mountain ring (which stands from
  // y -4 to y ~44) sits against near-fog-coloured sky over its whole height instead of only at its
  // base. A single fog colour can match a gradient at exactly one height; this is how the other
  // heights are brought to it. The zenith stays deep blue — nothing needs to blend up there.
  g.addColorStop(0.0, '#2b6cb0'); // zenith: deep sky blue, untouched
  g.addColorStop(0.62, '#9cc6ea'); // mid sky, lifted toward the horizon's pale
  g.addColorStop(1.0, '#dcecf7'); // horizon: pale, and the fog colour
```

- [ ] **Step 2: Verify the blend**

```js
window.__view('mountains'); window.__sample()
```

Expected: `sky` lighter than the Task 2 reading (the sample point sits in the band that moved), and the **contrast between `sky` and `mountain` reduced** versus Task 2 — compute `Math.abs(sky[i] - mountain[i])` summed over channels and confirm it is smaller than the Task 2 figure. That difference shrinking is the whole point of this task; record both numbers.

Take a `mountains` screenshot and confirm by eye that the ridge line reads as hazy rather than as a hard silhouette.

- [ ] **Step 3: Check the zenith is intact**

```js
(() => { const c = window.hub.engine.getRenderingCanvas();
  const gl = c.getContext('webgl2') || c.getContext('webgl');
  const p = new Uint8Array(4);
  gl.readPixels(Math.floor(gl.drawingBufferWidth * 0.5), gl.drawingBufferHeight - 2, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, p);
  return [p[0], p[1], p[2]]; })()
```

Expected: still a deep blue, close to the baseline's top-of-frame value. If the whole sky has gone pale, the mid stop moved too far — pull `0.62` back toward `0.55`.

- [ ] **Step 4: Tests and typecheck, then commit**

```bash
pnpm test && pnpm exec tsc --noEmit
git add src/presentation/babylon/environment.ts
git commit -m "feat(p2): lift the sky's pale band so the mountains blend across their height"
```

---

## Task 4: ACES tone mapping, exposure and contrast

**Files:**
- Modify: `src/presentation/babylon/postProcessing.ts`
- Modify: `src/presentation/babylon/hubScene.ts`

**Interfaces:**
- Consumes: `createAtmosphere` from Task 2.
- Produces: `createAtmosphere(scene: Scene, camera: Camera): void` — the signature gains `camera`; Task 6 tunes the same pipeline.

- [ ] **Step 1: Add the pipeline**

In `src/presentation/babylon/postProcessing.ts`, add to the imports:

```ts
import type { Camera } from '@babylonjs/core/Cameras/camera';
import { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline';
import { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration';
// Side-effect: registers the render-pipeline manager on the scene. Without it the pipeline is
// constructed, attaches to nothing, and renders exactly as before — no error, no effect.
import '@babylonjs/core/PostProcesses/RenderPipeline/postProcessRenderPipelineManagerSceneComponent';
```

Add the constants below `FOG_DENSITY`:

```ts
/**
 * Exposure and contrast are nudges, not a grade: the palette is deliberately unchanged (spec §1), so
 * these exist to stop ACES flattening the image, not to restyle it. Settle them against screenshots.
 */
const EXPOSURE = 1.0;
const CONTRAST = 1.1;
```

and replace the body of `createAtmosphere`:

```ts
export function createAtmosphere(scene: Scene, camera: Camera): void {
  scene.fogMode = Scene.FOGMODE_EXP2;
  scene.fogColor = FOG_COLOR;
  scene.fogDensity = FOG_DENSITY;

  const pipeline = new DefaultRenderingPipeline('atmosphere', true, scene, [camera]);

  pipeline.imageProcessingEnabled = true;
  pipeline.imageProcessing.toneMappingEnabled = true;
  pipeline.imageProcessing.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
  pipeline.imageProcessing.exposure = EXPOSURE;
  pipeline.imageProcessing.contrast = CONTRAST;

  // Everything the pipeline can do that this scene did not ask for. Each one left enabled would cost
  // a render target for an effect nobody wants.
  pipeline.bloomEnabled = false;
  pipeline.depthOfFieldEnabled = false;
  pipeline.chromaticAberrationEnabled = false;
  pipeline.grainEnabled = false;
  pipeline.sharpenEnabled = false;
  pipeline.fxaaEnabled = false;
}
```

- [ ] **Step 2: Pass the camera**

In `hubScene.ts`, change `createAtmosphere(scene);` to:

```ts
  createAtmosphere(scene, follow.camera);
```

- [ ] **Step 3: Confirm the pipeline actually attached**

Before judging any colour, prove the post-process is running — the silent-no-op failure mode above is the one to rule out first:

```js
(() => { const s = window.hub.scene;
  return { pipelines: s.postProcessRenderPipelineManager?.supportedPipelines?.map((p) => p.name) ?? [],
           cameraPostProcesses: window.hub.follow.camera._postProcesses?.length ?? 0 }; })()
```

Expected: `pipelines` contains `"atmosphere"` and `cameraPostProcesses` is at least 1. If it is 0, the side-effect import is missing.

- [ ] **Step 4: Measure the drift**

For all three viewpoints, `window.__view(name); window.__sample()` and tabulate against Task 3's readings. Record the numbers — Task 5 corrects from this table, so it must be written down, not eyeballed.

Then check the two failure modes the DoD names:
- **Blown highlights:** no channel of `nearGround` or `sky` at 255 in a sunlit shot.
- **Crushed blacks:** in the `shade` view, no sampled channel below 12.

If either fails, adjust `EXPOSURE` (start ±0.1) and re-measure before moving on. Do **not** fix it by changing material colours — that is Task 5, and mixing the two makes both untraceable.

- [ ] **Step 5: Tests and typecheck, then commit**

```bash
pnpm test && pnpm exec tsc --noEmit
git add src/presentation/babylon/postProcessing.ts src/presentation/babylon/hubScene.ts
git commit -m "feat(p2): ACES tone mapping with exposure and contrast"
```

---

## Task 5: Correct the emissive drift

The emissive floors on grass, bushes and leaves were tuned to compensate for the absence of tone mapping (`scatter.ts:125`, `scatter.ts:209`). ACES has now remapped them. This task moves them back — and **only** them.

**Files:**
- Modify: `src/presentation/babylon/scatter.ts` (only if measured)
- Modify: `src/presentation/babylon/trees.ts` (only if measured)
- Modify: `src/presentation/babylon/terrain.ts` (only if measured)

- [ ] **Step 1: Decide from the Task 4 table, not from taste**

For each viewpoint, compare Task 4's samples with Task 3's. Anything within **±6 per channel** is not drift — leave it. Correct only what moved further.

If nothing moved more than ±6, skip to Step 4 and record that no correction was needed. That is a legitimate outcome, not a task failure.

- [ ] **Step 2: Correct the emissive floors**

Grass tufts, `src/presentation/babylon/scatter.ts` (currently `mat.emissiveColor = new Color3(0.10, 0.17, 0.06);`) and bushes (currently `new Color3(0.05, 0.10, 0.03)`): scale each channel by the ratio the measurement showed, keeping the **hue** — multiply all three channels by one factor rather than adjusting them separately. Changing their ratio to each other is a palette change, which this phase forbids.

Extend the existing comment on each so the next reader knows the value is now post-ACES:

```ts
  // Billboard blades face every direction, so half of them turn away from the sun and go dark. A
  // small green emissive floor keeps the tufts reading as lush grass rather than dark spikes.
  // Re-measured after ACES tone mapping landed (P2) — tone mapping remaps emissive too, so this
  // value is only meaningful with the pipeline attached.
```

- [ ] **Step 3: Re-measure**

Repeat all three viewpoints. Expected: every sample now within **±6 per channel** of the Task 3 (pre-tone-mapping) reading, except where fog is deliberately acting — the `mountain` sample is *supposed* to have moved and should not be corrected back.

- [ ] **Step 4: If the palette cannot be preserved, stop**

If reaching ±6 requires shifting channel ratios — that is, warming or saturating the scene — do not do it. Record what was measured and what it would take, and report. Spec §6 makes this an art-direction decision, not a tuning one.

- [ ] **Step 5: Tests and typecheck, then commit**

```bash
pnpm test && pnpm exec tsc --noEmit
git add -A
git commit -m "fix(p2): re-measure the emissive floors against ACES"
```

---

## Task 6: Bloom, and whether it pays for itself

**Files:**
- Modify: `src/presentation/babylon/postProcessing.ts`

- [ ] **Step 1: Enable it, restrained**

Replace `pipeline.bloomEnabled = false;` with:

```ts
  // Restrained on purpose: a high threshold with a low weight lets only the brightest sky and the
  // sunlit tips of grass bleed. A cohesion pass does not want a glowing field.
  pipeline.bloomEnabled = true;
  pipeline.bloomThreshold = BLOOM_THRESHOLD;
  pipeline.bloomWeight = BLOOM_WEIGHT;
  pipeline.bloomKernel = BLOOM_KERNEL;
  pipeline.bloomScale = BLOOM_SCALE;
```

and add the constants beside `CONTRAST`:

```ts
/** Only pixels above this luminance bloom, so the effect finds highlights rather than the whole image. */
const BLOOM_THRESHOLD = 0.85;
/** How much of the blurred highlight is added back. Low: this is a sheen, not a glow. */
const BLOOM_WEIGHT = 0.15;
/** Blur radius in pixels. */
const BLOOM_KERNEL = 32;
/** Resolution the bloom is computed at, as a fraction of the frame. Half-res is the usual trade. */
const BLOOM_SCALE = 0.5;
```

- [ ] **Step 2: Check it did not become a glow**

`window.__view('spawn'); window.__sample()` — expected: `nearGround` within **±6** of Task 5's reading. Bloom that moves the ground is too strong; lower `BLOOM_WEIGHT`.

- [ ] **Step 3: Note that fps cannot be measured here**

`await window.__fps()` returns a stale cached number while the Browser pane is hidden — `requestAnimationFrame` is frozen, so no frames are timed (see *Verification method*). Do **not** report it as a measurement and do **not** decide anything from it.

Instead record the two figures that *are* real state snapshots rather than timings, for Task 7 to compare:

```js
(() => { const s = window.hub.scene; return { activeMeshes: s.getActiveMeshes().length, materials: s.materials.length, postProcesses: window.hub.follow.camera._postProcesses?.length ?? 0 }; })()
```

- [ ] **Step 4: Leave bloom enabled and hand the cost decision to Task 7**

The cut condition (>10 % fps against baseline → `BLOOM_SCALE = 0.25` → off) is unchanged, but it can only be evaluated with the pane displayed, which happens in Task 7. Leave bloom **on** here, and note in the commit message that its cost is unmeasured and pending Task 7. Do not silently keep an effect whose budget nobody checked — the note is what makes the debt visible.

- [ ] **Step 5: Tests and typecheck, then commit**

```bash
pnpm test && pnpm exec tsc --noEmit
git add src/presentation/babylon/postProcessing.ts
git commit -m "feat(p2): restrained bloom on the highlights"   # or "perf(p2): measure bloom and leave it off"
```

---

## Task 7: Definition of done

**Files:**
- Modify: `docs/HANDOFF.md`
- Modify: `docs/superpowers/specs/2026-08-21-lighting-atmosphere-design.md` (results section)

- [ ] **Step 1: Capture the after-shots**

All three viewpoints, same harness, same positions. Attach before/after pairs to the PR.

- [ ] **Step 2: Check every DoD line from spec §8**

- Cohesive image with visible depth, nothing blown or crushed — from the samples, not impressions.
- Mountains hazed **across their height**, not only at the base — the sky/mountain contrast figure from Task 3 Step 2.
- Near field essentially fog-free — `nearGround` within ±5 of the Task 1 baseline.
- Palette recognisably unchanged — every non-fog sample within ±6 of baseline.
- fps holds against the Task 1 baseline.

Any line that fails and cannot be fixed by tuning goes in the report, not quietly into the PR.

- [ ] **Step 3: Play the scene**

Walk, run, jump and turn for a minute. Fog and tone mapping are per-frame and per-material; a fault that a static screenshot hides (scatter popping through fog at speed, the knight's shaded side going black in motion) shows up here.

- [ ] **Step 4: Record the outcome**

Add a results section to the spec with the final constant values and the measured before/after table. Update `docs/HANDOFF.md` §4 with P2 and move §5's list on.

- [ ] **Step 5: Commit and open the PR**

```bash
pnpm test && pnpm exec tsc --noEmit && pnpm exec svelte-check --output human
git add -A
git commit -m "docs(p2): record the atmosphere results and update the handoff"
git push -u origin claude/p2-lighting-atmosphere
```

---

## Self-Review Notes (author checklist — already applied)

- **Spec coverage.** §3 module/wiring → Task 2. §4 tone mapping/exposure/bloom → Tasks 4 and 6. §5 fog and the sky reconciliation → Tasks 2 and 3. §6 recalibration, including the stop-and-report rule → Task 5. §7 testing method → the *Verification method* section plus each task's verify step. §8 DoD → Task 7. §9 out-of-scope items are disabled explicitly in Task 4 Step 1 rather than merely omitted.
- **Ordering.** Fog lands before tone mapping so that when a colour looks wrong there is only one new variable. Recalibration is its own task for the same reason, and Task 4 Step 4 forbids fixing tone-mapping problems with material edits.
- **Baseline.** Task 1 exists because every later "expected" in this plan is expressed as a delta against it. Without it the DoD cannot be falsified.
- **Bloom is genuinely optional.** Task 6 Step 4 has a real cut condition with a number attached, per roadmap §7.
- **No unit tests are claimed.** This phase has no pure logic; the *Verification method* section says so and says why, rather than inventing Vitest cases for engine configuration.
