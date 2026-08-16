import type { Scene } from '@babylonjs/core/scene';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { TargetCamera } from '@babylonjs/core/Cameras/targetCamera';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';

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
  initialPitch: -0.35,
};

export interface FollowCamera {
  readonly camera: TargetCamera;
  /** Flattened, normalized camera right/forward on the X/Z plane, for camera-relative input. */
  planarBasis(): { right: { x: number; z: number }; forward: { x: number; z: number } };
  /** Enables/disables pointer-look and pointer-lock capture (e.g. while an AVG overlay owns focus). */
  setEnabled(value: boolean): void;
  /** Removes the canvas pointer listeners. */
  dispose(): void;
}

export function createFollowCamera(scene: Scene, target: TransformNode, canvas: HTMLCanvasElement): FollowCamera {
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

  scene.onBeforeRenderObservable.add(() => {
    camera.minZ = config.nearPlane;
    const t = target.getAbsolutePosition();
    const offset = new Vector3(
      Math.sin(yaw) * Math.cos(pitch),
      Math.sin(-pitch),
      Math.cos(yaw) * Math.cos(pitch),
    ).scaleInPlace(config.distance);
    const position = t.add(offset).add(new Vector3(0, config.height, 0));
    // Never let the camera dip into the floor, or the opaque ground plane hides the whole character.
    position.y = Math.max(position.y, config.minCameraHeight);
    camera.position.copyFrom(position);
    camera.setTarget(t.add(new Vector3(0, config.aimHeight, 0)));
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
