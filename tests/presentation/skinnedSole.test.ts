import { afterEach, describe, expect, it } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { Skeleton } from '@babylonjs/core/Bones/skeleton';
import { Bone } from '@babylonjs/core/Bones/bone';
import { Matrix } from '@babylonjs/core/Maths/math.vector';
import { measureSkinnedSole } from '../../src/presentation/babylon/skinnedSole';

const disposers: (() => void)[] = [];
afterEach(() => { for (const dispose of disposers.splice(0)) dispose(); });

function rig() {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  disposers.push(() => { scene.dispose(); engine.dispose(); });
  const parent = new TransformNode('capsule', scene);
  parent.position.y = 1.6;
  const root = new TransformNode('visual', scene);
  root.parent = parent;
  root.position.y = -1;
  root.scaling.setAll(1.05);
  const mesh = CreateBox('skinned-shoe', { size: 2 }, scene);
  mesh.parent = root;
  mesh.position.y = 1;
  const skeleton = new Skeleton('rig', 'rig', scene);
  const bone = new Bone('sole', skeleton, null, Matrix.Identity());
  const animated = new TransformNode('animated-bone', scene);
  bone.linkTransformNode(animated);
  mesh.skeleton = skeleton;
  mesh.setVerticesData(VertexBuffer.MatricesIndicesKind, Array(mesh.getTotalVertices() * 4).fill(0));
  mesh.setVerticesData(VertexBuffer.MatricesWeightsKind,
    Array.from({ length: mesh.getTotalVertices() * 4 }, (_, i) => i % 4 === 0 ? 1 : 0));
  // Prime precisely the stale bind-pose matrices the first-frame pass used to accept.
  mesh.computeWorldMatrix(true);
  skeleton.prepare(true);
  animated.position.y = 0.8;
  return { mesh, animated, parent };
}

describe('initial skinned sole measurement', () => {
  it('prepares linked bones instead of reading the cached bind-pose sole', () => {
    const { mesh } = rig();
    expect(measureSkinnedSole([mesh])).toBeCloseTo(1.44, 5);
  });

  it('refreshes ancestor world transforms when the capsule moves before calibration', () => {
    const { mesh, parent } = rig();
    parent.position.y += 3;
    expect(measureSkinnedSole([mesh])).toBeCloseTo(4.44, 5);
  });
});
