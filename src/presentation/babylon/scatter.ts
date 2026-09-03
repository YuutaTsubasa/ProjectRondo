import type { Scene } from '@babylonjs/core/scene';
import type { Shadows } from './shadows';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
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

// Cosmetic scatter covers the walkable interior AND the grassy barrier slope, up to the barrier top
// (a bare barrier looks wrong); colliders, though, only go where the player can reach — see below.
const EXTENT = BARRIER_TOP;
const ROCK_BASE_RADIUS = 0.4; // rock icosphere radius — shared by the mesh and its collider

interface ScatterOpts { count: number; seed: number; y: number; minScale: number; maxScale: number; extent?: number; }
interface Placement { x: number; y: number; z: number; s: number; }
interface ScatterResult { buffer: Float32Array; placements: Placement[]; }

/** A 16×count matrix buffer of randomly placed/rotated/scaled instances on the terrain, plus the
 *  per-instance placements (so callers can attach colliders without decoding the matrix buffer). */
function scatterMatrices(o: ScatterOpts): ScatterResult {
  const rand = rng(o.seed);
  const ext = o.extent ?? EXTENT;
  const buffer = new Float32Array(o.count * 16);
  const placements: Placement[] = [];
  const m = Matrix.Identity();
  const scale = new Vector3();
  const pos = new Vector3();
  for (let i = 0; i < o.count; i++) {
    const s = o.minScale + rand() * (o.maxScale - o.minScale);
    scale.set(s, s, s);
    // The boundary is a circular barrier, so confine placement to a disc of radius `ext` (not a
    // square) — otherwise ~1/6 of instances land on the steep unwalkable rim or beyond it.
    let px: number, pz: number;
    do {
      px = (rand() * 2 - 1) * ext;
      pz = (rand() * 2 - 1) * ext;
    } while (px * px + pz * pz > ext * ext);
    const py = terrainHeight(px, pz) + o.y;
    pos.set(px, py, pz);
    Matrix.ComposeToRef(scale, Quaternion.RotationAxis(Vector3.UpReadOnly, rand() * Math.PI * 2), pos, m);
    m.copyToArray(buffer, i * 16);
    placements.push({ x: px, y: py, z: pz, s });
  }
  return { buffer, placements };
}

/** Transparent texture with a handful of tapered green blades rising from the bottom edge. */
function grassAlphaTexture(scene: Scene): DynamicTexture {
  const size = 256;
  const tex = new DynamicTexture('grassBlades', { width: size, height: size }, scene, false);
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, size, size);
  const rand = rng(99);
  const greens = ['#5aa63f', '#6cbf4a', '#7fd35a', '#4f9a37', '#89d95f'];
  for (let i = 0; i < 22; i++) {
    const x0 = 12 + rand() * (size - 24);
    const w = 8 + rand() * 10;
    const h = size * 0.55 + rand() * size * 0.4;
    const lean = (rand() * 2 - 1) * 40;
    ctx.fillStyle = greens[(rand() * greens.length) | 0];
    ctx.beginPath();
    ctx.moveTo(x0, size);
    ctx.quadraticCurveTo(x0 + lean * 0.5, size - h * 0.5, x0 + lean, size - h);
    ctx.quadraticCurveTo(x0 + lean + w * 0.4, size - h * 0.5, x0 + w, size);
    ctx.closePath();
    ctx.fill();
  }
  tex.update(true);
  tex.hasAlpha = true;
  return tex;
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
  mat.specularColor = new Color3(0, 0, 0);
  return mat;
}

function grassMaterial(scene: Scene): StandardMaterial {
  const mat = alphaCutoutMaterial(scene, 'grassScatterMat', grassAlphaTexture(scene));
  // Billboard blades face every direction, so half of them turn away from the sun and go dark. A
  // small green emissive floor keeps the tufts reading as lush grass rather than dark spikes.
  mat.emissiveColor = new Color3(0.10, 0.17, 0.06);
  mat.ambientColor = new Color3(1, 1, 1);
  return mat;
}

/** Transparent texture with a few small blossoms (white/yellow/purple) for wildflower cards. */
function flowerAlphaTexture(scene: Scene): DynamicTexture {
  const size = 128;
  const tex = new DynamicTexture('flowerTex', { width: size, height: size }, scene, false);
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, size, size);
  const rand = rng(51);
  const colors = ['#f4f4f0', '#f2d24b', '#c58bd8'];
  for (let f = 0; f < 5; f++) {
    const cx = 20 + rand() * (size - 40);
    const cy = 20 + rand() * (size * 0.55);
    const col = colors[(rand() * colors.length) | 0];
    // stem
    ctx.strokeStyle = '#4f8f38'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx, size); ctx.lineTo(cx, cy); ctx.stroke();
    // 5 petals + centre
    ctx.fillStyle = col;
    for (let p = 0; p < 5; p++) {
      const a = (p / 5) * Math.PI * 2;
      ctx.beginPath(); ctx.arc(cx + Math.cos(a) * 5, cy + Math.sin(a) * 5, 4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#f2c33b';
    ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fill();
  }
  tex.update(true);
  tex.hasAlpha = true;
  return tex;
}

function flowerMaterial(scene: Scene): StandardMaterial {
  return alphaCutoutMaterial(scene, 'flowerScatterMat', flowerAlphaTexture(scene));
}

/** A chunky low-poly rock: an icosphere with vertices perturbed by a seeded random factor. */
function rockMesh(scene: Scene): Mesh {
  const rock = CreateIcoSphere('rock', { radius: ROCK_BASE_RADIUS, subdivisions: 1 }, scene);
  const pos = rock.getVerticesData(VertexBuffer.PositionKind)!;
  const rand = rng(7);
  for (let i = 0; i < pos.length; i += 3) {
    const f = 0.8 + rand() * 0.5;
    pos[i] *= f; pos[i + 1] *= f * 0.7; pos[i + 2] *= f; // squash vertically a touch
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

/** A small leafy bush: several overlapping green icosphere blobs merged into a lumpy clump, base
 *  at y=0. More, smaller, irregularly-placed blobs (vs a single sphere) give a bushy silhouette that
 *  reads as foliage rather than a green boulder. */
function bushMesh(scene: Scene): Mesh {
  const spec: [number, number, number, number][] = [
    [0, 0.32, 0, 0.42], [0.28, 0.24, 0.08, 0.32], [-0.24, 0.26, -0.10, 0.30],
    [0.10, 0.46, -0.14, 0.28], [-0.12, 0.42, 0.18, 0.26], [0.20, 0.16, -0.22, 0.24],
  ];
  const blobs = spec.map(([x, y, z, r]) => {
    const b = CreateIcoSphere(`bb`, { radius: r, subdivisions: 2 }, scene); // rounder, less rock-like
    b.position.set(x, y, z);
    return b;
  });
  const bush = Mesh.MergeMeshes(blobs, true, true)!;
  bush.name = 'bush';
  const mat = new StandardMaterial('bushMat', scene);
  mat.diffuseColor = new Color3(0.33, 0.55, 0.24); // fresher, more saturated leaf green
  mat.specularColor = new Color3(0.03, 0.03, 0.03);
  mat.emissiveColor = new Color3(0.05, 0.10, 0.03); // keep shaded sides green, not near-black
  mat.ambientColor = new Color3(1, 1, 1);
  bush.material = mat;
  bush.isPickable = false;
  bush.alwaysSelectAsActiveMesh = true;
  return bush;
}

/** Grass card height, in local units. Also the wind's bend height — `crossCard` bakes the base to
 *  y=0, so the card's height IS its size argument. The two must not drift apart. */
const GRASS_CARD_SIZE = 0.5;
/** Wildflower card height. Same relationship as GRASS_CARD_SIZE. */
const FLOWER_CARD_SIZE = 0.22;

const ROCK_COLLIDER_MIN_SCALE = 0.75; // only the biggest rocks (top ~quarter) block the player

/** Wind amplitude for grass and flowers, in WORLD units — see `applyWind`'s doc comment for what this
 *  scale means and why it differs from the trees' value. */
const SCATTER_WIND_AMPLITUDE = 0.06;

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
  const grass = crossCard(scene, 'grassTuft', GRASS_CARD_SIZE, 3, grassMat);
  grass.thinInstanceSetBuffer('matrix', scatterMatrices({ count: 16000, seed: 1, y: 0, minScale: 0.7, maxScale: 1.3 }).buffer, 16);
  applyWind(grassMat, GRASS_CARD_SIZE, SCATTER_WIND_AMPLITUDE);

  const flowerMat = flowerMaterial(scene);
  const flowers = crossCard(scene, 'wildflower', FLOWER_CARD_SIZE, 2, flowerMat);
  flowers.thinInstanceSetBuffer('matrix', scatterMatrices({ count: 1600, seed: 2, y: 0, minScale: 0.7, maxScale: 1.2 }).buffer, 16);
  applyWind(flowerMat, FLOWER_CARD_SIZE, SCATTER_WIND_AMPLITUDE);

  const rockScatter = scatterMatrices({ count: 200, seed: 3, y: -0.05, minScale: 0.3, maxScale: 0.9 });
  const rock = rockMesh(scene);
  rock.thinInstanceSetBuffer('matrix', rockScatter.buffer, 16);
  addRockColliders(scene, rockScatter.placements);

  const bush = bushMesh(scene);
  bush.thinInstanceSetBuffer('matrix', scatterMatrices({ count: 160, seed: 4, y: 0, minScale: 0.7, maxScale: 1.3, extent: EXTENT - 2 }).buffer, 16);

  // Ground detail receives, but only the solid meshes (rock, bush) cast. Measured (Task 7):
  // enabling rock+bush casting changes 42 990 px (4.7% of frame) and reads as intended contact
  // shadows. Grass and flowers stay cast-off: they are 16 000 + 1 600 alpha-tested cross cards,
  // the most expensive option on the table, and enabling their casting on top changes a further
  // 151 322 px (16.4%) that is mostly speckle noise, not shadow.
  shadows.receive(grass, flowers, rock, bush);
  shadows.cast(rock, bush);
}
