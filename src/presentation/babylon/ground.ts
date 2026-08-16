import type { Scene } from '@babylonjs/core/scene';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import '@babylonjs/core/Materials/standardMaterial'; // side-effect: StandardMaterial shader
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { PhysicsAggregate } from '@babylonjs/core/Physics/v2/physicsAggregate';
import { PhysicsShapeType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin';

const FIELD = 50;      // ground is FIELD x FIELD
const HALF = FIELD / 2;
/** How many times the seamless grass texture repeats across the field (higher = finer blades, more repetition). */
const GRASS_TILING = 6;

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

/** Builds the flat grass ground (tiling grass texture, box collider, edge boundaries) and returns it. */
export function createGround(scene: Scene): AbstractMesh {
  const ground = CreateGround('ground', { width: FIELD, height: FIELD }, scene);
  const mat = new StandardMaterial('groundMat', scene);
  const grass = new Texture('/textures/grass.jpg', scene);
  grass.uScale = GRASS_TILING;
  grass.vScale = GRASS_TILING;
  mat.diffuseTexture = grass;
  mat.specularColor = new Color3(0.05, 0.05, 0.05); // grass isn't shiny
  ground.material = mat;
  ground.receiveShadows = true;
  new PhysicsAggregate(ground, PhysicsShapeType.BOX, { mass: 0 }, scene);
  createBoundaries(scene);
  return ground;
}
