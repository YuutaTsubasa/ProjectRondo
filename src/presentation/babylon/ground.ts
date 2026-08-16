// src/presentation/babylon/ground.ts
import type { Scene } from '@babylonjs/core/scene';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import '@babylonjs/core/Materials/standardMaterial'; // side-effect: StandardMaterial shader
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { PhysicsAggregate } from '@babylonjs/core/Physics/v2/physicsAggregate';
import { PhysicsShapeType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin';

const FIELD = 50;      // ground is FIELD x FIELD
const HALF = FIELD / 2;

/** Deterministic 0..1 PRNG (mulberry32) so the grass texture looks identical every run. */
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A tiling grass texture: a green base speckled with lighter/darker tufts. */
function grassTexture(scene: Scene): DynamicTexture {
  const size = 256;
  const tex = new DynamicTexture('grass', { width: size, height: size }, scene, false);
  const ctx = tex.getContext();
  ctx.fillStyle = '#4f7a3a';
  ctx.fillRect(0, 0, size, size);
  const rand = rng(1337);
  const tufts = ['#5c8a44', '#456b33', '#6b9a4e', '#3f5f2e'];
  for (let i = 0; i < 1600; i++) {
    ctx.fillStyle = tufts[(rand() * tufts.length) | 0];
    const x = rand() * size, y = rand() * size;
    ctx.fillRect(x, y, 1 + rand() * 2, 1 + rand() * 2);
  }
  tex.update();
  tex.uScale = 8;
  tex.vScale = 8;
  return tex;
}

/** Adds four thin, invisible, static wall colliders at the field edges so the player can't walk off. */
function createBoundaries(scene: Scene): void {
  const t = 1, h = 6; // wall thickness / height
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

/** Builds the flat grass ground (with its box collider + edge boundaries) and returns the ground mesh. */
export function createGround(scene: Scene): AbstractMesh {
  const ground = CreateGround('ground', { width: FIELD, height: FIELD }, scene);
  const mat = new StandardMaterial('groundMat', scene);
  mat.diffuseTexture = grassTexture(scene);
  mat.diffuseColor = new Color3(1, 1, 1);
  mat.specularColor = new Color3(0.05, 0.05, 0.05);
  ground.material = mat;
  ground.receiveShadows = true;
  new PhysicsAggregate(ground, PhysicsShapeType.BOX, { mass: 0 }, scene);
  createBoundaries(scene);
  return ground;
}
