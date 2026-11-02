import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';

/**
 * Re-parent skinned meshes whose every vertex follows one joint at full weight, as plain children
 * of that joint's node at its inverse bind transform — the same pose skinning would give them.
 *
 * H01-B01's boot rims and metal soles are such pieces (100% Foot). GPU-skinned, they sampled the
 * skeleton's 264×1 bone-matrix texture as their base color and drew rainbow bands along the heel;
 * bones stored in uniforms or CPU skinning rendered them correctly. A rigid child needs neither.
 * Returns the names of the meshes it converted.
 */
export function attachRigidSkinnedMeshes(meshes: readonly AbstractMesh[]): string[] {
  const converted: string[] = [];
  for (const mesh of meshes) {
    const skeleton = mesh.skeleton;
    if (!skeleton || !(mesh instanceof Mesh)) continue;
    const indices = mesh.getVerticesData(VertexBuffer.MatricesIndicesKind);
    const weights = mesh.getVerticesData(VertexBuffer.MatricesWeightsKind);
    if (!indices || !weights || mesh.getVerticesData(VertexBuffer.MatricesWeightsExtraKind)) continue;
    let joint = -1;
    let rigid = true;
    for (let v = 0; v < weights.length && rigid; v += 4) {
      for (let i = v; i < v + 4; i++) {
        if (weights[i]! === 0) continue;
        if (Math.abs(weights[i]! - 1) > 1e-4 || (joint >= 0 && indices[i] !== joint)) { rigid = false; break; }
        joint = indices[i]!;
      }
    }
    const bone = rigid && joint >= 0 ? skeleton.bones[joint] : undefined;
    const node = bone?.getTransformNode();
    if (!bone || !node) continue;
    const scaling = new Vector3(), rotation = new Quaternion(), position = new Vector3();
    bone.getAbsoluteInverseBindMatrix().decompose(scaling, rotation, position);
    mesh.skeleton = null;
    mesh.parent = node;
    mesh.position.copyFrom(position);
    mesh.rotationQuaternion = rotation;
    mesh.scaling.copyFrom(scaling);
    converted.push(mesh.name);
  }
  return converted;
}
