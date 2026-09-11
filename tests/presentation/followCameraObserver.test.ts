// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';

import {
  GROUNDED_BAND,
  createFollowCamera,
  type FollowCamera,
  type FollowCameraConfig,
} from '../../src/presentation/babylon/followCamera';
import type { GroundHeight } from '../../src/presentation/babylon/groundHeight';
import { CAPSULE_HALF } from '../../src/presentation/babylon/capsule';

/**
 * The camera's OBSERVER, run for real — `verticalFollowRate`'s own suite next door constrains the
 * pure function, and a camera that computed the rate and then threw it away would pass every test in
 * it. What these hold is the wiring: that the returned rate is the one the follow eases at, that the
 * descent it is given comes from the raw target Y and not from the grounded anchor, that a level
 * which has not opted in runs the old single-rate camera, and that a respawn lands as a cut.
 *
 * **No WebGL is involved.** `NullEngine` is Babylon's headless backend: a real `Scene` with a real
 * `onBeforeRenderObservable`, no context and no canvas surface, which is exactly the half this file
 * is about. `getDeltaTime` is pinned rather than sampled, for the reason Task 11's report gives —
 * a synchronous render burst reports a ~0 ms delta — so every trace here is an exact 60 fps
 * simulation and reproducible to the last bit.
 *
 * What it cannot reach is the rest of the frame: `createCharacterRig` (a GLB load), `createPlayer`
 * (a Havok character controller) and pointer look, which needs a pointer lock this environment
 * refuses. So the player half of a respawn is *modelled* below, from `Player.teleport`'s documented
 * contract, and the contract itself is what the tower depends on.
 */
const FPS = 60;
const DT = 1 / FPS;

/** The camera's ease, written out once: `smoothY += (target − smoothY) · (1 − exp(−rate·dt))`. */
const alpha = (rate: number) => 1 - Math.exp(-rate * DT);

/**
 * How far the follow settles BEHIND a target descending steadily at `v`, for that discrete ease:
 * with `D = smoothY − targetY` and a target that drops `v·dt` a frame, `D → (D + v·dt)(1 − a)`, whose
 * fixed point is `v·dt·(1 − a)/a`. This is the whole reason the term exists — the gap is what puts
 * the knight below the bottom of the frame — and it is the only place the rate is observable from
 * outside the camera.
 */
const steadyLag = (rate: number, v: number) => (v * DT * (1 - alpha(rate))) / alpha(rate);

/** Ground far below everything these tests do, so no clamp and no grounded anchor is ever in play. */
const NO_GROUND: GroundHeight = () => -1000;

/**
 * Where the camera ends up, for an anchor at `y`. Read from `camera.position` and not from
 * `getTarget()`: a `TargetCamera` recomputes its target from its own rotation while building the
 * view matrix, so between renders `getTarget()` answers for the last frame rather than for the call
 * the camera just made — which is precisely the frame a snap lands on. Built in the same order the
 * camera builds it (`anchor + orbit offset`, then the height), so the two agree bit for bit and a cut
 * can be asserted as an identity rather than as a tolerance.
 */
const cameraYFor = (y: number, config: FollowCameraConfig) =>
  y + Math.sin(-config.initialPitch) * config.distance + config.height;

interface Mounted {
  readonly scene: Scene;
  readonly root: TransformNode;
  readonly follow: FollowCamera;
  readonly config: FollowCameraConfig;
  /** Where the follow has actually put its vertical anchor this frame — the camera's own Y with the
   *  fixed orbit offset taken back off, which is `smoothY` and nothing else. */
  anchorY(): number;
  frame(): void;
}

function mount(descentFollow: boolean, ground: GroundHeight = NO_GROUND, startY = 100): Mounted {
  const engine = new NullEngine();
  // Pinned, not sampled — see this file's header.
  engine.getDeltaTime = () => DT * 1000;
  const scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  const root = new TransformNode('player', scene);
  root.position.set(0, startY, 0);
  const follow = createFollowCamera(scene, root, document.createElement('canvas'), ground, descentFollow);
  scene.activeCamera = follow.camera;
  // The live config the camera itself reads (dev-only `window.cameraConfig`), so nothing here has to
  // restate a default it would then stop testing if the default moved.
  const config = (window as unknown as { cameraConfig: FollowCameraConfig }).cameraConfig;
  return {
    scene, root, follow, config,
    anchorY: () => follow.camera.position.y - (cameraYFor(0, config)),
    frame: () => scene.render(),
  };
}

/** Runs `frames` frames, moving the target down `speed` u/s before each one. */
function fall(m: Mounted, speed: number, frames: number): void {
  for (let i = 0; i < frames; i++) {
    m.root.position.y -= speed * DT;
    m.frame();
  }
}

describe('the follow camera observer', () => {
  it('eases at the rate the descent term returns, not at the tuned one', () => {
    // 25 u/s is past DESCENT_FULL_SPEED, so the ramp is saturated and the rate is DESCENT_SMOOTHING
    // 44 on every frame of this fall. The gap the camera settles at is the only outward sign of
    // which rate it used, and the two candidates are far apart: 0.385 u at 44, 2.575 u at 9.
    const m = mount(true);
    fall(m, 25, 120);
    const lag = m.anchorY() - m.root.position.y;
    expect(lag).toBeCloseTo(steadyLag(44, 25), 6);
    expect(steadyLag(9, 25) - steadyLag(44, 25)).toBeGreaterThan(2);
  });

  it('runs the tuned camera untouched in a level that has not opted in', () => {
    // The same fall, in a level that did not ask for the term: the camera must trail by the tuned
    // rate's gap and by nothing else. This is `descentFollow` doing its job — with it, "the hub's
    // camera is unchanged" is a branch that is not taken rather than a threshold that is not crossed.
    const m = mount(false);
    fall(m, 25, 120);
    expect(m.anchorY() - m.root.position.y).toBeCloseTo(steadyLag(9, 25), 6);
  });

  it('is the tuned camera below the threshold even where the term is switched on', () => {
    // 16 u/s is under DESCENT_ENGAGE_SPEED — inside what a running jump reaches — so an opted-in
    // level has to be bit-for-bit the camera it was tuned as here too.
    const opted = mount(true);
    const plain = mount(false);
    for (let i = 0; i < 120; i++) {
      opted.root.position.y -= 16 * DT;
      plain.root.position.y -= 16 * DT;
      opted.frame();
      plain.frame();
      expect(Object.is(opted.anchorY(), plain.anchorY())).toBe(true);
    }
  });

  it('measures the descent from the raw target Y, never from the grounded anchor', () => {
    // `targetY` steps by up to GROUNDED_BAND the frame the grounded branch flips. Here the ground
    // falls away under a target that is not moving at all: standing 0.49 u under the grounded anchor
    // on flat ground, then one frame later out over a void, so the anchor drops from `groundLevel`
    // to `t.y` in a single frame. Read as a speed that is 29.4 u/s — well past the engage speed —
    // while the character's real descent is zero.
    const drop = GROUNDED_BAND - 0.01;
    const groundY = 0;
    const standY = groundY + CAPSULE_HALF - drop;
    let overTheVoid = false;
    const m = mount(true, () => (overTheVoid ? -1000 : groundY), standY);
    m.frame();
    // Seeded on the grounded anchor, which is `drop` above the target itself.
    expect(m.anchorY()).toBeCloseTo(groundY + CAPSULE_HALF, 6);
    overTheVoid = true;
    m.frame();
    // One frame of easing toward the target, at the TUNED rate. At 44 it would have closed 0.255 u
    // of the 0.49 instead of 0.068 — a camera that had engaged on a character standing still.
    const closed = (groundY + CAPSULE_HALF) - m.anchorY();
    expect(closed).toBeCloseTo(drop * alpha(9), 6);
    expect(drop * alpha(44) - drop * alpha(9)).toBeGreaterThan(0.18);
  });
});

/**
 * The respawn, driven through the same three observers the tower registers, in the same order:
 * the camera's (registered inside `createFollowCamera`), then the player's, then the level's, which
 * is where `stepTowerProgress` fires and where `teleport` + `snap()` are called.
 *
 * The player half is modelled, not real — a Havok controller is out of reach here — and what it
 * models is `Player.teleport`'s documented contract: the destination reaches the controller, the
 * velocities, and the rendered transform `root`, all before the frame is drawn. `stale: true` drops
 * the last of those, which is what `teleport` used to do, and is here to show that the harness can
 * see the defect rather than to describe anything that ships.
 */
function respawnRun(options: { stale: boolean; playerObserverFirst?: boolean; settle?: number }) {
  const engine = new NullEngine();
  engine.getDeltaTime = () => DT * 1000;
  const scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  const root = new TransformNode('player', scene);
  // The tower's own numbers: released at 62 with nothing under it, checkpoint 2 active at
  // SECTION_3_START 42, so the respawn fires TOWER_FALL_MARGIN 4 below that and lands the capsule
  // 0.9 above the pad (`capsule.ts`'s `spawnCentreY`: CAPSULE_HALF plus the 0.3 clearance every
  // checkpoint and both spawns are placed in open air by). Free fall under the domain's own
  // `gravity` 24, integrated the way the domain integrates it.
  const gravity = 24;
  const startY = 62;
  const respawnBelow = 38;
  const checkpointY = 42.9;
  let capsuleY = startY;
  let capsuleVy = 0;
  let respawnFrame = -1;
  root.position.set(0, capsuleY, 0);

  // Stands in for `playerController`'s observer: the one place `root` is written from the capsule,
  // once a frame. It writes the capsule's Y straight across rather than the VISUAL_Y_SMOOTHING ease
  // the real one applies — the smoothing is a second lag on the same signal and would only make the
  // camera's own lag harder to read.
  const player = () => {
    if (respawnFrame < 0) {
      capsuleVy -= gravity * DT;
      capsuleY += capsuleVy * DT;
    } else {
      // Settling onto the pad it was teleported 0.3 u above, at `settle` u/s — zero for a character
      // simply left standing there.
      capsuleY -= (options.settle ?? 0) * DT;
    }
    root.position.y = capsuleY;
  };
  if (options.playerObserverFirst) scene.onBeforeRenderObservable.add(player);
  const follow = createFollowCamera(scene, root, document.createElement('canvas'), NO_GROUND, true);
  scene.activeCamera = follow.camera;
  const config = (window as unknown as { cameraConfig: FollowCameraConfig }).cameraConfig;
  if (!options.playerObserverFirst) scene.onBeforeRenderObservable.add(player);

  // Stands in for `towerScene`'s: the last observer of the frame, where `stepTowerProgress` decides
  // a fall has gone too far and calls `teleport` and then `snap()`.
  let frameNo = 0;
  scene.onBeforeRenderObservable.add(() => {
    if (capsuleY > respawnBelow || respawnFrame >= 0) return;
    respawnFrame = frameNo;
    capsuleY = checkpointY;
    capsuleVy = 0;
    if (!options.stale) root.position.y = capsuleY;
    follow.snap();
  });

  // Long enough for the fall (24 u under gravity 24 is 1.41 s) and for a rate-9 glide across the
  // last 5 u of it to have finished, so "it never settles" cannot pass for "it cut".
  const cameraY: number[] = [];
  for (frameNo = 0; frameNo < 200; frameNo++) {
    scene.render();
    cameraY.push(follow.camera.position.y);
  }
  return { cameraY, respawnFrame, checkpointY, startY, at: (y: number) => cameraYFor(y, config) };
}

/**
 * Within a float32 of the destination. The camera reads the target through `getAbsolutePosition`,
 * which comes out of a `Float32Array` world matrix, so the height it seeds at is 42.9 rounded to
 * single precision — 1.5e-6 away. A cut is therefore "no motion at all after this frame", asserted as
 * an identity below, plus this on the value itself.
 */
const FLOAT32 = 1e-4;

describe('a checkpoint respawn', () => {
  it('is a cut on the frame it happens, not a glide toward the checkpoint', () => {
    const { cameraY, respawnFrame, checkpointY, at } = respawnRun({ stale: false });
    expect(respawnFrame).toBeGreaterThan(0);
    // The frame the respawn is decided on is the frame it is drawn on: the camera is at the
    // checkpoint already, and then it does not move at all — no residue, on any of the 100+ frames
    // after it, which is what separates a cut from a fast glide.
    expect(cameraY[respawnFrame]).toBeCloseTo(at(checkpointY), 4);
    for (const y of cameraY.slice(respawnFrame)) expect(y).toBe(cameraY[respawnFrame]);
    expect(Math.abs(cameraY[respawnFrame] - at(checkpointY))).toBeLessThan(FLOAT32);
  });

  it('does not read the teleport itself as a descent', () => {
    // The respawn moves the target 5 u in one frame — 300 u/s if it were read as a speed, which
    // would leave the descent term saturated on the frames after the cut. The character is settling
    // onto its pad at 6 u/s, well under the engage speed, so the follow has to be back on the tuned
    // rate: it may only close the tuned rate's fraction of that frame's 0.1 u.
    const settle = 6;
    const { cameraY, respawnFrame } = respawnRun({ stale: false, settle });
    // Two frames on, not one: the camera reads the target at the top of a frame and the player
    // writes it further down, so the first settling step the camera can see is the one written on
    // the frame after the respawn.
    const closed = cameraY[respawnFrame + 1] - cameraY[respawnFrame + 2];
    expect(closed).toBeCloseTo(settle * DT * alpha(9), 5);
    expect(settle * DT * alpha(44) - settle * DT * alpha(9)).toBeGreaterThan(0.03);
  });

  it('cuts whichever observer the level happens to register first', () => {
    // The suppression this used to need was a frame counter whose "2" depended on the camera's
    // observer being registered before the player's. Nothing waits for a later frame now — the
    // re-seed forces its own read of the target — so the order is free, and this is what says so.
    const { cameraY, respawnFrame, checkpointY, at } = respawnRun({
      stale: false, playerObserverFirst: true,
    });
    expect(Math.abs(cameraY[respawnFrame] - at(checkpointY))).toBeLessThan(FLOAT32);
    for (const y of cameraY.slice(respawnFrame)) expect(y).toBe(cameraY[respawnFrame]);
  });

  it('would glide if the teleport left the rendered transform a frame behind', () => {
    // Not a behaviour, a calibration: this is the defect the two tests above are pinned against, and
    // it is what the same respawn measures when `teleport` moves the character but not `root`. The
    // camera re-seeds from the root, so it seeds at the height the fall reached and then eases up to
    // the checkpoint at the tuned rate 9 — a swoop into a checkpoint that was meant to be a cut.
    const { cameraY, respawnFrame, checkpointY, at } = respawnRun({ stale: true });
    expect(cameraY[respawnFrame]).toBeLessThan(at(checkpointY) - 4);
    const settled = cameraY.findIndex(
      (y, i) => i >= respawnFrame && Math.abs(y - at(checkpointY)) < 0.1);
    // Frames, at the 60 fps this file pins: a fifth of a second or more of swoop, where the fix
    // above measures zero.
    expect(settled - respawnFrame).toBeGreaterThan(12);
  });
});
