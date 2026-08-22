import type { Scene } from '@babylonjs/core/scene';
import type { AssetContainer } from '@babylonjs/core/assetContainer';
import type { Material } from '@babylonjs/core/Materials/material';
import type { BaseTexture } from '@babylonjs/core/Materials/Textures/baseTexture';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import { Quaternion } from '@babylonjs/core/Maths/math.vector';
import { Color3 } from '@babylonjs/core/Maths/math.color';
// Importing the binding also runs the module, so this doubles as the shader's side-effect import.
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import { PhysicsAggregate } from '@babylonjs/core/Physics/v2/physicsAggregate';
import { PhysicsShapeType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin';
import { terrainHeight } from './terrainHeight';
import '@babylonjs/loaders/glTF'; // side-effect: registers the glTF loader

/** The tree GLB is normalized to ~1 unit tall (Tripo output); scale it up to a real tree height.
 *  The per-spot scale below multiplies this, so trees land around 6 units (taller than the ~1.9 knight). */
const BASE_SCALE = 6;

/**
 * Multiplier on the albedo texture's contribution, and — with {@link TREE_EMISSIVE} — half of what
 * puts the trees back where they were before they stopped being PBR.
 *
 * **Why the trees are not PBR.** The GLB ships a `PBRMaterial`, and every other surface fog actually
 * reaches is a `StandardMaterial`. The trees-vs-hub mismatch that creates only becomes visible once
 * fog is on. PBR shades and mixes fog in linear space, where a small blend toward a near-white fog colour multiplies a dark pixel
 * several-fold; StandardMaterial mixes in gamma space, where the same blend barely moves it. Measured
 * at the spawn viewpoint, a tree ~27 units out took a 0.32 fog blend where EXP2 asks for 0.04 and the
 * grass beside it took 0.07 — so the trees bleached to grey while the terrain behind them looked
 * untouched. That reads as "the fog is only on the trees", but the fog is uniform; the trees were the
 * only surface reacting in linear space, and the only one dark enough for it to show.
 *
 * (The knight is glTF and therefore PBR too, but it sits about 5 units from the camera —
 * `followCamera.ts`'s `distance` — where EXP2 puts fog at 0.14 %, so the mismatch never shows on it.
 * See HANDOFF §7.)
 *
 * Rebuilding over the same albedo texture as a StandardMaterial puts them back in line. Measured on
 * the final shipped material, with the grass beside them held as an untouched control at 0.069: near
 * trunk 0.32 -> 0.05, near canopy 0.19 -> 0.09, mid canopy 0.47 -> 0.13. Inverting EXP2 on the near
 * trunk's 0.05 implies 30 units against the ~27 measured geometrically; its PBR blend of 0.32 implied
 * 82. Nothing is lost — the source is metallic 0 with no metallic-roughness map, i.e. diffuse-only.
 *
 * Gamma-space shading then lands the canopy far darker than PBR did, which is what this constant is
 * for. 2.5 was picked against the pre-conversion render at the spawn viewpoint.
 */
const TREE_TEXTURE_LEVEL = 2.5;

/** Emissive floor, the same trick `scatter.ts` uses on grass and bushes: without one the canopy's
 *  shaded undersides go pure black under ACES.
 *
 *  "Floor" is loose wording. StandardMaterial computes
 *  `clamp(diffuseBase * diffuseColor + emissiveColor + ambient) * baseColor`, and `baseColor` has
 *  already been scaled by `texture.level` — so this is multiplied by TREE_TEXTURE_LEVEL and by the
 *  texel, and changing the level rescales this too. The switch that would make it genuinely
 *  texture-independent is `useEmissiveAsIllumination`, which moves emissive outside that multiply.
 *
 *  Measured from under a tree as the fraction of the frame at pure black. What was swept is a single
 *  scalar on the hue vector below, normalised so green = 1 — so each sweep value IS the resulting
 *  green channel: 0 -> 10.5 %, 0.16 -> 1.4 %, 0.24 -> 0.20 %, for +5 % mean luma. 0.24 green shipped,
 *  which is the same colour as the grass floor x 1.41 described below; re-measure by sweeping that
 *  scalar, not by scaling the triple channel-wise.
 *
 *  Measure this against a whole frame, never against sampled points: on lit canopy the floor looks
 *  like it does nothing (a 4x sweep moved a lit sample by 3/255), because the shaded side is the
 *  entire point — that mistake shipped once already. The tint is `scatter.ts`'s grass floor
 *  (0.10, 0.17, 0.06) scaled by 1.41: the same hue, not one measured off the canopy. */
const TREE_EMISSIVE = new Color3(0.141, 0.24, 0.085);

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

/** Replaces the container's glTF materials in place, before any tree is instantiated. */
function retargetMaterials(scene: Scene, container: AssetContainer): void {
  const replacements = new Map<Material, StandardMaterial>();
  for (const source of container.materials) {
    const replacement = toStandard(scene, source);
    if (replacement) replacements.set(source, replacement);
  }
  // Rebinding the meshes is the part that actually matters: `container.materials` is only a
  // bookkeeping list, and the clones take their material from `mesh.material`. Rebind before
  // disposing, or the meshes are left with a null material and render untextured.
  for (const mesh of container.meshes) {
    const swap = mesh.material && replacements.get(mesh.material);
    if (swap) mesh.material = swap;
  }
  container.materials = container.materials.map((m) => replacements.get(m) ?? m);

  // Warn BEFORE the empty-map guard would have returned: the case where *nothing* converted is the
  // worst one, not a benign no-op. It means every tree ships as PBR — the bleaching bug at full
  // strength — and it is reachable, because the GLB is versioned (`tree.glb?v=4`) and an asset swap
  // can drop the albedo texture this conversion keys off.
  for (const m of container.materials) {
    if (!(m instanceof StandardMaterial)) {
      console.warn(
        `[trees] '${m.name}' (${m.getClassName()}) left unconverted — it will fog differently from the rest of the hub.`,
      );
    }
  }

  // Scale only the textures the new materials actually sample. Applying this to every texture the
  // container holds would also hit any normal/emissive/occlusion map the GLB ships — channels
  // TREE_TEXTURE_LEVEL's rationale says nothing about, and where 2.5x would blow out. Today's asset
  // is diffuse-only, but that is the assumption the rest of this function exists to stop relying on.
  // Note this rescales TREE_EMISSIVE too — see there.
  for (const mat of replacements.values()) {
    if (mat.diffuseTexture) mat.diffuseTexture.level = TREE_TEXTURE_LEVEL;
  }

  // dispose(forceDisposeEffect, forceDisposeTextures): the second `false` is what keeps the textures,
  // which the replacements now sample. The meshes are already safe — rebinding above cleared each old
  // material's `meshMap`.
  for (const source of replacements.keys()) source.dispose(false, false);
}

/**
 * Rebuilds one loaded glTF material as a `StandardMaterial` over the same albedo texture, so trees
 * light and fog identically to the rest of the hub — see the block comment on the constants above.
 *
 * `specularColor` is zeroed because StandardMaterial defaults to a white specular that PBR roughness
 * 0.5 never produced — left in, it makes the canopy look wet. Brightness is then restored with
 * `TREE_TEXTURE_LEVEL` and `TREE_EMISSIVE`; see those for why both are needed.
 */
function toStandard(scene: Scene, source: Material): StandardMaterial | null {
  const albedo = (source as { albedoTexture?: BaseTexture | null }).albedoTexture;
  if (!albedo) return null; // no texture to carry over — leave whatever the GLB shipped

  const mat = new StandardMaterial(`${source.name}_std`, scene);
  mat.diffuseTexture = albedo;
  mat.specularColor = new Color3(0, 0, 0);
  // TREE_EMISSIVE takes the emissive channel over, so glTF's emissiveFactor — which the loader puts
  // straight into emissiveColor — is discarded. Today's asset ships none; warn if one ever appears,
  // at parity with the emissiveTexture and occlusionTexture drops below.
  const sourceEmissive = (source as { emissiveColor?: Color3 }).emissiveColor;
  if (sourceEmissive && (sourceEmissive.r > 0 || sourceEmissive.g > 0 || sourceEmissive.b > 0)) {
    console.warn(
      `[trees] '${source.name}' has a non-zero emissiveFactor (${sourceEmissive.toHexString()}). It is discarded: TREE_EMISSIVE owns emissiveColor.`,
    );
  }
  // clone: handing out the module constant by reference lets a later mutation travel back into it
  mat.emissiveColor = TREE_EMISSIVE.clone();

  // Everything below carries a property that changes how the material renders. Copying only some of
  // them is worse than copying none, because the result looks plausible: `tree.glb` is
  // `"doubleSided": true`, which makes the loader set `backFaceCulling = false` *and*
  // `twoSidedLighting = true`, and StandardMaterial gates the shader on
  // `!backFaceCulling && twoSidedLighting`. Carrying only the first flipped every back-facing canopy
  // polygon to its front-facing normal, so leaves seen from behind were lit as though they faced away
  // from the sun. That shipped, and TREE_TEXTURE_LEVEL was fitted against the darkening it caused.
  const pbr = source as Partial<{
    twoSidedLighting: boolean;
    albedoColor: Color3;
    alphaCutOff: number;
    bumpTexture: BaseTexture;
    invertNormalMapX: boolean;
    invertNormalMapY: boolean;
    ambientTexture: BaseTexture;
    emissiveTexture: BaseTexture;
  }>;
  mat.backFaceCulling = source.backFaceCulling;
  if (pbr.twoSidedLighting !== undefined) mat.twoSidedLighting = pbr.twoSidedLighting;
  // glTF's baseColorFactor: RGB lands on albedoColor, A on the material's alpha. Both default to
  // "no tint" and today's asset omits the factor entirely — but a swapped GLB that carries one would
  // otherwise convert cleanly, warn about nothing, and render the wrong colour.
  if (pbr.albedoColor) mat.diffuseColor = pbr.albedoColor.clone();
  mat.alpha = source.alpha;
  if (pbr.alphaCutOff !== undefined) mat.alphaCutOff = pbr.alphaCutOff;
  // glTF normalTexture, with the inversion flags that decide what its green channel means. The scene
  // is right-handed, so the loader hands us `invertNormalMapY = true`; StandardMaterial defaults both
  // to false and feeds them into `vTangentSpaceParams` exactly as PBR does, so carrying the texture
  // without the flags would light the surface from the wrong side.
  if (pbr.bumpTexture) {
    mat.bumpTexture = pbr.bumpTexture;
    if (pbr.invertNormalMapX !== undefined) mat.invertNormalMapX = pbr.invertNormalMapX;
    if (pbr.invertNormalMapY !== undefined) mat.invertNormalMapY = pbr.invertNormalMapY;
  }
  // glTF occlusionTexture is deliberately NOT carried, and strength is not the reason. In *this*
  // scene PBR's occlusion map is a no-op: it only reaches direct light through
  // `ambientTextureImpactOnAnalyticalLights`, which defaults to 0 and the glTF loader never sets, and
  // its only other use multiplies irradiance behind `#ifdef REFLECTION`, which never compiles because
  // nothing here sets an environment texture. StandardMaterial has no such gate: `baseAmbientColor`
  // multiplies the whole `finalDiffuse` term, and `emissiveColor` sits *inside* that term — so
  // copying the map would convert a no-op into a real darkening and dim TREE_EMISSIVE, the one thing
  // holding the shaded canopy off pure black. Losing AO is the smaller lie, and it is not a silent one.
  if (pbr.ambientTexture) {
    console.warn(
      `[trees] '${source.name}' ships an occlusionTexture. It is not carried: StandardMaterial would apply it to the whole diffuse term including the emissive floor, where PBR applies it to nothing in this scene.`,
    );
  }
  // glTF emissiveTexture is deliberately not carried either: `emissiveColor` above is this scene's
  // shading fix rather than the asset's intent, and StandardMaterial multiplies the two. A GLB that
  // ships a real emissive map needs that conflict resolved on purpose, not silently compounded — so
  // this warns for the same reason the occlusion drop does.
  if (pbr.emissiveTexture) {
    console.warn(
      `[trees] '${source.name}' ships an emissiveTexture. It is not carried: TREE_EMISSIVE occupies emissiveColor, and StandardMaterial would multiply the two.`,
    );
  }

  if (albedo.hasAlpha) {
    mat.useAlphaFromDiffuseTexture = true;
    mat.transparencyMode = source.transparencyMode;
  }
  return mat;
}
