import type { Scene } from '@babylonjs/core/scene';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { TargetCamera } from '@babylonjs/core/Cameras/targetCamera';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { GroundHeight } from './groundHeight';
import { CAPSULE_HALF } from './capsule';

/** While |playerY − groundLevel| is under this, treat the player as grounded and anchor the camera to
 *  the smooth terrain (not the jittery capsule); a jump clears it at once. Covers float + slope rest. */
const GROUNDED_BAND = 0.5;

/** Minimum gap the camera keeps above the terrain beneath it, so it never dips through the ground. */
const CAMERA_GROUND_CLEARANCE = 0.6;

/**
 * Where the descent-aware vertical follow starts and finishes engaging, in world units per second of
 * downward target motion, and the smoothing rate it reaches. **All three Untuned** — nobody has
 * played a tower fall. What they are is the output of two measurements: what the frustum needs, and
 * what the hub can and cannot reach.
 *
 * **Why the follow needs a second rate at all.** An exponential smoother trails a target descending at
 * `v` by `v / rate`. At {@link FollowCameraConfig.verticalSmoothing} 9 that is 3.44 u at the 30.98 u/s
 * ending a 20 u tower section, against a frustum half-height of `distance · tan(fov/2)` =
 * `5 · tan(22.92°)` = **2.11 u** at the aim plane — so the player leaves the bottom of the frame
 * partway down every fall. Measured on a real tower fall before this term existed: the knight's root
 * crossed the bottom edge **8.16 u in, at t = 0.80 s and 19.6 u/s**, and by the respawn was 1.40 of a
 * frame-height down, with the head itself 1.19 — no knight on screen at all, which is design spec
 * §13.2's finding reproduced (it measured 8.6 u / 0.844 s on its own trace). With the term, the same
 * fall keeps the root at 0.73–0.85 of the frame from the moment it engages.
 *
 * **Why it engages at 17 u/s.** This is bounded on both sides, and the window is narrow. Above:
 * unaided, the root reaches the bottom edge at 19.6 u/s, so a threshold at or above that engages too
 * late to help. Below: the hub has to stay under it. Two measurements of the hub's ceiling —
 *
 * - **In play, 15.8 u/s.** Scripted walk/run/jump runs across the height field, clear of the homing
 *   test crystals, peaked there (`motion.velocity.y`), and the *rendered* root — the thing this term
 *   actually measures — peaked at 14.28 u/s.
 * - **As a bound, 16.6 u/s.** A ballistic sweep over every walkable launch point (r ≤ `EDGE_RADIUS`
 *   42, 0.5 u grid, 32 directions, launched at `jumpSpeed` 9 and at 0, flown at `runSpeed` 8 until it
 *   meets the terrain again) tops out there. It is an over-estimate: it flies a free parabola through
 *   ground the capsule would have landed on.
 *
 * 17 clears the stricter of the two. Verified rather than argued: the same scripted hub runs give a
 * camera trace **identical to ten decimal places** with and without this term, across 1200 frames.
 *
 * **What the hub CAN reach is 19.8 u/s, and it is not walking, running or jumping** — it is falling
 * off the top of the homing chain, whose test crystals reach y = 8 with a bounce above that. On those
 * frames this term does engage and the hub camera tracks tighter than it used to. That is stated, not
 * designed around: `followCamera` is given a transform, not a character, and cannot tell that fall
 * from a tower fall. The ramp is what keeps it cheap — just over the threshold the rate has barely
 * moved off 9, so brushing it is not a step change.
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
 * earlier than the hub allows, which is the thing this must not do.
 */
export const DESCENT_ENGAGE_SPEED = 17;
const DESCENT_FULL_SPEED = 18;
export const DESCENT_SMOOTHING = 44;

/**
 * The vertical follow's rate this frame, given how fast the target is descending. See
 * {@link DESCENT_ENGAGE_SPEED} for every number in it.
 *
 * Exported for its test, and the property the test is there to hold is the first line: at or below
 * the engage speed this returns `base` **identically**, not approximately, which is what makes "the
 * hub's camera is unchanged" a fact about the arithmetic rather than a claim about tuning.
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
}

const DEFAULT_CONFIG: FollowCameraConfig = {
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
   * Drops the vertical follow's smoothed state, so the next frame re-seeds it at wherever the target
   * now is instead of easing across from where the target used to be. For a teleport — a checkpoint
   * respawn — where the ease is not a smoothing but a swoop: the smoothing is `verticalSmoothing` 9
   * per second, so a 53-unit jump was measured gliding in over ~0.5 s. Pair it with `Player.teleport`,
   * which resets the three things on the character's side; this one is the camera's.
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
): FollowCamera {
  const config: FollowCameraConfig = { ...DEFAULT_CONFIG };
  if (import.meta.env.DEV) {
    // Tune live from the console, e.g. `cameraConfig.aimHeight = 0.1`. Changes apply next frame.
    (window as unknown as { cameraConfig: FollowCameraConfig }).cameraConfig = config;
  }

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
   * Observer frames left in which the descent measurement is suppressed, because a `snap()` says the
   * target has just been teleported and the jump is not a speed. Two, not one: `Player.teleport`
   * writes the controller and the smoothed visual height, and `root` only picks that up in
   * `playerController`'s own observer — which runs AFTER this one, since the camera is built before
   * the player. So the frame a snap arrives on still reads the OLD `t.y` into `lastTargetY`, and the
   * whole teleport shows up as one frame's movement on the frame after that.
   */
  let teleportSettleFrames = 0;
  scene.onBeforeRenderObservable.add(() => {
    camera.minZ = config.nearPlane;
    const dt = scene.getEngine().getDeltaTime() / 1000;
    const t = target.getAbsolutePosition();
    // Follow X/Z tightly, but ease the vertical follow: the capsule's Y micro-steps as it crosses the
    // terrain collider's triangles (worst on descent), so copying it rigidly juddered the camera. When
    // grounded, anchor to the SMOOTH terrain height under the player instead of the capsule Y; only
    // follow the real Y when clearly airborne so jumps still read. A light lerp smooths the transition.
    // Where the ground query answers a plane far below the player — a world of stacked platforms —
    // the GROUNDED_BAND test fails on every frame, so the anchor is the raw `t.y` and this
    // anti-judder path simply does not apply; the lerp below is unconditional and still runs.
    const groundLevel = groundHeight(t.x, t.z) + CAPSULE_HALF;
    const targetY = Math.abs(t.y - groundLevel) < GROUNDED_BAND ? groundLevel : t.y;
    // How fast the target is falling, from the RAW `t.y` and never from `targetY`: `targetY` steps
    // by up to GROUNDED_BAND when the grounded branch flips, and one frame of that reads as ~30 u/s
    // of descent that the character is not doing — which would engage the term below on an ordinary
    // hub jump, the one thing this must not touch. `t.y` is the smoothed visual height and moves
    // continuously. A teleport up reads as a negative descent and is floored at zero.
    const teleporting = teleportSettleFrames > 0;
    if (teleporting) teleportSettleFrames--;
    const descent = teleporting || lastTargetY === null || dt <= 0
      ? 0
      : Math.max(0, (lastTargetY - t.y) / dt);
    lastTargetY = t.y;
    // Below DESCENT_ENGAGE_SPEED this is exactly `config.verticalSmoothing` and the hub's camera is
    // untouched; above it the follow tightens so the player stays in frame through a fall. See
    // DESCENT_SMOOTHING for the frustum arithmetic and for the hub bound the threshold clears.
    const rate = verticalFollowRate(config.verticalSmoothing, descent);
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
    const groundUnderCamera = groundHeight(position.x, position.z) + CAMERA_GROUND_CLEARANCE;
    position.y = Math.max(position.y, config.minCameraHeight, groundUnderCamera);
    camera.position.copyFrom(position);
    camera.setTarget(anchor.add(new Vector3(0, config.aimHeight, 0)));
  });

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
    // `null` rather than a value, so the re-seed happens in the observer against the target's position
    // on the frame it actually runs — the same branch a freshly built camera takes on its first frame.
    // The descent measurement with it: a respawn moves the target by tens of units in one frame, and
    // reading that as a speed would engage the descent term on a cut. See `teleportSettleFrames` for
    // why suppressing it takes two frames rather than one.
    snap: () => { smoothY = null; lastTargetY = null; teleportSettleFrames = 2; },
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
      canvas.removeEventListener('click', onClick);
      canvas.removeEventListener('mousemove', onMouseMove);
    },
  };
}
