import type { Scene } from '@babylonjs/core/scene';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { TargetCamera } from '@babylonjs/core/Cameras/targetCamera';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';

const SENSITIVITY = 0.005;
const MIN_PITCH = -1.2;
const MAX_PITCH = 0.6;
const DISTANCE = 5;
const HEIGHT = 1.2;
/**
 * Keep the camera this far above the ground (y = 0). Looking up drives the orbit low; without this
 * the camera sinks to/below the floor and the opaque ground plane occludes the whole character.
 */
const MIN_CAMERA_HEIGHT = 0.5;

export interface FollowCamera {
  readonly camera: TargetCamera;
  /** Flattened, normalized camera right/forward on the X/Z plane, for camera-relative input. */
  planarBasis(): { right: { x: number; z: number }; forward: { x: number; z: number } };
}

export function createFollowCamera(scene: Scene, target: TransformNode, canvas: HTMLCanvasElement): FollowCamera {
  const camera = new TargetCamera('follow', new Vector3(0, HEIGHT, DISTANCE), scene);
  let yaw = 0;
  let pitch = -0.35;

  canvas.addEventListener('click', () => canvas.requestPointerLock());
  canvas.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement !== canvas) return;
    yaw -= e.movementX * SENSITIVITY;
    pitch = Math.min(MAX_PITCH, Math.max(MIN_PITCH, pitch - e.movementY * SENSITIVITY));
  });

  scene.onBeforeRenderObservable.add(() => {
    const t = target.getAbsolutePosition();
    const offset = new Vector3(
      Math.sin(yaw) * Math.cos(pitch),
      Math.sin(-pitch),
      Math.cos(yaw) * Math.cos(pitch),
    ).scaleInPlace(DISTANCE);
    const position = t.add(offset).add(new Vector3(0, HEIGHT, 0));
    // Never let the camera dip into the floor, or the opaque ground plane hides the whole character.
    position.y = Math.max(position.y, MIN_CAMERA_HEIGHT);
    camera.position.copyFrom(position);
    camera.setTarget(t.add(new Vector3(0, HEIGHT * 0.5, 0)));
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
  };
}
