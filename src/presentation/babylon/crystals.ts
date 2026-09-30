import type { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { type Vec3, vec3 } from '../../domain/math/vec3';
import { HOMING_RED_RGB } from './homingColors';
import { crystalGeometry, crystalHitGeometry } from './crystalGeometry';

/** Retains the original target envelope: the pointed cut reaches this full height, with bevels inset. */
export const CRYSTAL_EXTENT = 0.45 * 2 * Math.SQRT2;
const REST_EMISSIVE = new Color3(0.04, 0.10, 0.155);
const FLASH_EMISSIVE = new Color3(...HOMING_RED_RGB);
const FLASH_SECONDS = 0.4;
const HIT_SECONDS = 0.32;
const HIT_START_SCALE = 0.66;

export interface Crystals {
  /** Static world positions in selection order. */
  readonly positions: readonly Vec3[];
  /** Restarts a brief isolated hit flash. Invalid indices and calls after scene teardown are ignored. */
  flash(index: number): void;
}

/** Scene-owned cut jewels: static targets, no colliders, animation or postprocessing dependency. */
export function createCrystals(scene: Scene, spots: readonly Vec3[]): Crystals {
  const positions = spots.map((spot) => vec3(spot.x, spot.y, spot.z));
  if (spots.length === 0) return { positions, flash() {} };
  const coreMaterial = new StandardMaterial('crystalCoreMat', scene);
  coreMaterial.disableLighting = true;
  coreMaterial.emissiveColor = new Color3(0.46, 0.86, 1);
  coreMaterial.specularColor = Color3.Black();
  const hitMaterial = new StandardMaterial('crystalHitMat', scene);
  hitMaterial.disableLighting = true;
  hitMaterial.emissiveColor = FLASH_EMISSIVE.clone();
  hitMaterial.specularColor = Color3.Black();
  hitMaterial.backFaceCulling = false;
  hitMaterial.disableDepthWrite = true;
  // Alpha blending still depth-tests against scenery. It cannot shine through a wall.
  hitMaterial.alpha = 0.85;

  let shellTemplate: Mesh | undefined, coreTemplate: Mesh | undefined, hitTemplate: Mesh | undefined;
  const hits: Mesh[] = [], materials: StandardMaterial[] = [];
  spots.forEach((spot, i) => {
    const shell = shellTemplate?.clone(`crystal_${i}`, null, true) ?? new Mesh(`crystal_${i}`, scene);
    if (!shellTemplate) { crystalGeometry(CRYSTAL_EXTENT).applyToMesh(shell); shellTemplate = shell; }
    const material = new StandardMaterial(`crystalMat_${i}`, scene);
    material.diffuseColor = new Color3(0.20, 0.53, 0.72);
    material.emissiveColor = REST_EMISSIVE.clone();
    material.specularColor = new Color3(0.52, 0.75, 0.95);
    material.specularPower = 128;
    // A small amount of transmitted light reveals the inner seed; no refraction texture or extra pass.
    material.alpha = 0.94;
    shell.material = material;
    shell.position.set(spot.x, spot.y, spot.z);
    shell.isPickable = false;
    materials.push(material);

    const core = coreTemplate?.clone(`crystalCore_${i}`, null, true) ?? new Mesh(`crystalCore_${i}`, scene);
    if (!coreTemplate) {
      const data = crystalGeometry(CRYSTAL_EXTENT);
      data.colors = null;
      data.applyToMesh(core);
      coreTemplate = core;
    }
    core.material = coreMaterial;
    core.position.copyFrom(shell.position);
    core.scaling.set(0.13, 0.4, 0.13);
    core.isPickable = false;

    const hit = hitTemplate?.clone(`crystalHit_${i}`, null, true) ?? new Mesh(`crystalHit_${i}`, scene);
    if (!hitTemplate) { crystalHitGeometry(CRYSTAL_EXTENT).applyToMesh(hit); hitTemplate = hit; }
    hit.material = hitMaterial;
    hit.position.copyFrom(shell.position);
    hit.billboardMode = Mesh.BILLBOARDMODE_ALL;
    hit.isPickable = false;
    hit.setEnabled(false);
    hits.push(hit);
  });

  const elapsed: (number | null)[] = spots.map(() => null);
  let disposed = false;
  const observer = scene.onBeforeRenderObservable.add(() => {
    const dt = Math.max(0, scene.getEngine().getDeltaTime() / 1000);
    elapsed.forEach((age, i) => {
      if (age === null) return;
      const next = age + dt;
      const flash = Math.min(1, next / FLASH_SECONDS);
      if (flash === 1) materials[i].emissiveColor.copyFrom(REST_EMISSIVE);
      else Color3.LerpToRef(FLASH_EMISSIVE, REST_EMISSIVE, flash, materials[i].emissiveColor);
      const t = Math.min(1, next / HIT_SECONDS);
      hits[i].scaling.setAll(HIT_START_SCALE + 0.64 * (1 - (1 - t) ** 2));
      hits[i].visibility = (1 - t) ** 2;
      if (t === 1) hits[i].setEnabled(false);
      elapsed[i] = flash === 1 ? null : next;
    });
  });
  // Babylon owns the mesh/material/geometry disposal; explicitly stop this closure and stale handles.
  scene.onDisposeObservable.addOnce(() => {
    disposed = true;
    scene.onBeforeRenderObservable.remove(observer);
    elapsed.length = 0;
    hits.length = materials.length = 0;
  });

  return {
    positions,
    flash(index: number) {
      if (disposed || !Number.isInteger(index) || index < 0 || index >= materials.length) return;
      materials[index].emissiveColor.copyFrom(FLASH_EMISSIVE);
      elapsed[index] = 0;
      hits[index].scaling.setAll(HIT_START_SCALE);
      hits[index].visibility = 1;
      hits[index].setEnabled(true);
    },
  };
}
