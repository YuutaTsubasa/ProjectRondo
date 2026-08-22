import type { BaseTexture } from '@babylonjs/core/Materials/Textures/baseTexture';
import type { Color3 } from '@babylonjs/core/Maths/math.color';

/**
 * The PBR-only properties this codebase reads off a glTF-loaded `Material`.
 *
 * `LoadAssetContainerAsync` and `ImportMeshAsync` are typed as returning plain `Material`, so every
 * one of these needs a cast to reach. Declaring the shape once means a Babylon rename, or a fourth
 * channel worth handling, is one edit rather than a hunt across `trees.ts` and `knight.ts` — both of
 * which convert or clone glTF materials and both of which have to know exactly this set.
 *
 * `Partial` on purpose: the cast is structural, so nothing guarantees the object really is a
 * `PBRMaterial`. Every read must handle the property being absent.
 */
export type GltfPbrMaterial = Partial<{
  albedoTexture: BaseTexture | null;
  albedoColor: Color3;
  alphaCutOff: number;
  ambientTexture: BaseTexture | null;
  bumpTexture: BaseTexture | null;
  emissiveColor: Color3;
  emissiveTexture: BaseTexture | null;
  invertNormalMapX: boolean;
  invertNormalMapY: boolean;
  twoSidedLighting: boolean;
}>;
