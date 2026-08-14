import type { Scene } from '@babylonjs/core/scene';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { TargetCamera } from '@babylonjs/core/Cameras/targetCamera';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';

const SENSITIVITY = 0.005;
const MIN_PITCH = -1.2;
const MAX_PITCH = 0.6;
const DISTANCE = 6;
const HEIGHT = 2;

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
    camera.position.copyFrom(t.add(offset).add(new Vector3(0, HEIGHT, 0)));
    camera.setTarget(t.add(new Vector3(0, HEIGHT * 0.5, 0)));
  });

  return {
    camera,
    planarBasis() {
      const fwd = camera.getDirection(Vector3.Forward());
      const f = new Vector3(fwd.x, 0, fwd.z).normalize();
      const r = new Vector3(f.z, 0, -f.x); // right = forward rotated -90° on Y
      return { right: { x: r.x, z: r.z }, forward: { x: f.x, z: f.z } };
    },
  };
}
