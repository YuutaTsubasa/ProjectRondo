// src/presentation/babylon/trees.ts
import type { Scene } from '@babylonjs/core/scene';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { ImportMeshAsync } from '@babylonjs/core/Loading/sceneLoader';
import '@babylonjs/loaders/glTF'; // side-effect: registers the glTF loader

/** Fixed scatter: [x, z, yawRadians, scale]. Includes the old Godot pillar corners (±8, ±8); the
 *  centre (~radius 5) is left clear so no tree spawns on the player's spawn point. */
const SPOTS: readonly [number, number, number, number][] = [
  [8, -8, 0.3, 1.0], [-8, -8, 1.9, 1.15], [8, 8, 2.7, 0.9], [-8, 8, 0.8, 1.05],
  [17, 3, 1.2, 1.2], [-16, -4, 2.2, 1.1], [3, -18, 0.5, 1.0], [-5, 18, 3.0, 1.15],
  [19, -15, 1.7, 0.95], [-19, 14, 0.2, 1.0],
];

/**
 * Loads /models/tree.glb and scatters copies across the field as shadow-casting trees. If the GLB is
 * absent (not added yet), logs a note and no-ops so the rest of the scene still renders.
 * The GLB should be texture-optimized offline like the knight (gltf-transform: `resize --width 1024
 * --height 1024` then `webp --quality 80`; do NOT run geometry/animation optimization).
 */
export async function loadTrees(scene: Scene, shadowGenerator?: ShadowGenerator): Promise<void> {
  let result;
  try {
    result = await ImportMeshAsync('/models/tree.glb?v=1', scene);
  } catch {
    console.info('[trees] /models/tree.glb not found — skipping trees (add the GLB to enable them).');
    return;
  }
  const root = result.meshes[0] as TransformNode;
  const registerCasters = (node: TransformNode) => {
    if (shadowGenerator)
      for (const m of node.getChildMeshes(false)) if (m.getTotalVertices() > 0) shadowGenerator.addShadowCaster(m);
  };

  // Tree #0 = the loaded model itself; the rest are clones (geometry is shared by reference).
  const place = (node: TransformNode, [x, z, yaw, scale]: readonly [number, number, number, number]) => {
    node.position.set(x, 0, z);
    node.rotation.set(0, yaw, 0);
    node.scaling.setAll(scale);
    registerCasters(node);
  };
  place(root, SPOTS[0]);
  for (let i = 1; i < SPOTS.length; i++) {
    const clone = root.clone(`tree_${i}`, null);
    if (clone) place(clone, SPOTS[i]);
  }
}
