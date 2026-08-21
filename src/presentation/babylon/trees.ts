import type { Scene } from '@babylonjs/core/scene';
import type { AssetContainer } from '@babylonjs/core/assetContainer';
import type { Material } from '@babylonjs/core/Materials/material';
import type { BaseTexture } from '@babylonjs/core/Materials/Textures/baseTexture';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import { Quaternion } from '@babylonjs/core/Maths/math.vector';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import '@babylonjs/core/Materials/standardMaterial'; // side-effect: StandardMaterial shader
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import { PhysicsAggregate } from '@babylonjs/core/Physics/v2/physicsAggregate';
import { PhysicsShapeType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin';
import { terrainHeight } from './terrainHeight';
import '@babylonjs/loaders/glTF'; // side-effect: registers the glTF loader

/** The tree GLB is normalized to ~1 unit tall (Tripo output); scale it up to a real tree height.
 *  The per-spot scale below multiplies this, so trees land around 6 units (taller than the ~1.9 knight). */
const BASE_SCALE = 6;

/** The GLB ships a `PBRMaterial`; every other surface in the hub is a `StandardMaterial`, and that
 *  mismatch only becomes visible once fog is on. PBR shades and mixes fog in linear space, where a
 *  small blend toward a near-white fog colour multiplies a dark pixel several-fold; StandardMaterial
 *  mixes in gamma space, where the same blend barely moves it. Measured at the spawn viewpoint, a tree
 *  ~27 units out took a 0.32 fog blend where EXP2 asks for 0.04 and the grass beside it took 0.07 — so
 *  the trees bleached to grey while the terrain behind them looked untouched. That reads as "the fog
 *  is only on the trees", but the fog is uniform; the trees were the only surface reacting in linear
 *  space, and the only one dark enough for it to show.
 *
 *  Rebuilding over the same albedo texture as a StandardMaterial puts them back in line: near
 *  0.32 -> 0.09, mid 0.47 -> 0.18, against 0.19 for the terrain behind them, with the grass beside
 *  them unchanged at 0.07 as a control. Nothing is lost — the source is metallic 0 with no
 *  metallic-roughness map, i.e. diffuse-only already. */

/** Gamma-space shading lands the canopy far darker than PBR did, so scale up the texture's
 *  contribution. Note the emissive floor `scatter.ts` uses on grass and bushes does NOT transfer
 *  here: StandardMaterial folds `emissiveColor` in before multiplying by the diffuse texture, so on a
 *  dark canopy texel it scales to nothing — measured, a 4x emissive sweep moved the canopy by 3/255.
 *  2.5 was picked against the pre-conversion render at the spawn viewpoint. */
const TREE_TEXTURE_LEVEL = 2.5;

/** Trunk collider: a thin invisible cylinder so the player stops at the trunk, not the canopy. */
const TRUNK_RADIUS = 0.5;
const TRUNK_HEIGHT = 4;

/** Fixed scatter: [x, z, yawRadians, scale]. Spread across the enlarged 100×100 field (out to ±36);
 *  the centre (~radius 5) is left clear so no tree spawns on the player's spawn point. */
const SPOTS: readonly [number, number, number, number][] = [
  [12, -14, 0.3, 1.0], [-13, -12, 1.9, 1.15], [14, 13, 2.7, 0.9], [-15, 15, 0.8, 1.05],
  [26, 5, 1.2, 1.2], [-25, -7, 2.2, 1.1], [6, -28, 0.5, 1.0], [-8, 27, 3.0, 1.15],
  [30, -22, 1.7, 0.95], [-30, 22, 0.2, 1.0], [34, 12, 2.4, 1.05], [-34, -14, 1.1, 0.95],
  [18, 30, 0.9, 1.1], [-20, -30, 2.6, 1.0], [2, 34, 1.5, 1.05], [-3, -34, 0.4, 0.95],
  [36, -4, 2.0, 1.0], [-36, 6, 0.7, 1.1], [21, -33, 1.3, 0.9], [-24, 33, 2.9, 1.05],
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
    container = await LoadAssetContainerAsync('/models/tree.glb?v=4', scene);
  } catch (err) {
    // Absent asset OR a real load failure (bad GLB, network) both reject here — log the cause so a
    // genuine error isn't mistaken for "just not added yet". Either way, skip trees and keep the scene.
    console.info('[trees] tree.glb not loaded — skipping trees (add /public/models/tree.glb to enable):', err);
    return;
  }

  // Swap once on the container, before instantiation: every clone copies the container mesh's
  // material reference, so doing this per tree would rebuild the same material once per spot.
  retargetMaterials(scene, container);

  SPOTS.forEach(([x, z, yaw, scale], i) => {
    const { rootNodes } = container.instantiateModelsToScene((name) => `tree_${i}_${name}`, false, {
      doNotInstantiate: true,
    });
    const root = rootNodes[0] as TransformNode;
    const y = terrainHeight(x, z);
    root.position.set(x, y, z);

    const trunk = CreateCylinder(`tree_${i}_trunk`, { diameter: TRUNK_RADIUS * 2, height: TRUNK_HEIGHT }, scene);
    trunk.position.set(x, y + TRUNK_HEIGHT / 2, z);
    trunk.isVisible = false;
    trunk.isPickable = false;
    new PhysicsAggregate(trunk, PhysicsShapeType.CYLINDER, { mass: 0 }, scene);
    root.rotationQuaternion = Quaternion.FromEulerAngles(0, yaw, 0);
    root.scaling.setAll(BASE_SCALE * scale);
    if (shadowGenerator)
      for (const mesh of root.getChildMeshes(false)) if (mesh.getTotalVertices() > 0) shadowGenerator.addShadowCaster(mesh);
  });

  // NB: do NOT dispose `container` here. `instantiateModelsToScene(doNotInstantiate)` clones share
  // the container's geometry, so `container.dispose()` strips the live trees' vertices (verified: the
  // trees render empty). The template lingers until engine.dispose() — a negligible one-off leak.
}

/**
 * Replaces the container's glTF materials in place, before any tree is instantiated — the clones copy
 * whatever `mesh.material` points at, so doing this per tree would rebuild the same material 12 times.
 */
function retargetMaterials(scene: Scene, container: AssetContainer): void {
  const replacements = new Map<Material, Material>();
  for (const source of container.materials) {
    const replacement = toStandard(scene, source);
    if (replacement !== source) replacements.set(source, replacement);
  }
  if (replacements.size === 0) return;

  // Rebinding the meshes is the part that actually matters: `container.materials` is only a
  // bookkeeping list, and the clones take their material from `mesh.material`. Rebind before
  // disposing, or the meshes are left with a null material and render untextured.
  for (const mesh of container.meshes) {
    const swap = mesh.material && replacements.get(mesh.material);
    if (swap) mesh.material = swap;
  }
  container.materials = container.materials.map((m) => replacements.get(m) ?? m);
  // false, false: keep the textures (the replacements own them now) and leave the meshes alone.
  for (const source of replacements.keys()) source.dispose(false, false);
}

/**
 * Rebuilds one loaded glTF material as a `StandardMaterial` over the same albedo texture, so trees
 * light and fog identically to the rest of the hub — see the block comment on the constants above.
 *
 * `specularColor` is zeroed because StandardMaterial defaults to a white specular that PBR roughness
 * 0.5 never produced — left in, it makes the canopy look wet.
 */
function toStandard(scene: Scene, source: Material): Material {
  const albedo = (source as { albedoTexture?: BaseTexture | null }).albedoTexture;
  if (!albedo) return source; // no texture to carry over — leave whatever the GLB shipped

  const mat = new StandardMaterial(`${source.name}_std`, scene);
  mat.diffuseTexture = albedo;
  albedo.level = TREE_TEXTURE_LEVEL;
  mat.specularColor = new Color3(0, 0, 0);
  mat.backFaceCulling = source.backFaceCulling;
  if (albedo.hasAlpha) {
    mat.useAlphaFromDiffuseTexture = true;
    mat.transparencyMode = source.transparencyMode;
  }
  return mat;
}
