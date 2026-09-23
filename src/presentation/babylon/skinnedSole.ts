import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';

/** Measure CPU-skinned soles after explicitly synchronizing the intended pose.
 * Linked glTF transform nodes can change without marking the skeleton's cached palette dirty.
 * A bounds refresh alone therefore may still measure the bind pose, even after a render callback.
 */
export function measureSkinnedSole(meshes: readonly AbstractMesh[]): number {
  for (const skeleton of new Set(meshes.map((mesh) => mesh.skeleton))) skeleton?.prepare(true);
  for (const mesh of meshes) {
    mesh.computeWorldMatrix(true);
    mesh.refreshBoundingInfo({ applySkeleton: true, applyMorph: false });
  }
  return Math.min(...meshes.map((mesh) => mesh.getBoundingInfo().boundingBox.minimumWorld.y));
}
