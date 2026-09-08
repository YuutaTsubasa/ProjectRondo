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
  /** Enables/disables pointer-look and pointer-lock capture (e.g. while an AVG overlay owns focus). */
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
    if (smoothY === null || dt <= 0) smoothY ??= targetY;
    else smoothY += (targetY - smoothY) * (1 - Math.exp(-config.verticalSmoothing * dt));
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
    snap: () => { smoothY = null; },
    setEnabled: (value: boolean) => {
      enabled = value;
      // Suspending mid-drag shouldn't leave the pointer captured under an AVG overlay.
      if (!value && document.pointerLockElement === canvas) document.exitPointerLock();
    },
    dispose: () => {
      canvas.removeEventListener('click', onClick);
      canvas.removeEventListener('mousemove', onMouseMove);
    },
  };
}
