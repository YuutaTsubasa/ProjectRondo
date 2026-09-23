import type { Scene } from '@babylonjs/core/scene';
import type { Shadows } from './shadows';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder';
import { CreateIcoSphere } from '@babylonjs/core/Meshes/Builders/icoSphereBuilder';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import '@babylonjs/core/Materials/standardMaterial'; // side-effect: StandardMaterial shader
import { Material } from '@babylonjs/core/Materials/material';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import { PhysicsAggregate } from '@babylonjs/core/Physics/v2/physicsAggregate';
import { PhysicsShapeType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin';
import { terrainHeight, EDGE_RADIUS, BARRIER_TOP } from './terrainHeight';
import { ROCK_DIFFUSE_RGB } from './rockColors';
import { applyWind } from './wind';
import { rng } from '../../domain/math/rng';
import { POND } from '../../domain/hub/waterBody';
import { createNaturalFoliage } from './naturalFoliage';
import { meadowPathDistance, meadowClearing, meadowPatch } from './meadowLayout';

// Cosmetic scatter covers the walkable interior AND the grassy barrier slope, up to the barrier top
// (a bare barrier looks wrong); colliders, though, only go where the player can reach — see below.
const EXTENT = BARRIER_TOP;
const ROCK_BASE_RADIUS = 0.4; // rock icosphere radius — shared by the mesh and its collider

interface ScatterOpts {
  count: number; seed: number; y: number; minScale: number; maxScale: number;
  extent?: number; pathClearance?: number; flowerPatches?: boolean;
}
interface Placement { x: number; y: number; z: number; s: number; }
interface ScatterResult { buffer: Float32Array; placements: Placement[]; }

/** Exclude the actual flooded contour, rather than the oversized water disc. */
function canPlant(x: number, z: number, clearance: number): boolean {
  return !meadowClearing(x, z) && meadowPathDistance(x, z) >= clearance &&
    !(Math.hypot(x - POND.centreX, z - POND.centreZ) < POND.radius && terrainHeight(x, z) < POND.surfaceY);
}

/** Seeded planting follows broad meadow patches. Fixed attempt budgets keep creation bounded;
 *  if a layout cannot fit the requested count, the buffer contains only accepted placements. */
function scatterMatrices(o: ScatterOpts): ScatterResult {
  const rand = rng(o.seed);
  const ext = o.extent ?? EXTENT;
  const clearance = o.pathClearance ?? 1.45;
  const buffer = new Float32Array(o.count * 16);
  const placements: Placement[] = [];
  const m = Matrix.Identity();
  const scale = new Vector3();
  const pos = new Vector3();
  // A small number of seed-grown flower beds, each about three metres across.
  const beds: { x: number; z: number }[] = [];
  if (o.flowerPatches) {
    for (let attempt = 0; attempt < 256 && beds.length < 32; attempt++) {
      const angle = rand() * Math.PI * 2;
      const radius = Math.sqrt(rand()) * (ext - 2);
      const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
      if (canPlant(x, z, clearance + 1) && meadowPatch(x, z) > 0.55) beds.push({ x, z });
    }
  }
  for (let attempt = 0; attempt < o.count * 24 && placements.length < o.count; attempt++) {
    const angle = rand() * Math.PI * 2;
    const bed = beds.length ? beds[Math.floor(rand() * beds.length)] : undefined;
    const radius = Math.sqrt(rand()) * (bed ? 1.65 : ext);
    const px = (bed?.x ?? 0) + Math.cos(angle) * radius;
    const pz = (bed?.z ?? 0) + Math.sin(angle) * radius;
    if (px * px + pz * pz > ext * ext || !canPlant(px, pz, clearance)) continue;
    // Sparse gaps between broad drifts; density feathers towards the paths.
    const patch = meadowPatch(px, pz);
    const edge = Math.min(1, (meadowPathDistance(px, pz) - clearance) / 1.3);
    if (rand() > (0.06 + 0.94 * patch * patch) * edge) continue;
    const s = o.minScale + rand() * (o.maxScale - o.minScale);
    scale.set(s, s, s);
    const py = terrainHeight(px, pz) + o.y;
    pos.set(px, py, pz);
    Matrix.ComposeToRef(scale, Quaternion.RotationAxis(Vector3.UpReadOnly, rand() * Math.PI * 2), pos, m);
    m.copyToArray(buffer, placements.length * 16);
    placements.push({ x: px, y: py, z: pz, s });
  }
  return { buffer: buffer.slice(0, placements.length * 16), placements };
}

/** Five broad, curved ribbons avoid dark alpha fringes and noisy cross-card silhouettes.
 *  Each blade has a base pair, a bent middle pair and one tip: only three triangles. */
function grassMesh(scene: Scene, mat: StandardMaterial): Mesh {
  const positions: number[] = [], normals: number[] = [], colors: number[] = [], indices: number[] = [];
  const rand = rng(99);
  for (let blade = 0; blade < 5; blade++) {
    const angle = blade * Math.PI * 2 / 5 + rand() * 0.6;
    const dx = Math.cos(angle), dz = Math.sin(angle);
    const bx = dx * (0.025 + rand() * 0.055), bz = dz * (0.025 + rand() * 0.055);
    const height = GRASS_CARD_SIZE * (0.57 + rand() * 0.43);
    const width = 0.016 + rand() * 0.022;
    const lean = 0.06 + rand() * 0.065;
    const first = positions.length / 3;
    const points = [
      [0, -width / 2, 0], [0, width / 2, 0],
      [height * 0.57, -width * 0.30, lean * 0.22],
      [height * 0.57, width * 0.30, lean * 0.22], [height, 0, lean],
    ];
    const tint = rand() * 0.035;
    for (const [y, side, bend] of points) {
      positions.push(bx - dz * side + dx * bend, y, bz + dx * side + dz * bend);
      // Foliage uses upward-biased normals on both visible sides, like a soft canopy.
      normals.push(dx * 0.57, 0.82, dz * 0.57);
      const t = y / height;
      colors.push(0.30 + t * 0.13 + tint, 0.43 + t * 0.13 + tint, 0.23 + t * 0.09, 1);
    }
    indices.push(first, first + 1, first + 2, first + 1, first + 3, first + 2, first + 2, first + 3, first + 4);
  }
  const grass = new Mesh('grassTuft', scene);
  const vertices = new VertexData();
  vertices.positions = positions; vertices.normals = normals; vertices.colors = colors; vertices.indices = indices;
  vertices.applyToMesh(grass);
  grass.material = mat;
  grass.isPickable = false;
  grass.alwaysSelectAsActiveMesh = true;
  return grass;
}

/** Builds a cross-card base mesh (n crossed upright quads merged, base at y=0) with `mat`. */
function crossCard(scene: Scene, name: string, size: number, planes: number, mat: StandardMaterial): Mesh {
  const parts = Array.from({ length: planes }, (_, i) => {
    const p = CreatePlane(`${name}_p${i}`, { size }, scene);
    p.rotation.y = (i * Math.PI) / planes;
    return p;
  });
  const card = Mesh.MergeMeshes(parts, true, true)!; // world rotations baked into geometry
  card.name = name;
  card.position.y = size / 2;            // lift so the card's base sits at y=0…
  card.bakeCurrentTransformIntoVertices(); // …and bake it in
  card.material = mat;
  card.isPickable = false;
  card.alwaysSelectAsActiveMesh = true;
  return card;
}

/** A double-sided alpha-test (cutout) material — shared by the grass/flower cards so there's no
 *  transparency sorting. */
function alphaCutoutMaterial(scene: Scene, name: string, tex: DynamicTexture): StandardMaterial {
  const mat = new StandardMaterial(name, scene);
  mat.diffuseTexture = tex;
  mat.useAlphaFromDiffuseTexture = true;
  mat.transparencyMode = Material.MATERIAL_ALPHATEST;
  mat.backFaceCulling = false;
  mat.twoSidedLighting = true;
  mat.ambientColor = new Color3(1, 1, 1);
  mat.specularColor = new Color3(0, 0, 0);
  return mat;
}

function grassMaterial(scene: Scene): StandardMaterial {
  const mat = new StandardMaterial('grassScatterMat', scene);
  mat.backFaceCulling = false;
  // Keep the authored upward normals on BOTH sides. Flipping them for backfaces would shade
  // half these solid ribbons as downward-facing leaves and recreate the dark-spike problem.
  mat.twoSidedLighting = false;
  mat.diffuseColor = new Color3(0.82, 0.82, 0.82);
  mat.emissiveColor = new Color3(0.18, 0.18, 0.18);
  mat.specularColor = new Color3(0, 0, 0);
  mat.ambientColor = new Color3(1, 1, 1);
  return mat;
}

/** Transparent texture with a few small blossoms (cream/lavender) for wildflower cards. */
function flowerAlphaTexture(scene: Scene): DynamicTexture {
  const size = 128;
  const tex = new DynamicTexture('flowerTex', { width: size, height: size }, scene, true);
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, size, size);
  const rand = rng(51);
  const colors = ['#f5f1d9', '#f8f4e7', '#c9bcdd'];
  for (let f = 0; f < 3; f++) {
    const cx = 20 + rand() * (size - 40);
    const cy = 20 + rand() * (size * 0.55);
    const col = colors[(rand() * colors.length) | 0];
    // stem
    ctx.strokeStyle = '#819761'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx, size); ctx.lineTo(cx, cy); ctx.stroke();
    // 5 petals + centre
    ctx.fillStyle = col;
    for (let p = 0; p < 5; p++) {
      const a = (p / 5) * Math.PI * 2;
      ctx.beginPath(); ctx.arc(cx + Math.cos(a) * 5, cy + Math.sin(a) * 5, 4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#d8ba70';
    ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fill();
  }
  tex.update(true);
  tex.hasAlpha = true;
  return tex;
}

function flowerMaterial(scene: Scene): StandardMaterial {
  const mat = alphaCutoutMaterial(scene, 'flowerScatterMat', flowerAlphaTexture(scene));
  mat.emissiveColor = new Color3(0.15, 0.15, 0.15);
  return mat;
}

/** A solid, gently irregular stone. UV/normal seam copies must share the same deformed position. */
export function rockMesh(scene: Scene): Mesh {
  const rock = CreateIcoSphere('rock', { radius: ROCK_BASE_RADIUS, subdivisions: 2 }, scene);
  const pos = rock.getVerticesData(VertexBuffer.PositionKind)!;
  const rand = rng(7);
  const displaced = new Map<string, readonly [number, number, number]>();
  for (let i = 0; i < pos.length; i += 3) {
    // Icosphere vertices are duplicated across face/UV seams. Deforming buffer entries
    // independently tears those seams open; cache a single position for every shared corner.
    const key = [pos[i], pos[i + 1], pos[i + 2]].map(v => Math.round(v * 1e6)).join(',');
    let point = displaced.get(key);
    if (!point) {
      const f = 0.9 + rand() * 0.2;
      point = [pos[i] * f, pos[i + 1] * f * 0.7, pos[i + 2] * f];
      displaced.set(key, point);
    }
    [pos[i], pos[i + 1], pos[i + 2]] = point;
  }
  rock.updateVerticesData(VertexBuffer.PositionKind, pos);
  rock.convertToFlatShadedMesh(); // per-face normals → crisp low-poly facets
  // babylon's normal computation orients this icosphere's normals *inward*, so every outward face
  // faces away from the sun and the rock renders pure black. Flip them outward.
  const nor = rock.getVerticesData(VertexBuffer.NormalKind)!;
  const fpos = rock.getVerticesData(VertexBuffer.PositionKind)!;
  let dot = 0;
  for (let i = 0; i < fpos.length; i += 3) dot += fpos[i] * nor[i] + fpos[i + 1] * nor[i + 1] + fpos[i + 2] * nor[i + 2];
  if (dot < 0) { for (let i = 0; i < nor.length; i++) nor[i] = -nor[i]; rock.updateVerticesData(VertexBuffer.NormalKind, nor); }
  const mat = new StandardMaterial('rockMat', scene);
  mat.diffuseColor = new Color3(...ROCK_DIFFUSE_RGB);
  mat.specularColor = new Color3(0.05, 0.05, 0.05);
  mat.ambientColor = new Color3(1, 1, 1); // pick up the hemispheric ambient so shaded faces aren't black
  rock.material = mat;
  rock.isPickable = false;
  rock.alwaysSelectAsActiveMesh = true;
  return rock;
}

/** Three uneven sprays form a small open shrub, using the same leaf language as the trees. */
function bushMesh(scene: Scene): Mesh {
  const bush = createNaturalFoliage(scene, 'bush', [
    { center: [0, 0.32, 0], radius: [0.42, 0.29, 0.33], sprays: 12 },
    { center: [0.25, 0.25, 0.08], radius: [0.28, 0.22, 0.25], sprays: 8 },
    { center: [-0.20, 0.42, -0.10], radius: [0.27, 0.25, 0.25], sprays: 8 },
  ], 612);
  applyWind(bush.material as StandardMaterial, 0.8, 0.025);
  bush.alwaysSelectAsActiveMesh = true;
  return bush;
}

/** Maximum grass ribbon height, also the wind's bend height; every ribbon is rooted at y=0. */
const GRASS_CARD_SIZE = 0.43;
/** Wildflower card height. Same relationship as GRASS_CARD_SIZE. */
const FLOWER_CARD_SIZE = 0.35;

const ROCK_COLLIDER_MIN_SCALE = 0.75; // only the biggest rocks (top ~quarter) block the player

/** Soft gusts move blades and flower cards by the same world distance, with their roots pinned. */
const SCATTER_WIND_AMPLITUDE = 0.035;

/** Invisible static sphere colliders for the large rocks only, and only where the player can reach
 *  (inside EDGE_RADIUS — rocks on the unwalkable barrier slope render but need no collider). Rendering
 *  stays a single thin-instance draw call; these decoupled bodies just stop the player at the big rocks. */
function addRockColliders(scene: Scene, placements: Placement[]): void {
  for (const p of placements) {
    if (p.s < ROCK_COLLIDER_MIN_SCALE) continue;
    if (Math.hypot(p.x, p.z) > EDGE_RADIUS) continue; // on the barrier — unreachable, skip the collider
    const proxy = CreateSphere('rockCollider', { diameter: 2 * ROCK_BASE_RADIUS * p.s, segments: 3 }, scene);
    proxy.position.set(p.x, p.y, p.z);
    proxy.isVisible = false;
    proxy.isPickable = false;
    new PhysicsAggregate(proxy, PhysicsShapeType.SPHERE, { mass: 0 }, scene);
  }
}

/** Scatters procedural ground detail — grass tufts, wildflowers, rocks, and bushes — as one
 *  thin-instanced base mesh per element type (one draw call each). */
export function createGroundScatter(scene: Scene, shadows: Shadows): void {
  const grassMat = grassMaterial(scene);
  const grass = grassMesh(scene, grassMat);
  grass.thinInstanceSetBuffer('matrix', scatterMatrices({ count: 10000, seed: 1, y: 0, minScale: 0.75, maxScale: 1.3 }).buffer, 16);
  applyWind(grassMat, GRASS_CARD_SIZE, SCATTER_WIND_AMPLITUDE);

  const flowerMat = flowerMaterial(scene);
  const flowers = crossCard(scene, 'wildflower', FLOWER_CARD_SIZE, 2, flowerMat);
  flowers.thinInstanceSetBuffer('matrix', scatterMatrices({ count: 1300, seed: 2, y: 0, minScale: 0.8, maxScale: 1.3, flowerPatches: true }).buffer, 16);
  applyWind(flowerMat, FLOWER_CARD_SIZE, SCATTER_WIND_AMPLITUDE);

  const rockScatter = scatterMatrices({ count: 160, seed: 3, y: -0.05, minScale: 0.3, maxScale: 0.9, pathClearance: 1.8 });
  const rock = rockMesh(scene);
  rock.thinInstanceSetBuffer('matrix', rockScatter.buffer, 16);
  addRockColliders(scene, rockScatter.placements);

  const bush = bushMesh(scene);
  bush.thinInstanceSetBuffer('matrix', scatterMatrices({ count: 90, seed: 4, y: 0, minScale: 0.7, maxScale: 1.3, extent: EXTENT - 2, pathClearance: 2.2 }).buffer, 16);

  // Rocks and bushes cast contact shadows; grass and flowers only receive to avoid speckled ground.
  shadows.receive(grass, flowers, rock);
  shadows.cast(rock, bush);
}
