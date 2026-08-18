import type { Scene } from '@babylonjs/core/scene';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import '@babylonjs/core/Materials/standardMaterial'; // side-effect: StandardMaterial shader
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { PhysicsAggregate } from '@babylonjs/core/Physics/v2/physicsAggregate';
import { PhysicsShapeType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin';
import { FIELD, terrainHeight } from './terrainHeight';

const HALF = FIELD / 2;
const SUBDIVISIONS = 120; // enough segments to read the hills smoothly
const GRASS_TILING = 6;

/** Four thin invisible static walls at the field rim (belt-and-suspenders past the edge hills). */
function createBoundaries(scene: Scene): void {
  const t = 1;
  const h = 6;
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

/** A ring of low-poly silhouette mountains beyond the walls — static, no collider — so the world
 *  reads as bigger than the field and gives P2's fog something to fade into. */
function createDistantScenery(scene: Scene): void {
  const mat = new StandardMaterial('mountainMat', scene);
  mat.diffuseColor = new Color3(0.42, 0.5, 0.55); // hazy blue-grey
  mat.specularColor = new Color3(0, 0, 0);
  const RING_RADIUS = 70;
  const COUNT = 28;
  for (let i = 0; i < COUNT; i++) {
    const a = (i / COUNT) * Math.PI * 2;
    const height = 16 + (i % 5) * 4; // deterministic variety
    const m = CreateCylinder(`mtn_${i}`, { diameterTop: 0, diameterBottom: height * 0.9, height, tessellation: 5 }, scene);
    m.position.set(Math.cos(a) * RING_RADIUS, height / 2 - 4, Math.sin(a) * RING_RADIUS);
    m.material = mat;
    m.isPickable = false;
    m.alwaysSelectAsActiveMesh = true;
  }
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

  const mat = new StandardMaterial('groundMat', scene);
  const grass = new Texture('/textures/grass.jpg', scene);
  grass.uScale = GRASS_TILING;
  grass.vScale = GRASS_TILING;
  mat.diffuseTexture = grass;
  mat.specularColor = new Color3(0.05, 0.05, 0.05);
  terrain.material = mat;
  terrain.receiveShadows = true;

  new PhysicsAggregate(terrain, PhysicsShapeType.MESH, { mass: 0 }, scene);
  createBoundaries(scene);
  createDistantScenery(scene);
  return terrain;
}
