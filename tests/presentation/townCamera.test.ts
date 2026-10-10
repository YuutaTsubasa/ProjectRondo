import { describe, expect, it } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { TargetCamera } from '@babylonjs/core/Cameras/targetCamera';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { townCameraPosition } from '../../src/presentation/town/townCamera';

const solids = [{ min: new Vector3(-2, 0, -5), max: new Vector3(2, 10, -3) }];

describe('town and region camera obstruction', () => {
  it.each([
    ['inside the collision padding', new Vector3(0, 2, -2.8)],
    ['just outside the padding', new Vector3(0, 2, -2.7)],
    ['inside a solid', new Vector3(0, 2, -3.5)],
  ])('keeps a usable view while %s and after leaving the wall', (_, aim) => {
    const engine = new NullEngine(), scene = new Scene(engine);
    scene.useRightHandedSystem = true;
    const camera = new TargetCamera('follow', new Vector3(0, 3, 7), scene);
    try {
      const desired = aim.add(new Vector3(0, .2, -7));
      camera.position.copyFrom(townCameraPosition(aim, desired, solids));
      camera.setTarget(aim);
      camera.getViewMatrix(true);
      expect(camera.getDirection(new Vector3(0, 0, -1)).length()).toBeCloseTo(1, 5);
      // A zero focal distance poisons TargetCamera's reference vector permanently:
      // merely restoring the usual follow position/target would not recover it.
      camera.position.set(0, 3, 7);
      camera.setTarget(new Vector3(0, 1.3, 0));
      camera.getViewMatrix(true);
      expect(Math.abs(camera.getViewMatrix().determinant())).toBeCloseTo(1, 5);
      expect(camera.getDirection(new Vector3(0, 0, -1)).length()).toBeCloseTo(1, 5);
    } finally { scene.dispose(); engine.dispose(); }
  });

  it('still stops in front of walls and preserves unobstructed placement', () => {
    const aim = new Vector3(0, 2, 0);
    const stopped = townCameraPosition(aim, new Vector3(0, 3, -7), solids);
    expect(stopped.z).toBeGreaterThan(-2.75);
    expect(stopped.z).toBeLessThan(0);
    const clear = new Vector3(6, 3, 0);
    expect(townCameraPosition(aim, clear, solids)).toEqual(clear);
  });

  it('does not pull the camera into the character when the aim starts inside a solid or its padding', () => {
    // Aim inside an oversized box (e.g. a rounded boulder's AABB): keep the full boom.
    const inside = new Vector3(0, 2, -4), behind = new Vector3(0, 3, 3);
    expect(townCameraPosition(inside, behind, solids)).toEqual(behind);
    // Aim in the padding beside a wall: stop at the wall surface rather than collapsing to 0.1 u.
    const hugging = new Vector3(0, 2, -2.8);
    const stopped = townCameraPosition(hugging, new Vector3(0, 3, -9.8), solids);
    expect(Vector3.Distance(stopped, hugging)).toBeLessThan(.25);
    const away = townCameraPosition(hugging, new Vector3(0, 3, 4.2), solids);
    expect(away.z).toBeCloseTo(4.2, 5);
  });

  it('skips solids beyond the boom without changing the result', () => {
    const aim = new Vector3(0, 2, 0), desired = new Vector3(0, 3, 7);
    const far = [...solids, { min: new Vector3(100, 0, 100), max: new Vector3(110, 10, 110) }];
    expect(townCameraPosition(aim, desired, far)).toEqual(townCameraPosition(aim, desired, []));
  });
});
