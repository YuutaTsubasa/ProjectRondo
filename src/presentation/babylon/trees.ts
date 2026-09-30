import type { Scene } from '@babylonjs/core/scene';
import type { Shadows } from './shadows';
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { createNaturalFoliage, type FoliagePatch } from './naturalFoliage';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import { PhysicsAggregate } from '@babylonjs/core/Physics/v2/physicsAggregate';
import { PhysicsShapeType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin';
import { terrainHeight } from './terrainHeight';
import { applyWind } from './wind';

/** Normalized prototypes keep the existing roughly six-unit tree height. */
const BASE_SCALE = 6;
const TRUNK_RADIUS = 0.5;
const TRUNK_HEIGHT = 4;
/** World-space sway, owned by the shared wind clock; trunks stay rigid. */
const TREE_WIND_AMPLITUDE = 0.2;

/** Fixed scatter: [x, z, yawRadians, scale]. The player spawn stays clear. */
const SPOTS: readonly [number, number, number, number][] = [
  [12, -14, 0.3, 1.0], [-13, -12, 1.9, 1.15], [14, 13, 2.7, 0.9], [-15, 15, 0.8, 1.05],
  [26, 5, 1.2, 1.2], [-25, -7, 2.2, 1.1], [6, -28, 0.5, 1.0], [-8, 27, 3.0, 1.15],
  [30, -22, 1.7, 0.95], [-30, 22, 0.2, 1.0], [34, 12, 2.4, 1.05], [-34, -14, 1.1, 0.95],
  [18, 30, 0.9, 1.1], [-20, -30, 2.6, 1.0], [2, 34, 1.5, 1.05], [-3, -34, 0.4, 0.95],
  [36, -4, 2.0, 1.0], [-36, 6, 0.7, 1.1], [21, -33, 1.3, 0.9], [-24, 33, 2.9, 1.05],
];

/**
 * Irregular sprays of individual leaves expose the forked branch structure. Both prototypes share
 * geometry across their clones, use gamma-space StandardMaterial fog, and belong to this scene.
 * The async entry point remains compatible with the hub's parallel asset loading.
 */
export async function loadTrees(scene: Scene, shadows: Shadows): Promise<void> {
  const canopy = createCanopy(scene);
  const bark = createBark(scene);
  canopy.setEnabled(false);
  bark.setEnabled(false);

  SPOTS.forEach(([x, z, yaw, scale], i) => {
    const root = new TransformNode(`tree_${i}`, scene);
    const y = terrainHeight(x, z);
    root.position.set(x, y, z);
    root.rotationQuaternion = Quaternion.FromEulerAngles(0, yaw, 0);
    root.scaling.setAll(BASE_SCALE * scale);

    const crown = canopy.clone(`tree_${i}_canopy`, root);
    const branches = bark.clone(`tree_${i}_bark`, root);
    crown.setEnabled(true);
    branches.setEnabled(true);
    crown.isPickable = branches.isPickable = false;
    shadows.cast(crown, branches);
    // Small leaves cast a broken ground silhouette; their upward-biased normals keep the
    // interior foliage softly lit without self-shadow striping as the shared wind bends it.
    shadows.receive(branches);

    // Preserve the original collision footprint, independently of visual crown or trunk shape.
    const trunk = CreateCylinder(`tree_${i}_trunk`, { diameter: TRUNK_RADIUS * 2, height: TRUNK_HEIGHT }, scene);
    trunk.position.set(x, y + TRUNK_HEIGHT / 2, z);
    trunk.isVisible = false;
    trunk.isPickable = false;
    new PhysicsAggregate(trunk, PhysicsShapeType.CYLINDER, { mass: 0 }, scene);
  });
}

/** Uneven boughs leave pockets of sky between leaf sprays, including through the crown. */
const FOLIAGE_PATCHES: readonly FoliagePatch[] = [
  { center: [-0.20, 0.65, 0.02], radius: [0.17, 0.105, 0.14], sprays: 34 },
  { center: [0.22, 0.73, -0.075], radius: [0.16, 0.12, 0.14], sprays: 35 },
  { center: [0.065, 0.66, 0.235], radius: [0.155, 0.095, 0.115], sprays: 29 },
  { center: [-0.14, 0.76, -0.19], radius: [0.14, 0.13, 0.13], sprays: 32 },
  { center: [0.035, 0.89, 0.01], radius: [0.155, 0.14, 0.14], sprays: 42 },
  { center: [-0.085, 0.86, 0.14], radius: [0.15, 0.105, 0.13], sprays: 30 },
  { center: [0.15, 0.81, 0.17], radius: [0.13, 0.11, 0.12], sprays: 29 },
  { center: [0.07, 0.78, -0.21], radius: [0.13, 0.12, 0.115], sprays: 31 },
  { center: [-0.24, 0.79, -0.04], radius: [0.115, 0.11, 0.12], sprays: 27 },
  { center: [-0.05, 0.72, 0.015], radius: [0.16, 0.13, 0.16], sprays: 42 },
];

function createCanopy(scene: Scene): Mesh {
  const mesh = createNaturalFoliage(scene, 'tree_canopy_template', FOLIAGE_PATCHES, 2718);
  applyWind(mesh.material!, mesh.getBoundingInfo().boundingBox.maximum.y, TREE_WIND_AMPLITUDE);
  return mesh;
}

/** The tapering limbs remain readable between sprays, with thin forks under each leafy bough. */
function createBark(scene: Scene): Mesh {
  const limbs: [Vector3, Vector3, number, number][] = [
    [new Vector3(0, 0, 0), new Vector3(0.015, 0.38, 0.005), 0.052, 0.034],
    [new Vector3(0.015, 0.37, 0.005), new Vector3(-0.025, 0.75, 0), 0.035, 0.015],
    [new Vector3(-0.025, 0.74, 0), new Vector3(0.035, 0.94, 0.01), 0.015, 0.003],
  ];
  FOLIAGE_PATCHES.forEach((patch, i) => {
    const tip = Vector3.FromArray(patch.center);
    const start = new Vector3(0.012 - i * 0.003, 0.36 + i * 0.035, 0.005);
    const elbow = Vector3.Lerp(start, tip, 0.58);
    elbow.y -= 0.025;
    const radius = 0.019 - i * 0.00065;
    limbs.push([start, elbow, radius, radius * 0.54], [elbow, tip, radius * 0.54, 0.0028]);
    for (let fork = 0; fork < 4; fork++) {
      const angle = i * 2.4 + fork * 1.8;
      const forkStart = Vector3.Lerp(elbow, tip, 0.38 + fork * 0.15);
      const forkTip = tip.add(new Vector3(Math.cos(angle) * patch.radius[0] * 0.8,
        (fork % 2 === 0 ? 0.45 : -0.16) * patch.radius[1], Math.sin(angle) * patch.radius[2] * 0.8));
      limbs.push([forkStart, forkTip, 0.0042, 0.0008]);
    }
  });
  const parts = limbs.map(([from, to, bottomRadius, topRadius], index) => {
    const direction = to.subtract(from);
    const limb = CreateCylinder(`tree_branch_${index}`, {
      height: direction.length(), diameterBottom: bottomRadius * 2,
      diameterTop: topRadius * 2, tessellation: bottomRadius > 0.012 ? 9 : 5,
    }, scene);
    limb.position.copyFrom(from.add(to).scale(0.5));
    const unit = direction.normalize();
    const axis = Vector3.Cross(Vector3.Up(), unit).normalize();
    limb.rotationQuaternion = Quaternion.RotationAxis(axis, Math.acos(Vector3.Dot(Vector3.Up(), unit)));
    return limb;
  });
  const mesh = Mesh.MergeMeshes(parts, true)!;
  mesh.name = 'tree_bark_template';
  const material = new StandardMaterial('tree_bark', scene);
  material.diffuseColor = new Color3(0.55, 0.50, 0.42);
  material.emissiveColor = new Color3(0.025, 0.023, 0.018);
  material.specularColor = Color3.Black();
  // Low-contrast longitudinal grain: detailed close up without black stripes at a distance.
  const width = 64;
  const height = 256;
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const ridge = Math.sin(x * 1.1 + Math.sin(y * 0.058) * 0.45);
      const grain = Math.sin(x * 2.61 + y * 0.72) * Math.cos(y * 1.27 - x * 0.41);
      const tone = 144 + ridge * 12 + grain * 7;
      const index = (y * width + x) * 4;
      pixels[index] = tone;
      pixels[index + 1] = tone * 0.88;
      pixels[index + 2] = tone * 0.74;
      pixels[index + 3] = 255;
    }
  }
  const texture = RawTexture.CreateRGBATexture(pixels, width, height, scene, true, false, Texture.TRILINEAR_SAMPLINGMODE);
  texture.name = 'tree_bark_grain';
  texture.wrapU = texture.wrapV = Texture.WRAP_ADDRESSMODE;
  material.diffuseTexture = texture;
  mesh.material = material;
  return mesh;
}
