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

/** A continuous low-poly mountain ridge encircling the field — one static mesh, no collider — so the
 *  world reads as bigger than the walls and P2's fog has something to fade into. The silhouette is a
 *  ring of connected peaks (broad ranges + jagged sub-peaks) rather than separate cones. */
function createDistantScenery(scene: Scene): void {
  const RING_RADIUS = 60; // far enough to read as a distant range, close enough not to float off
  const SEGMENTS = 64; // silhouette resolution
  const BASE_Y = -3; // bottom skirt sits just below the horizon
  const MIN_H = 10;
  const MAX_H = 24;

  // Deterministic per-segment jaggedness (wraps seamlessly via i % SEGMENTS).
  const jag = (i: number): number => {
    let h = Math.imul((i % SEGMENTS) ^ 0x9e3779b9, 2654435761);
    h ^= h >>> 15;
    return ((h >>> 0) % 10000) / 10000;
  };
  const heightAt = (i: number, a: number): number => {
    const broad = 0.5 + 0.5 * Math.sin(a * 3 + 1.3) * Math.sin(a * 1.7); // low-freq ranges
    return MIN_H + (MAX_H - MIN_H) * (0.55 * broad + 0.45 * jag(i));
  };

  const positions: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= SEGMENTS; i++) {
    const a = (i / SEGMENTS) * Math.PI * 2;
    const x = Math.cos(a) * RING_RADIUS;
    const z = Math.sin(a) * RING_RADIUS;
    positions.push(x, BASE_Y, z); // bottom vertex (index 2i)
    positions.push(x, BASE_Y + heightAt(i, a), z); // top vertex (index 2i+1)
  }
  for (let i = 0; i < SEGMENTS; i++) {
    const b0 = 2 * i, t0 = 2 * i + 1, b1 = 2 * i + 2, t1 = 2 * i + 3;
    indices.push(b0, t0, t1, b0, t1, b1);
  }
  const vd = new VertexData();
  vd.positions = positions;
  vd.indices = indices;
  const mesh = new Mesh('mountains', scene);
  vd.applyToMesh(mesh);

  const mat = new StandardMaterial('mountainMat', scene);
  // Distant mountains read as flat hazy silhouettes (atmospheric perspective), NOT sun-shaded solids —
  // so disable lighting and use a desaturated blue-grey that sits between the green land and the sky.
  // P2's fog will blend the base into the horizon.
  const haze = new Color3(0.48, 0.55, 0.58);
  mat.disableLighting = true;
  mat.diffuseColor = haze;
  mat.emissiveColor = haze;
  mat.specularColor = new Color3(0, 0, 0);
  mat.backFaceCulling = false; // the player views the ring from inside
  mesh.material = mat;
  mesh.isPickable = false;
  mesh.alwaysSelectAsActiveMesh = true;
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
