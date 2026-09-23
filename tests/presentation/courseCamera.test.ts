// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { createFollowCamera } from '../../src/presentation/babylon/followCamera';
import { unknownGround } from '../../src/presentation/babylon/groundHeight';
it('lets a forward course start facing +Z while retaining the existing default heading', () => {
  const engine = new NullEngine();
  const scene = new Scene(engine); scene.useRightHandedSystem = true;
  const root = new TransformNode('player', scene);
  const first = createFollowCamera(scene, root, document.createElement('canvas'), unknownGround, true, Math.PI);
  first.snap(); scene.activeCamera = first.camera; scene.render();
  expect(first.planarBasis().forward.z).toBeCloseTo(1);
  expect(first.camera.position.z).toBeLessThan(root.position.z);
  first.dispose();
  const original = createFollowCamera(scene, root, document.createElement('canvas'), unknownGround, false);
  original.snap(); scene.activeCamera = original.camera; scene.render();
  expect(original.planarBasis().forward.z).toBeCloseTo(-1);
  original.dispose(); scene.dispose(); engine.dispose();
});
