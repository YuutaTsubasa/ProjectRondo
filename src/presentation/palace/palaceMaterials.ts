import type { Scene } from '@babylonjs/core/scene';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { createStoneTextures, applyStoneUV } from './palaceStoneSurface';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import type { Shadows } from '../babylon/shadows';

export function createPalaceMaterials(scene: Scene) {
  const stoneTextures = createStoneTextures(scene);
  const make = (name: string, color: string, roughness: number, metallic = 0) => {
    const material = new PBRMaterial(name, scene);
    material.albedoColor = Color3.FromHexString(color).toLinearSpace();
    material.roughness = roughness; material.metallic = metallic;
    // Broad studio IBL suits steel, but chalky stone needs stronger sun/shade separation.
    material.environmentIntensity = metallic > .5 ? 1 : .28;
    if (name.includes('Stone') || name === 'palaceLimestone') {
      material.albedoTexture = stoneTextures.albedo;
      material.bumpTexture = stoneTextures.normal;
      material.environmentIntensity = .025;
      material.metallicTexture = stoneTextures.roughness;
      material.useRoughnessFromMetallicTextureAlpha = false;
      material.useRoughnessFromMetallicTextureGreen = true;
      material.useMetallnessFromMetallicTextureBlue = true;
    }
    return material;
  };
  return {
    stone: make('palaceLimestone', '#d9d2c2', .83),
    light: make('palaceCutStone', '#ebe5d7', .72),
    aged: make('palaceWeatheredStone', '#b5ad99', .91),
    roof: make('palaceSlate', '#526879', .66, .08),
    gold: make('palaceAntiqueBrass', '#ad9560', .43, .65),
    recess: make('palaceWindowRecess', '#273c4b', .88),
    banner: make('palaceBanner', '#345778', .94),
    foliage: make('palaceGarden', '#425c48', .92),
  };
}
export type PalaceMaterials = ReturnType<typeof createPalaceMaterials>;

/** Keep spatial batches small enough to cull whole buildings and reuse one draw per material. */
export function mergePalaceParts(name: string, parts: Mesh[], shadows: Shadows, cast: boolean, building = false) {
  const groups = new Map(parts.map(mesh => [mesh.material!, [] as Mesh[]]));
  for (const mesh of parts) {
    // Normalize vertex attributes before merging; world UVs are rebuilt on each finished batch.
    mesh.removeVerticesData(VertexBuffer.UVKind);
    groups.get(mesh.material!)!.push(mesh);
  }
  const merged: Mesh[] = [];
  for (const [material, meshes] of groups) {
    const mesh = Mesh.MergeMeshes(meshes, true, true, undefined, false, false)!;
    mesh.name = `${name}:${material.name}`;
    mesh.material = material; mesh.isPickable = false;
    if (material instanceof PBRMaterial && material.bumpTexture) applyStoneUV(mesh);
    mesh.metadata = { palaceBuilding: building };
    mesh.freezeWorldMatrix();
    if (cast) shadows.cast(mesh);
    shadows.receive(mesh); merged.push(mesh);
  }
  return merged;
}
