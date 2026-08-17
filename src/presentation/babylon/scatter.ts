import type { Scene } from '@babylonjs/core/scene';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import '@babylonjs/core/Materials/standardMaterial'; // side-effect: StandardMaterial shader
import { Material } from '@babylonjs/core/Materials/material';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';

const EXTENT = 24; // scatter within ±EXTENT (inside the ±25 boundary walls)

/** Deterministic 0..1 PRNG (mulberry32) so each scatter layout is identical every run. */
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface ScatterOpts { count: number; seed: number; y: number; minScale: number; maxScale: number; extent?: number; }

/** A 16×count matrix buffer of randomly placed/rotated/scaled instances on the field. */
function scatterMatrices(o: ScatterOpts): Float32Array {
  const rand = rng(o.seed);
  const ext = o.extent ?? EXTENT;
  const buf = new Float32Array(o.count * 16);
  const m = Matrix.Identity();
  const scale = new Vector3();
  const pos = new Vector3();
  for (let i = 0; i < o.count; i++) {
    const s = o.minScale + rand() * (o.maxScale - o.minScale);
    scale.set(s, s, s);
    pos.set((rand() * 2 - 1) * ext, o.y, (rand() * 2 - 1) * ext);
    Matrix.ComposeToRef(scale, Quaternion.RotationAxis(Vector3.UpReadOnly, rand() * Math.PI * 2), pos, m);
    m.copyToArray(buf, i * 16);
  }
  return buf;
}

/** Transparent texture with a handful of tapered green blades rising from the bottom edge. */
function grassAlphaTexture(scene: Scene): DynamicTexture {
  const size = 256;
  const tex = new DynamicTexture('grassBlades', { width: size, height: size }, scene, false);
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, size, size);
  const rand = rng(99);
  const greens = ['#3f7a2e', '#4f8f38', '#5fa043', '#356b28'];
  for (let i = 0; i < 14; i++) {
    const x0 = 20 + rand() * (size - 40);
    const w = 6 + rand() * 8;
    const h = size * 0.5 + rand() * size * 0.42;
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
  const parts: Mesh[] = [];
  for (let i = 0; i < planes; i++) {
    const p = CreatePlane(`${name}_p${i}`, { size }, scene);
    p.rotation.y = (i * Math.PI) / planes;
    parts.push(p);
  }
  const card = Mesh.MergeMeshes(parts, true, true)!; // world rotations baked into geometry
  card.name = name;
  card.position.y = size / 2;            // lift so the card's base sits at y=0…
  card.bakeCurrentTransformIntoVertices(); // …and bake it in
  card.material = mat;
  card.isPickable = false;
  card.alwaysSelectAsActiveMesh = true;
  return card;
}

function grassMaterial(scene: Scene): StandardMaterial {
  const mat = new StandardMaterial('grassScatterMat', scene);
  const tex = grassAlphaTexture(scene);
  mat.diffuseTexture = tex;
  mat.useAlphaFromDiffuseTexture = true;
  mat.transparencyMode = Material.MATERIAL_ALPHATEST; // cutout — no transparency sorting
  mat.backFaceCulling = false;
  mat.specularColor = new Color3(0, 0, 0);
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
  const mat = new StandardMaterial('flowerScatterMat', scene);
  mat.diffuseTexture = flowerAlphaTexture(scene);
  mat.useAlphaFromDiffuseTexture = true;
  mat.transparencyMode = Material.MATERIAL_ALPHATEST;
  mat.backFaceCulling = false;
  mat.specularColor = new Color3(0, 0, 0);
  return mat;
}

/** Scatters procedural ground detail (grass, and — added in later tasks — flowers/rocks/bushes). */
export function createGroundScatter(scene: Scene): void {
  const grass = crossCard(scene, 'grassTuft', 0.5, 3, grassMaterial(scene));
  grass.thinInstanceSetBuffer('matrix', scatterMatrices({ count: 4000, seed: 1, y: 0, minScale: 0.7, maxScale: 1.3 }), 16);

  const flowers = crossCard(scene, 'wildflower', 0.22, 2, flowerMaterial(scene));
  flowers.thinInstanceSetBuffer('matrix', scatterMatrices({ count: 400, seed: 2, y: 0, minScale: 0.7, maxScale: 1.2 }), 16);
}
