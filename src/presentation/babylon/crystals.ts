import type { Scene } from '@babylonjs/core/scene';
import { CreatePolyhedron } from '@babylonjs/core/Meshes/Builders/polyhedronBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
// Side-effect: registers the StandardMaterial shader (tree-shaken deep imports need this).
import '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { type Vec3, vec3 } from '../../domain/math/vec3';
import { HOMING_RED_RGB } from './homingColors';

/**
 * The `size` passed to {@link CreatePolyhedron} below. **Not a world-unit dimension**: Babylon's
 * polyhedron builder scales its unit template by `size`, and the type-1 octahedron's template has
 * vertices at `±1` on each axis of a 45°-rotated square, so the mesh's full extent works out at
 * `2 * sqrt(2) * size` — see {@link CRYSTAL_EXTENT}. Measured in the browser to confirm: at `0.45`
 * every crystal's bounding box is 1.273 units on all three axes (1.273 / 0.45 = 2.8289 ≈ 2√2).
 *
 * **Untuned**: 0.45 was picked when this constant was believed to be the crystal's half-height, i.e.
 * intending a ~0.9-unit crystal against the ~1.9-unit knight. What it actually produces is a 1.27-unit
 * crystal — two thirds of the knight's height. That may be fine (a homing target wants to be seen from
 * across the field) but nobody has chosen it deliberately; retune by eye. `0.25` would restore roughly
 * the originally intended proportion.
 */
export const CRYSTAL_SIZE = 0.45;

/**
 * A crystal's actual full extent, in world units, on every axis — the number to reason about when
 * sizing anything against a crystal. Exported so `homingReticle.ts` can scale its ring off the real
 * dimension and stay in proportion automatically if {@link CRYSTAL_SIZE} is ever retuned, rather than
 * carrying its own guess at how big a crystal is.
 */
export const CRYSTAL_EXTENT = CRYSTAL_SIZE * 2 * Math.SQRT2;

/**
 * Emissive tint. Bright and unlit so a crystal reads as a target from across the field rather than
 * as scenery — the same reasoning `scatter.ts` uses for its emissive floors, taken further because
 * this one is supposed to catch the eye.
 */
const CRYSTAL_EMISSIVE = new Color3(0.35, 0.75, 0.95);

/**
 * Diffuse tint — what the hub's sun lights. Kept dark so it stays under {@link CRYSTAL_EMISSIVE}
 * rather than competing with it: the emissive is the part that is supposed to carry the crystal at
 * range, and a bright diffuse would flatten the contrast that does it.
 *
 * **Untuned**: a darker shade of {@link CRYSTAL_EMISSIVE}'s own blue-cyan and nothing more — no pass
 * has looked at a crystal's lit surface as such. Retune by eye alongside the emissive.
 */
const CRYSTAL_DIFFUSE = new Color3(0.1, 0.3, 0.4);

/**
 * Specular tint — the facet glint. It is the only shading cue that changes as a crystal's angle to
 * the camera changes, since the emissive does not, so it is what makes the octahedron read as faceted
 * while the player circles it.
 *
 * **Untuned**: a pale shade of the same blue-cyan, picked to sit above {@link CRYSTAL_DIFFUSE}
 * without being white. Nobody has watched a crystal from a moving camera to judge it.
 */
const CRYSTAL_SPECULAR = new Color3(0.6, 0.8, 0.9);

/**
 * Emissive colour a crystal snaps to when `flash()` is called, eased back to `CRYSTAL_EMISSIVE` by the
 * decay observer below.
 *
 * The homing red ({@link HOMING_RED_RGB}), not a red of this module's own: the reticle draws the same
 * one, and the shared definition is what holds a hit's colour to the aim's rather than a comment
 * saying they match. Its Untuned marking, and the retune, live there.
 */
const FLASH_EMISSIVE = new Color3(...HOMING_RED_RGB);

/**
 * How long a flash takes to ease back to `CRYSTAL_EMISSIVE`, in seconds.
 *
 * **Untuned**: 0.4s is a guess at "reads as a distinct hit, but is done fading before the next crystal
 * in a chain could plausibly be flashed". The first half of that has been watched — the ease back was
 * followed frame by frame in the browser against this constant, and 0.40s does read as a distinct hit.
 * The half the value exists for has not: a homing chain's own bounce-to-bounce cadence was never
 * measured, so whether the flash is done fading before the next one starts is still unknown. Retune by
 * eye once a chain can be flown, not before.
 */
const FLASH_DECAY_SECONDS = 0.4;

export interface Crystals {
  /** World positions, in the order given — the index `selectHomingTarget` returns indexes into. */
  readonly positions: readonly Vec3[];
  /**
   * Snaps crystal `index`'s emissive to {@link FLASH_EMISSIVE}; a single observer registered once in
   * {@link createCrystals} (not one per crystal) eases it back to {@link CRYSTAL_EMISSIVE} over
   * {@link FLASH_DECAY_SECONDS}. Out-of-range indices warn and are ignored rather than throwing, in
   * keeping with this presentation layer's warn-and-skip style elsewhere (see `knight.ts`).
   */
  flash(index: number): void;
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
 *
 * `spots` takes plain `Vec3`s rather than a dedicated spot type: a placement is a point, `Vec3`'s
 * `readonly` fields are exactly what a fixed one needs, and this file already imports `Vec3` for its
 * return type — a second name for the same `{x, y, z}` shape would buy nothing.
 *
 * **Each crystal gets its own `StandardMaterial`** rather than sharing one, so `flash()` can change one
 * crystal's emissive without touching the rest. That is a real trade-off, not a free upgrade: at the
 * hub's five crystals, five materials cost nothing, but a material is a draw-call state change, and the
 * tower mode this move is being built for (design spec §1, §11) will place far more than five. That
 * mode must revisit this — most likely by going back to a shared resting material and cloning one only
 * for the duration of an active flash, releasing it back when the decay finishes — but that machinery
 * is not built here: it would be optimising a level that does not exist yet, against a crystal count
 * nobody has picked.
 */
export function createCrystals(scene: Scene, spots: readonly Vec3[]): Crystals {
  const materials = spots.map((_, i) => {
    const mat = new StandardMaterial(`crystalMat_${i}`, scene);
    // Cloned rather than assigned: the decay observer below writes a crystal's emissive in place, so
    // every material owns its own `Color3` instances and one crystal's flash cannot reach the module
    // constants or its neighbours' materials.
    mat.diffuseColor = CRYSTAL_DIFFUSE.clone();
    mat.emissiveColor = CRYSTAL_EMISSIVE.clone();
    mat.specularColor = CRYSTAL_SPECULAR.clone();
    return mat;
  });

  const positions = spots.map((spot, i) => {
    const mesh = CreatePolyhedron(`crystal_${i}`, { type: 1, size: CRYSTAL_SIZE }, scene);
    mesh.position.set(spot.x, spot.y, spot.z);
    mesh.material = materials[i];
    mesh.isPickable = false;
    // Not registered with `shadows`: a crystal's shadow says nothing, and the frame measurement
    // (2026-08-25 shadow-quality spec) puts every caster at four extra draw calls across four cascades.
    return vec3(spot.x, spot.y, spot.z);
  });

  // `flashElapsed[i]` is `null` while crystal `i` is at rest (on `CRYSTAL_EMISSIVE`, untouched), or the
  // seconds elapsed since its last `flash()` call while it is easing back. One observer drives every
  // crystal's decay — registering one `onBeforeRenderObservable` per crystal here would scale the
  // per-frame observer-dispatch overhead with crystal count for no benefit, since the work per crystal
  // (a lerp) is identical either way.
  const flashElapsed: (number | null)[] = spots.map(() => null);

  scene.onBeforeRenderObservable.add(() => {
    const dt = scene.getEngine().getDeltaTime() / 1000;
    flashElapsed.forEach((elapsed, i) => {
      if (elapsed === null) return; // at rest — skip the lerp entirely, not just clamp it to a no-op
      const next = elapsed + dt;
      const t = Math.min(1, next / FLASH_DECAY_SECONDS);
      Color3.LerpToRef(FLASH_EMISSIVE, CRYSTAL_EMISSIVE, t, materials[i].emissiveColor);
      flashElapsed[i] = t >= 1 ? null : next; // done easing — stop paying for this crystal's lerp
    });
  });

  return {
    positions,
    flash(index: number) {
      if (index < 0 || index >= materials.length) {
        console.warn(`[crystals] flash(${index}) is out of range (${materials.length} crystals) — ignored.`);
        return;
      }
      materials[index].emissiveColor.copyFrom(FLASH_EMISSIVE);
      flashElapsed[index] = 0;
    },
  };
}
