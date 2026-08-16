// src/presentation/babylon/trees.ts
import type { Scene } from '@babylonjs/core/scene';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import { Quaternion } from '@babylonjs/core/Maths/math.vector';
import '@babylonjs/loaders/glTF'; // side-effect: registers the glTF loader

/** The tree GLB is normalized to ~1 unit tall (Tripo output); scale it up to a real tree height.
 *  The per-spot scale below multiplies this, so trees land around 6 units (taller than the ~1.9 knight). */
const BASE_SCALE = 6;

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
 *
 * Uses an AssetContainer + `instantiateModelsToScene` (rather than `mesh.clone`) so the whole
 * multi-node glTF hierarchy is duplicated correctly — a naive clone of the loader's `__root__` leaves
 * the geometry behind at the origin. `doNotInstantiate: true` produces real cloned meshes so each tree
 * registers as a normal shadow caster.
 *
 * The GLB should be texture-optimized offline like the knight (gltf-transform: `resize --width 1024
 * --height 1024` then `webp --quality 80`; trees are static, so geometry `simplify` is also safe here).
 */
export async function loadTrees(scene: Scene, shadowGenerator?: ShadowGenerator): Promise<void> {
  let container;
  try {
    container = await LoadAssetContainerAsync('/models/tree.glb?v=2', scene);
  } catch (err) {
    // Absent asset OR a real load failure (bad GLB, network) both reject here — log the cause so a
    // genuine error isn't mistaken for "just not added yet". Either way, skip trees and keep the scene.
    console.info('[trees] tree.glb not loaded — skipping trees (add /public/models/tree.glb to enable):', err);
    return;
  }

  SPOTS.forEach(([x, z, yaw, scale], i) => {
    const { rootNodes } = container.instantiateModelsToScene((name) => `tree_${i}_${name}`, false, {
      doNotInstantiate: true,
    });
    const root = rootNodes[0] as TransformNode;
    root.position.set(x, 0, z);
    root.rotationQuaternion = Quaternion.FromEulerAngles(0, yaw, 0);
    root.scaling.setAll(BASE_SCALE * scale);
    if (shadowGenerator)
      for (const mesh of root.getChildMeshes(false)) if (mesh.getTotalVertices() > 0) shadowGenerator.addShadowCaster(mesh);
  });
}
