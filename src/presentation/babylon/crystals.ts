import type { Scene } from '@babylonjs/core/scene';
import { CreatePolyhedron } from '@babylonjs/core/Meshes/Builders/polyhedronBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
// Side-effect: registers the StandardMaterial shader (tree-shaken deep imports need this).
import '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { type Vec3, vec3 } from '../../domain/math/vec3';

/** Half-height of a crystal, in world units. The knight is ~1.9 tall, so this reads as a held object. */
const CRYSTAL_SIZE = 0.45;

/**
 * Emissive tint. Bright and unlit so a crystal reads as a target from across the field rather than
 * as scenery — the same reasoning `scatter.ts` uses for its emissive floors, taken further because
 * this one is supposed to catch the eye.
 */
const CRYSTAL_EMISSIVE = new Color3(0.35, 0.75, 0.95);

export interface CrystalSpot { readonly x: number; readonly y: number; readonly z: number }

export interface Crystals {
  /** World positions, in the order given — the index `selectHomingTarget` returns indexes into. */
  readonly positions: readonly Vec3[];
}

/**
 * Places homing-attack crystals.
 *
 * Takes a `Scene` and reaches for nothing else in the hub: the tower mode will be a second Babylon
 * scene, and crystals are the one thing both it and the hub need. Writing it scene-agnostic on day
 * one is free and is the difference between reusing this and rewriting it.
 *
 * Polyhedron type 1 is an octahedron — two square pyramids base to base, which is a crystal shape
 * without a model, a texture, or anything entering Git LFS.
 */
export function createCrystals(scene: Scene, spots: readonly CrystalSpot[]): Crystals {
  const mat = new StandardMaterial('crystalMat', scene);
  mat.diffuseColor = new Color3(0.1, 0.3, 0.4);
  mat.emissiveColor = CRYSTAL_EMISSIVE;
  mat.specularColor = new Color3(0.6, 0.8, 0.9);

  const positions = spots.map((spot, i) => {
    const mesh = CreatePolyhedron(`crystal_${i}`, { type: 1, size: CRYSTAL_SIZE }, scene);
    mesh.position.set(spot.x, spot.y, spot.z);
    mesh.material = mat;
    mesh.isPickable = false;
    // Not registered with `shadows`: a crystal's shadow says nothing, and the frame measurement
    // (2026-08-25 shadow-quality spec) puts every caster at four extra draw calls across four cascades.
    return vec3(spot.x, spot.y, spot.z);
  });

  return { positions };
}
