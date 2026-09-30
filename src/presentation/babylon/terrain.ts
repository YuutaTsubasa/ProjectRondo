import type { Scene } from '@babylonjs/core/scene';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import '@babylonjs/core/Materials/standardMaterial'; // side-effect: StandardMaterial shader
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { PhysicsAggregate } from '@babylonjs/core/Physics/v2/physicsAggregate';
import { PhysicsShapeType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin';
import { FIELD, terrainHeight } from './terrainHeight';
import { meadowPatch, meadowPathDistance } from './meadowLayout';

const HALF = FIELD / 2;
const SUBDIVISIONS = 200; // ≈0.5 world-units per segment at the 100-unit span (≈80k-tri MESH collider)

/** Four thin invisible static walls at the field rim (belt-and-suspenders past the edge hills). */
function createBoundaries(scene: Scene): void {
  const t = 1;
  const h = 22; // clears the worst-case rim terrain (barrier 12 + hills + roll ≈ 19) as a backup
  const walls: [string, number, number, number, number][] = [
    ['n', FIELD + 2 * t, t, 0, -HALF - t / 2],
    ['s', FIELD + 2 * t, t, 0, HALF + t / 2],
    ['w', t, FIELD, -HALF - t / 2, 0],
    ['e', t, FIELD, HALF + t / 2, 0],
  ];
  for (const [name, w, d, x, z] of walls) {
    const wall = CreateBox(`bound_${name}`, { width: w, height: h, depth: d }, scene);
    wall.position.set(x, h / 2, z);
    wall.isVisible = false;
    wall.isPickable = false;
    new PhysicsAggregate(wall, PhysicsShapeType.BOX, { mass: 0 }, scene);
  }
}

/** Distant ridges have sloping faces and small silhouette variations instead of flat cutout bands. */
function createDistantScenery(scene: Scene): void {
  const segments = 192, rows = 4;
  const ranges = [
    { radius: 82, height: 23, amplitude: 14, phase: 0.4, color: new Color3(0.32, 0.46, 0.42) },
    { radius: 112, height: 37, amplitude: 19, phase: 2.1, color: new Color3(0.40, 0.53, 0.55) },
    { radius: 150, height: 52, amplitude: 24, phase: 3.2, color: new Color3(0.52, 0.62, 0.68) },
  ];
  for (const [layer, range] of ranges.entries()) {
    const positions: number[] = [], indices: number[] = [], colors: number[] = [];
    for (let i = 0; i <= segments; i++) {
      const a = i / segments * Math.PI * 2;
      const wave = 0.48 * Math.sin(a * 3 + range.phase) + 0.36 * Math.cos(a * 5 - range.phase)
        + 0.16 * Math.sin(a * 8 + range.phase * 2) + 0.06 * Math.sin(a * 17 + range.phase);
      const peak = range.height + wave * range.amplitude;
      for (let row = 0; row < rows; row++) {
        const t = row / (rows - 1);
        const radius = range.radius * (0.75 + t * 0.25);
        const fold = Math.sin(a * 11 + range.phase) * Math.sin(t * Math.PI) * 2.2;
        positions.push(Math.cos(a) * radius, -4 + (peak + 4) * t + fold, Math.sin(a) * radius);
        const variation = 0.93 + t * 0.07 + 0.035 * Math.sin(a * 13 + t * 3);
        colors.push(range.color.r * variation, range.color.g * variation, range.color.b * variation, 1);
      }
    }
    for (let i = 0; i < segments; i++) for (let row = 0; row < rows - 1; row++) {
      const a = i * rows + row, b = a + rows;
      indices.push(a, a + 1, b + 1, a, b + 1, b);
    }
    const normals: number[] = [];
    VertexData.ComputeNormals(positions, indices, normals);
    // Seen from the valley, the useful normal points upward and towards the ring centre.
    let up = 0;
    for (let i = 1; i < normals.length; i += 3) up += normals[i];
    if (up < 0) for (let i = 0; i < normals.length; i++) normals[i] = -normals[i];
    const vd = new VertexData();
    vd.positions = positions; vd.indices = indices; vd.normals = normals; vd.colors = colors;
    const mesh = new Mesh(`meadowHills_${layer}`, scene);
    vd.applyToMesh(mesh);
    const mat = new StandardMaterial(`meadowHillsMat_${layer}`, scene);
    mat.diffuseColor = Color3.White();
    mat.emissiveColor = new Color3(0.08, 0.09, 0.10);
    mat.specularColor = Color3.Black();
    mat.backFaceCulling = false;
    mesh.material = mat;
    mesh.isPickable = false;
  }
}

/** Broad colour fields and earth trails; the material adds restrained small-scale detail. */
function meadowColors(positions: ArrayLike<number>): number[] {
  const colors: number[] = [];
  const sage = new Color3(0.32, 0.46, 0.29);
  const lime = new Color3(0.47, 0.55, 0.34);
  const path = new Color3(0.58, 0.52, 0.40);
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i], z = positions[i + 2];
    const patch = meadowPatch(x, z);
    const grass = Color3.Lerp(sage, lime, patch);
    // A narrow tan centre with a 0.7m feather joins naturally with the open planting corridor.
    const edge = Math.max(0, Math.min(1, (meadowPathDistance(x, z) + 0.1 * Math.sin(x * 1.4 + z * 1.2) - 0.75) / 0.7));
    const blend = 1 - edge * edge * (3 - 2 * edge);
    const color = Color3.Lerp(grass, path, blend);
    const variation = 0.965 + 0.02 * Math.sin(x * 0.11 + z * 0.08)
      + 0.015 * Math.sin(x * 1.3 + Math.sin(z * 0.7)) * Math.cos(z * 1.1);
    colors.push(color.r * variation, color.g * variation, color.b * variation, 1);
  }
  return colors;
}

/** Builds the rolling grass terrain: a subdivided ground displaced by terrainHeight with a static
 *  MESH collider (so the player rides it), the rim walls, and distant scenery. Returns the mesh. */
export function createTerrain(scene: Scene): AbstractMesh {
  const terrain = CreateGround('terrain', { width: FIELD, height: FIELD, subdivisions: SUBDIVISIONS }, scene);

  // Displace the ground into rolling terrain. CreateGround makes NON-updatable vertex buffers, and
  // `updateVerticesData` on those updates the CPU-side copy (so the MESH collider and getVerticesData
  // see the relief) but NEVER reaches the GPU — the mesh then *renders as a flat plane* while the
  // player still rides the (displaced) collider. `setVerticesData` replaces the GPU buffer, so use it
  // for both positions and normals.
  const pos = terrain.getVerticesData(VertexBuffer.PositionKind)!;
  for (let i = 0; i < pos.length; i += 3) pos[i + 1] = terrainHeight(pos[i], pos[i + 2]);
  terrain.setVerticesData(VertexBuffer.PositionKind, pos, false);
  // Recompute lighting normals for the new relief. ComputeNormals orients this ground's winding
  // *downward* (surface faces away from the sun → renders black), so flip them skyward.
  const indices = terrain.getIndices()!;
  const normals: number[] = [];
  VertexData.ComputeNormals(pos, indices, normals);
  let sumY = 0;
  for (let i = 1; i < normals.length; i += 3) sumY += normals[i];
  if (sumY < 0) for (let i = 0; i < normals.length; i++) normals[i] = -normals[i];
  terrain.setVerticesData(VertexBuffer.NormalKind, normals, false);
  terrain.refreshBoundingInfo(); // bounds were built for the flat plane; refresh for cull/pick

  terrain.setVerticesData(VertexBuffer.ColorKind, meadowColors(pos), false);
  terrain.useVertexColors = true;
  const mat = new StandardMaterial('groundMat', scene);
  // Detail-map red modulates luminance only, retaining the shared earth/grass trail colours.
  const detail = new Texture('/textures/meadow-detail.png', scene);
  detail.uScale = detail.vScale = 12;
  detail.gammaSpace = false; // packed scalar channels, not an sRGB colour image
  detail.anisotropicFilteringLevel = 8;
  mat.detailMap.texture = detail;
  mat.detailMap.diffuseBlendLevel = 1.15;
  mat.detailMap.bumpLevel = 0;
  mat.detailMap.isEnabled = true;
  mat.diffuseColor = Color3.White();
  mat.specularColor = Color3.Black();
  terrain.material = mat;

  new PhysicsAggregate(terrain, PhysicsShapeType.MESH, { mass: 0 }, scene);
  createBoundaries(scene);
  createDistantScenery(scene);
  return terrain;
}
