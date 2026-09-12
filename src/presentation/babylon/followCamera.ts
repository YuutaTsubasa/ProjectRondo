import type { Scene } from '@babylonjs/core/scene';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { TargetCamera } from '@babylonjs/core/Cameras/targetCamera';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { GroundHeight } from './groundHeight';
import { CAPSULE_HALF } from './capsule';
import { exposeDevHandle } from './devHandles';

/** While |playerY − groundLevel| is under this, treat the player as grounded and anchor the camera to
 *  the smooth terrain (not the jittery capsule); a jump clears it at once. Covers float + slope rest.
 *  Exported for the observer's test, which needs to stand a character exactly inside the band and
 *  then take the ground away — the one-frame anchor step the descent measurement must not see. */
export const GROUNDED_BAND = 0.5;

/** Minimum gap the camera keeps above the terrain beneath it, so it never dips through the ground. */
const CAMERA_GROUND_CLEARANCE = 0.6;

/**
 * Where the descent-aware vertical follow starts and finishes engaging, in world units per second of
 * downward target motion, and the smoothing rate it reaches. **All three Untuned**, and they stayed
 * that way through the first playthrough: tower falls have now been driven end to end (design spec
 * §14.3-14.4), they behaved as the arithmetic below predicts, and none of the three was moved. What
 * they are is the output of two measurements: what the frustum needs, and what ordinary movement can
 * and cannot reach.
 *
 * **What the playthrough added, and what it did not.** Six real falls on the built tower — 4.5 u to
 * 25.0 u, peaking at 36.0 u/s on the deepest the checkpoint spacing allows — kept the rendered root
 * between 0.619 and **0.990** of the frame with **zero** frames off it, and the knight's head never
 * past 0.81. The 0.990 is the transition peak the last paragraph here predicts, reproduced to three
 * decimal places on three separate falls. It also found the limit of what any of this can promise:
 * a fall taken facing outward puts the camera *inside* the tower's column for the whole descent
 * (spec §14.4), where a perfectly framed root is drawn behind a wall. Framing is not visibility, and
 * this term only buys the first.
 *
 * **Why the follow needs a second rate at all.** An exponential smoother trails a target descending at
 * `v` by `v / rate`. At {@link FollowCameraConfig.verticalSmoothing} 9 that is 3.44 u at the 30.98 u/s
 * ending a 20 u tower section, against a frustum half-height of `distance · tan(fov/2)` =
 * `5 · tan(22.92°)` = **2.11 u** at the aim plane — so the player leaves the bottom of the frame
 * partway down every fall. Measured on a real tower fall before this term existed: the knight's root
 * crossed the bottom edge **8.16 u in, at t = 0.80 s and 19.6 u/s**, and by the respawn was 1.40 of a
 * frame-height down, with the head itself 1.19 — no knight on screen at all, which is design spec
 * §13.2's finding reproduced (it measured 8.6 u / 0.844 s on its own trace). With the term, the same
 * fall keeps the root between **0.73 and 0.99** of the frame from the moment it engages — one 0.99
 * peak on the transition itself, which the last paragraph is about, and 0.73–0.85 for the rest of
 * the way down.
 *
 * **Why it engages at 17 u/s.** This is bounded on both sides, and the window is narrow. Above:
 * unaided, the root reaches the bottom edge at 19.6 u/s, so a threshold at or above that engages too
 * late to help. Below: an ordinary jump has to stay under it, or the term fires on a player who is
 * merely hopping between platforms. Two measurements of what the shared movement config reaches by
 * walking, running and jumping — both taken in the hub, because its height field gives a jump more
 * to fall off than the tower's flat slabs do —
 *
 * - **In play, 15.8 u/s.** Scripted walk/run/jump runs across the height field, clear of the homing
 *   test crystals, peaked there (`motion.velocity.y`), and the *rendered* root — the thing this term
 *   actually measures — peaked at 14.28 u/s.
 * - **As a bound, 16.6 u/s.** A ballistic sweep over every walkable launch point (r ≤ `EDGE_RADIUS`
 *   42, 0.5 u grid, 32 directions, launched at `jumpSpeed` 9 and at 0, flown at `runSpeed` 8 until it
 *   meets the terrain again) tops out there. It is an over-estimate: it flies a free parabola through
 *   ground the capsule would have landed on.
 *
 * 17 clears the stricter of the two, and by enough that opting a level in is not a tuning decision
 * about its walking and jumping: the same scripted hub runs, replayed with the term forced ON and
 * with it absent, give a camera trace **identical to ten decimal places** across 1200 frames — and
 * again, once this became a per-level choice, over an 800-frame scripted route kept clear of the
 * test crystals, where `descentFollow` on and off produced **bit-identical** camera positions on
 * every frame and the rendered root peaked at 14.278 u/s (the capsule at 15.8), the same two numbers
 * the bullets above record.
 *
 * **What a homing dash reaches is `homingSpeed` 24, and that is why this is a level's choice rather
 * than everyone's** — see {@link FollowCameraConfig.descentFollow}. Nothing stops a player locking a
 * crystal BELOW them, and a downward dash pulls the capsule at a flat 24 u/s: the rendered root eases
 * toward that at `VISUAL_Y_SMOOTHING` 14, so it passes 17 u/s at `−ln(1 − 17/24)/14` = **0.088 s** and
 * `DESCENT_FULL_SPEED` at 0.099 s, and from there to the end of the dash the ramp is **saturated** —
 * the term returns its full rate, not a value near `verticalSmoothing`. Falling off the top of the
 * homing chain reaches 19.8 u/s by itself. `followCamera` is handed a transform, not a character, and
 * cannot tell any of that from a tower fall, so the level says whether it wants the term at all: the
 * hub does not, because its crystals are a playground and not level design (`hubScene.ts`), and a
 * camera nobody tuned for a dash should not be re-tuned by one. That makes "the hub's camera is
 * unchanged" a fact about which branch runs, rather than a bound with a disclosed exception.
 *
 * `DESCENT_SMOOTHING` 44 is sized on the other end of the fall. The deepest drop the tower's
 * checkpoint spacing allows before the respawn fires is section 2's 28 u (falling from just under
 * `SECTION_3_START` 42 to `TOWER_FALL_MARGIN` below `SECTION_2_START`), ~36.7 u/s; the fall measured
 * here was the summit's 24 u, 33.6 u/s, where 44 held the aim-to-root gap at **1.32 u** — 63 % of the
 * half-height, root at 0.81 of the frame and head at 0.60. Raising it further buys little: at 60 fps
 * the gap is already dominated by the per-frame step rather than by the rate.
 *
 * The rate is safe to raise at all only because of what the threshold excludes. `verticalSmoothing` 9
 * is low to damp the capsule's Y micro-steps across the terrain collider's triangles; at 17 u/s of
 * descent the capsule is in free fall and has no triangles to step across, so there is nothing left
 * for the low rate to be protecting.
 *
 * **What this does not fix**: the transition itself. The lag the camera has already accumulated at
 * 17 u/s cannot be undone instantly, so the root peaks at 0.99 of the frame just after engaging (at
 * 60 fps) before recovering. At 30 fps the same peak is 1.02 — the root leaves the frame for two
 * frames — because a longer frame is a bigger per-frame step and the unaided lag at the threshold is
 * already 2.2 u. The knight's head stays at 0.81 throughout it. Closing that gap means engaging
 * earlier than an ordinary jump allows, which is the thing this must not do.
 */
export const DESCENT_ENGAGE_SPEED = 17;
/**
 * Where the ramp reaches the full rate. **Untuned like the other two, and its 1 u/s width is a
 * guess.** The blend has now been driven through on real tower falls (design spec §14.4) — it is
 * where the root's 0.990 peak happens, and the peak is where the paragraph above already said it
 * would be — but nothing has measured how long such a blend *should* take, so the width is still a
 * guess and it was not moved. What the width buys is arithmetic and only that: at `gravity` 24 a fall
 * crosses 1 u/s in 1/24 s, so the change is spread over **2.5 frames at 60 fps** (1.25 at 30) rather
 * than landing inside one. Both directions cost something — at zero width the rate steps, and a
 * wider ramp holds the camera below its full rate to a speed at which the lag it has to undo is
 * larger, which is the transition the last paragraph of {@link DESCENT_ENGAGE_SPEED} measures.
 */
const DESCENT_FULL_SPEED = 18;
export const DESCENT_SMOOTHING = 44;

/**
 * The vertical follow's rate this frame, given how fast the target is descending. See
 * {@link DESCENT_ENGAGE_SPEED} for every number in it.
 *
 * Exported for its test, and the property the test is there to hold is the first line: at or below
 * the engage speed this returns `base` **identically**, not approximately, so a level that does opt
 * in is still bit-for-bit the tuned camera everywhere below the threshold. A level that has not
 * opted in never reaches this function at all — see {@link FollowCameraConfig.descentFollow}.
 */
export function verticalFollowRate(base: number, descentSpeed: number): number {
  const engaged = Math.min(1, Math.max(0,
    (descentSpeed - DESCENT_ENGAGE_SPEED) / (DESCENT_FULL_SPEED - DESCENT_ENGAGE_SPEED)));
  return base + (DESCENT_SMOOTHING - base) * engaged;
}

/** Live-tunable follow-camera settings. Exposed on `window.cameraConfig` in dev for instant tweaking. */
export interface FollowCameraConfig {
  sensitivity: number;
  minPitch: number;
  maxPitch: number;
  distance: number;
  /** Height added to the orbit position (camera rides this far above the aim point's base). */
  height: number;
  /** Height above the player root the camera looks at. Lower = feet sit higher in frame. */
  aimHeight: number;
  /** Camera never goes below this world Y (keeps it out of the floor). */
  minCameraHeight: number;
  /** Near clip plane. Small so close feet aren't clipped. */
  nearPlane: number;
  /** Pitch the camera starts at (slightly above, looking down at the character). */
  initialPitch: number;
  /** Rate the camera's vertical follow eases toward the player's Y (per second; higher = snappier,
   *  lower = smoother). Damps the capsule's small Y steps over the terrain collider so the camera
   *  doesn't judder up/down on slopes. */
  verticalSmoothing: number;
  /**
   * Whether the vertical follow measures how fast the target is descending and raises its own rate
   * above {@link DESCENT_ENGAGE_SPEED}. **Off unless a level asks for it**, and the level is the only
   * thing that can answer: a fall long enough to need it is the tower's, while the same speeds are
   * reachable in the hub by a homing dash aimed downward, in a camera nobody tuned for one. See
   * {@link DESCENT_ENGAGE_SPEED} for that arithmetic. With it off, `verticalSmoothing` is the rate on
   * every frame — the same single expression this file had before the term existed.
   */
  descentFollow: boolean;
}

/** Every level's camera starts from these and overrides only what it needs. Exported so a test can
 *  assert against the shipping value rather than a copy of it that would stay green after a retune. */
export const DEFAULT_CAMERA_CONFIG: FollowCameraConfig = {
  sensitivity: 0.005,
  minPitch: -1.2,
  maxPitch: 0.6,
  distance: 5,
  height: 1.2,
  aimHeight: 0.3,
  minCameraHeight: 0.5,
  nearPlane: 0.05,
  initialPitch: 0.15,
  verticalSmoothing: 9,
  descentFollow: false,
};

export interface FollowCamera {
  readonly camera: TargetCamera;
  /** Flattened, normalized camera right/forward on the X/Z plane, for camera-relative input. */
  planarBasis(): { right: { x: number; z: number }; forward: { x: number; z: number } };
  /**
   * Enables/disables pointer-look and pointer-lock capture (e.g. while an AVG overlay owns focus,
   * or while a level is being swapped out).
   *
   * Not symmetric, because pointer lock is not: disabling releases the lock, enabling cannot take it
   * back. See the implementation for why, and for what the player does instead.
   */
  setEnabled(value: boolean): void;
  /**
   * Re-seeds the vertical follow at wherever the target is NOW and re-places the camera there, so a
   * teleport reads as a cut rather than as a swoop across the level: the smoothing is
   * `verticalSmoothing` 9 per second, and a 53-unit jump was measured gliding in over ~0.5 s without
   * this. Pair it with `Player.teleport`, which resets what the character holds; this one is the
   * camera's.
   *
   * **Call it after the target has been moved, never before.** It re-seeds *from* the target, so
   * snapping first would seed the cut at the position the character is leaving. That is exactly what
   * this used to do, measured on a real tower respawn: the re-seed was left to the next frame and
   * `teleport` had not yet reached `root`, so the camera passed the checkpoint frame **3.6 u below**
   * where it belonged and took **24 frames (0.40 s at 60 fps)** to climb back within 0.1 u of it. It
   * now arrives on the checkpoint on the frame the respawn is decided, and does not move after.
   */
  snap(): void;
  /** Removes the canvas pointer listeners. */
  dispose(): void;
}

export function createFollowCamera(
  scene: Scene,
  target: TransformNode,
  canvas: HTMLCanvasElement,
  groundHeight: GroundHeight,
  descentFollow: boolean,
): FollowCamera {
  const config: FollowCameraConfig = { ...DEFAULT_CAMERA_CONFIG, descentFollow };
  // Tune live from the console, e.g. `cameraConfig.aimHeight = 0.1`. Changes apply next frame.
  exposeDevHandle(scene, 'cameraConfig', config);

  const camera = new TargetCamera('follow', new Vector3(0, config.height, config.distance), scene);
  camera.minZ = config.nearPlane;
  let yaw = 0;
  let pitch = config.initialPitch;
  let enabled = true;

  const onClick = () => { if (enabled) canvas.requestPointerLock(); };
  const onMouseMove = (e: MouseEvent) => {
    if (!enabled) return;
    if (document.pointerLockElement !== canvas) return;
    yaw -= e.movementX * config.sensitivity;
    pitch = Math.min(config.maxPitch, Math.max(config.minPitch, pitch - e.movementY * config.sensitivity));
  };
  canvas.addEventListener('click', onClick);
  canvas.addEventListener('mousemove', onMouseMove);

  let smoothY: number | null = null;
  /** Last frame's raw target Y, for measuring how fast the thing being followed is descending. */
  let lastTargetY: number | null = null;
  /**
   * Places the camera from wherever the target is at the moment of the call. The frame's own work,
   * and also `snap()`'s: a respawn is decided in an observer that runs AFTER this one, so re-seeding
   * and leaving the placement to the next frame is a frame of camera looking at a place the character
   * has left — and, before `Player.teleport` wrote `root`, a frame that re-seeded from the *old*
   * height and then eased back up to the checkpoint at rate 9 over 0.40 s. Called with `dt` 0 from a
   * snap, which is the seed branch below and measures no descent, so the destination — not a
   * teleport-sized step — is what `lastTargetY` carries into the next frame.
   */
  const place = (dt: number) => {
    camera.minZ = config.nearPlane;
    const t = target.getAbsolutePosition();
    // Follow X/Z tightly, but ease the vertical follow: the capsule's Y micro-steps as it crosses the
    // terrain collider's triangles (worst on descent), so copying it rigidly juddered the camera. When
    // grounded, anchor to the SMOOTH terrain height under the player instead of the capsule Y; only
    // follow the real Y when clearly airborne so jumps still read. A light lerp smooths the transition.
    // A world that cannot say where its ground is (`GroundHeight` answering null — the tower, whose
    // surfaces are all colliders) gets the same treatment as one whose ground is far below the
    // player: the anchor is the raw `t.y` and this anti-judder path does not apply. Nothing is lost
    // by that where there is nothing to damp — the tower's floor is a flat slab, and the terrain
    // triangles this exists for are the hub's. The lerp below is unconditional and still runs.
    const ground = groundHeight(t.x, t.z);
    const groundLevel = ground === null ? null : ground + CAPSULE_HALF;
    const targetY = groundLevel !== null && Math.abs(t.y - groundLevel) < GROUNDED_BAND ? groundLevel : t.y;
    // How fast the target is falling, from the RAW `t.y` and never from `targetY`: `targetY` steps
    // by up to GROUNDED_BAND when the grounded branch flips, and one frame of that reads as ~30 u/s
    // of descent that the character is not doing — which would engage the term below on an ordinary
    // jump between platforms, which this must not touch. `t.y` is the smoothed visual height and
    // moves continuously. A teleport up reads as a negative descent and is floored at zero.
    const descent = lastTargetY === null || dt <= 0 ? 0 : Math.max(0, (lastTargetY - t.y) / dt);
    lastTargetY = t.y;
    // Below DESCENT_ENGAGE_SPEED this is exactly `config.verticalSmoothing`; above it the follow
    // tightens so the player stays in frame through a fall. In a level that has not asked for the
    // term the expression is not evaluated at all. See DESCENT_SMOOTHING for the frustum arithmetic
    // and DESCENT_ENGAGE_SPEED for what the threshold has to clear and what it deliberately does not.
    const rate = config.descentFollow
      ? verticalFollowRate(config.verticalSmoothing, descent)
      : config.verticalSmoothing;
    if (smoothY === null || dt <= 0) smoothY ??= targetY;
    else smoothY += (targetY - smoothY) * (1 - Math.exp(-rate * dt));
    const anchor = new Vector3(t.x, smoothY, t.z);
    const offset = new Vector3(
      Math.sin(yaw) * Math.cos(pitch),
      Math.sin(-pitch),
      Math.cos(yaw) * Math.cos(pitch),
    ).scaleInPlace(config.distance);
    const position = anchor.add(offset).add(new Vector3(0, config.height, 0));
    // Keep the camera above the terrain directly under it — otherwise a downward pitch or a slope
    // rising behind the player pushes it below the one-sided ground and you see straight through it.
    // A world that cannot say where its ground is has no such surface to clear, and is left with
    // `minCameraHeight`, which is the same rule with a fixed height instead of a queried one.
    const groundUnderCamera = groundHeight(position.x, position.z);
    position.y = Math.max(position.y, config.minCameraHeight);
    if (groundUnderCamera !== null) {
      position.y = Math.max(position.y, groundUnderCamera + CAMERA_GROUND_CLEARANCE);
    }
    camera.position.copyFrom(position);
    camera.setTarget(anchor.add(new Vector3(0, config.aimHeight, 0)));
  };
  // Kept so `dispose` can take it off. `place` reads the target's absolute position and the ground
  // field, both of which outlive this camera by less than a frame during a level swap: `releaseRig`
  // takes the frame-loop subscriptions off before releasing what they read, and this is one of them.
  const onFrame = scene.onBeforeRenderObservable.add(() => place(scene.getEngine().getDeltaTime() / 1000));

  return {
    camera,
    planarBasis() {
      // Right-handed scene: the camera looks along its local -Z, so that (not Vector3.Forward(),
      // which is +Z) is the "into the screen" direction the player should move on W.
      const fwd = camera.getDirection(new Vector3(0, 0, -1));
      const rgt = camera.getDirection(new Vector3(1, 0, 0));
      const f = new Vector3(fwd.x, 0, fwd.z).normalize();
      const r = new Vector3(rgt.x, 0, rgt.z).normalize();
      return { right: { x: r.x, z: r.z }, forward: { x: f.x, z: f.z } };
    },
    // `null` rather than a value, so the re-seed reads the target itself — the same branch a freshly
    // built camera takes on its first frame — and then `place` puts the camera there before this
    // frame is drawn. The descent history goes with it: a respawn moves the target by tens of units
    // in one frame, and reading that as a speed would engage the descent term on a cut. Nothing here
    // waits for a later frame, so nothing here depends on which observer runs first.
    snap: () => {
      // Forced, and the fix does not work without it: Babylon caches a node's world matrix per
      // RENDER ID, and `getAbsolutePosition` returns that cache. The observer above has already read
      // the target this frame, so the write `Player.teleport` makes in a later observer is invisible
      // to an unforced read until the next frame — which is the stale height this whole re-seed
      // exists to stop reading. Measured on three observers in a row: the first reads 60, the second
      // writes 59, the third writes 100 and reads back **60**, the value the frame opened with.
      target.computeWorldMatrix(true);
      smoothY = null;
      lastTargetY = null;
      place(0);
    },
    setEnabled: (value: boolean) => {
      enabled = value;
      // Releasing on the way down is deliberate: an AVG overlay needs the cursor back, and a level
      // being swapped out must not keep the pointer captured for a camera about to be disposed.
      //
      // Nothing matching it on the way up, and that is not an oversight — `requestPointerLock`
      // needs transient user activation, so calling it from here (a resume, not a gesture) would be
      // rejected by the browser. `onClick` above is the only way back in, which means a resumed
      // level has keyboard and camera control at once and mouse look on the player's next click on
      // the canvas. Anything claiming otherwise would be a claim this code cannot keep.
      if (!value && document.pointerLockElement === canvas) document.exitPointerLock();
    },
    dispose: () => {
      scene.onBeforeRenderObservable.remove(onFrame);
      canvas.removeEventListener('click', onClick);
      canvas.removeEventListener('mousemove', onMouseMove);
    },
  };
}
