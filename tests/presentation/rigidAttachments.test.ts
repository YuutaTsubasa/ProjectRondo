import { afterEach, describe, expect, it } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Skeleton } from '@babylonjs/core/Bones/skeleton';
import { Bone } from '@babylonjs/core/Bones/bone';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { attachRigidSkinnedMeshes } from '../../src/presentation/babylon/rigidAttachments';

let engine: NullEngine;
afterEach(() => engine?.dispose());

/** A two-bone rig: Hips at y=1 and Foot below it, each linked to its glTF transform node. */
function rig() {
  engine = new NullEngine();
  const scene = new Scene(engine);
  const skeleton = new Skeleton('rig', 'rig', scene);
  const hipsNode = new TransformNode('Hips', scene);
  hipsNode.position.set(0, 1, 0);
  hipsNode.rotationQuaternion = Quaternion.Identity();
  const footNode = new TransformNode('Foot.L', scene);
  footNode.parent = hipsNode;
  footNode.position.set(0.1, -0.9, 0);
  footNode.rotationQuaternion = Quaternion.RotationAxis(Vector3.Up(), 0.4);
  const hips = new Bone('Hips', skeleton, null, Matrix.Translation(0, 1, 0));
  const foot = new Bone('Foot.L', skeleton, hips, Matrix.Compose(Vector3.One(), footNode.rotationQuaternion, footNode.position));
  hips.linkTransformNode(hipsNode);
  foot.linkTransformNode(footNode);
  const skinned = (name: string, indices: number[], weights: number[]) => {
    const mesh = new Mesh(name, scene);
    mesh.setVerticesData(VertexBuffer.PositionKind, [0.1, 0.05, 0.02, 0.12, 0.05, 0.1]);
    mesh.setVerticesData(VertexBuffer.MatricesIndicesKind, indices);
    mesh.setVerticesData(VertexBuffer.MatricesWeightsKind, weights);
    mesh.skeleton = skeleton;
    return mesh;
  };
  return { scene, skeleton, foot, footNode, skinned };
}

describe('rigid skinned attachments', () => {
  it('turns a mesh weighted wholly to one joint into a plain child of that joint, keeping its pose', () => {
    const { skeleton, footNode, skinned } = rig();
    const sole = skinned('Closed metal sole.L', [1, 0, 0, 0, 1, 0, 0, 0], [1, 0, 0, 0, 1, 0, 0, 0]);
    skeleton.prepare();
    // Where skinning puts the first vertex: joint world × inverse bind × bind-space position.
    const bone = skeleton.bones[1]!;
    const skinnedWorld = Vector3.TransformCoordinates(new Vector3(0.1, 0.05, 0.02),
      bone.getAbsoluteInverseBindMatrix().multiply(footNode.computeWorldMatrix(true)));

    expect(attachRigidSkinnedMeshes([sole])).toEqual(['Closed metal sole.L']);
    expect(sole.skeleton).toBeNull();
    expect(sole.parent).toBe(footNode);
    const rigidWorld = Vector3.TransformCoordinates(new Vector3(0.1, 0.05, 0.02), sole.computeWorldMatrix(true));
    expect(Vector3.Distance(rigidWorld, skinnedWorld)).toBeLessThan(1e-5);
  });

  it('leaves meshes that blend several joints skinned', () => {
    const { skeleton, skinned } = rig();
    const armor = skinned('Armor_primitive0', [0, 1, 0, 0, 1, 0, 0, 0], [0.5, 0.5, 0, 0, 1, 0, 0, 0]);
    expect(attachRigidSkinnedMeshes([armor])).toEqual([]);
    expect(armor.skeleton).toBe(skeleton);
  });
});
