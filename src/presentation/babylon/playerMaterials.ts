import type { Scene } from '@babylonjs/core/scene';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Material } from '@babylonjs/core/Materials/material';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import '@babylonjs/core/Materials/standardMaterial';
import '@babylonjs/core/Rendering/outlineRenderer';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { readPlayerMaterial } from './playerModel';
import { PlayerToon } from './playerToon';

/**
 * Adapt each imported material once; role metadata controls shadows even when exporters rename
 * meshes or split primitives. Textures remain scene-owned and shared; disposing an old material
 * must never dispose a texture used by its replacement or another material.
 */
export function applyPlayerMaterials(meshes: readonly AbstractMesh[], scene: Scene): AbstractMesh[] {
  const sources = [...new Set(meshes.flatMap((mesh) => mesh.material ? [mesh.material] : []))];
  const settings = new Map(sources.map((source) => {
    if (!(source instanceof PBRMaterial)) throw new Error(`Expected glTF PBR material: ${source.name}`);
    return [source, readPlayerMaterial(source.metadata)] as const;
  }));
  const replacements = new Map<Material, StandardMaterial>();
  for (const source of sources) {
    const pbr = source as PBRMaterial;
    const material = new StandardMaterial(`player:${source.name}`, scene);
    material.diffuseTexture = pbr.albedoTexture;
    /** glTF factors are linear; StandardMaterial multiplies them into the gamma-space color map. */
    material.diffuseColor = pbr.albedoColor.toGammaSpace();
    material.specularColor = Color3.Black();
    material.backFaceCulling = pbr.backFaceCulling;
    material.twoSidedLighting = !pbr.backFaceCulling;
    material.alpha = pbr.alpha;
    material.metadata = pbr.metadata;
    new PlayerToon(material, settings.get(source as PBRMaterial)!);
    replacements.set(source, material);
  }
  const receivers: AbstractMesh[] = [];
  for (const mesh of meshes) {
    const source = mesh.material;
    if (!source) continue;
    const info = settings.get(source as PBRMaterial)!;
    mesh.material = replacements.get(source)!;
    if (info.role === 'body') receivers.push(mesh);
    if (mesh instanceof Mesh) {
      if (info.surfaceColorBlend) mesh.hasVertexAlpha = false;
      // An inverted hull would redraw the internal boundary we just blended.
      mesh.renderOutline = info.outlineWidthFactor > 0 && !info.surfaceColorBlend;
      mesh.outlineWidth = info.outlineWidthFactor;
      mesh.outlineColor = Color3.FromArray([...info.outlineColorFactor]).toGammaSpace();
    }
  }
  for (const source of sources) source.dispose(false, false);
  return receivers;
}
