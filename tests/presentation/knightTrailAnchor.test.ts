// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { anchorKnightTrail } from '../../src/presentation/babylon/knight';
import { CAPSULE_HALF } from '../../src/presentation/babylon/capsule';
import { PLAYER_MODEL } from '../../src/presentation/babylon/playerModel';

const cleanup: (() => void)[] = [];
afterEach(() => { for (const release of cleanup.splice(0)) release(); });
function mount() {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  cleanup.push(() => { scene.dispose(); engine.dispose(); });
  const player = new TransformNode('player', scene);
  player.position.set(8, 4, -3);
  player.rotationQuaternion = Quaternion.FromEulerAngles(0, 1.2, 0);
  const root = new TransformNode('importRoot', scene);
  root.parent = player;
  root.position.y = -0.78;
  root.scaling.setAll(0.72);
  const generator = new TransformNode('trailGenerator', scene);
  return { scene, player, root, generator };
}

describe('trail origin on the posed torso', () => {
  it('follows the imported chest during a kick even when the hips lift and torso rotates', () => {
    const { scene, root, generator } = mount();
    const hips = new TransformNode('Hips', scene);
    hips.parent = root;
    hips.position.y = 1.4;
    const chest = new TransformNode('Chest', scene);
    chest.parent = hips;
    chest.position.set(0, 0.35, 0.04);
    anchorKnightTrail(generator, root, [hips, chest]);
    for (const lift of [0, 0.45, 0.9]) {
      hips.position.y = 1.4 + lift;
      hips.rotationQuaternion = Quaternion.FromEulerAngles(0.4 + lift, 0, 0);
      root.computeWorldMatrix(true);
      hips.computeWorldMatrix(true);
      chest.computeWorldMatrix(true);
      generator.computeWorldMatrix(true);
      expect(Vector3.Distance(generator.getAbsolutePosition(), chest.getAbsolutePosition())).toBeLessThan(1e-6);
    }
  });

  it('keeps the seated torso fallback if this import has no chest, ignoring other characters', () => {
    const { scene, player, root, generator } = mount();
    const unrelatedChest = new TransformNode('Chest', scene);
    unrelatedChest.position.y = 50;
    anchorKnightTrail(generator, root, []);
    generator.computeWorldMatrix(true);
    expect(generator.getAbsolutePosition().y).toBeCloseTo(player.position.y - CAPSULE_HALF + PLAYER_MODEL.height / 2);
    expect(generator.parent).toBe(root);
  });
});
