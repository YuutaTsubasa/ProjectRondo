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

/**
 * The material's glTF `emissiveFactor` when it is not black, otherwise `null`.
 *
 * Both `trees.ts` and `knight.ts` take the emissive channel over for their own purposes and so have
 * to warn that the asset's own value is being discarded. The *messages* differ — each names the
 * constant that claimed the channel — but the test does not, and it is the kind of thing that grows an
 * epsilon or a fourth channel later.
 *
 * Returns the colour rather than a boolean so the caller can report it without a second, unchecked
 * read: a `boolean` would leave both call sites writing `emissiveColor?.toHexString()`, which the type
 * allows to be `undefined` and would interpolate the literal "undefined" into a warning whose entire
 * job is to name the discarded value.
 */
export function emissiveFactorOf(material: GltfPbrMaterial): Color3 | null {
  const emissive = material.emissiveColor;
  return emissive && (emissive.r > 0 || emissive.g > 0 || emissive.b > 0) ? emissive : null;
}
