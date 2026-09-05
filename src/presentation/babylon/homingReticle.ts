import type { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
// Side-effect: registers the StandardMaterial shader (tree-shaken deep imports need this — see
// crystals.ts/scatter.ts for the same note; without it this mesh would render nothing at all, silently).
import '@babylonjs/core/Materials/standardMaterial';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { type Vec3 } from '../../domain/math/vec3';
import { toBabylon } from './vectorConversions';
import { CRYSTAL_SIZE } from './crystals';

/**
 * Reticle diameter, in world units.
 *
 * **Untuned**: derived, not measured — `CRYSTAL_SIZE` (0.45) is the crystal's own half-height, so
 * `CRYSTAL_SIZE * 2` is roughly the crystal's own full extent. `2.4x` that leaves a visible gap around
 * the crystal so the ring reads as "marking this object" rather than "roughly this object's own size,
 * maybe bigger, maybe smaller". Nobody has watched this against the running scene; retune by eye.
 */
const RETICLE_DIAMETER = CRYSTAL_SIZE * 2.4;

/** Ring texture resolution, in pixels. Arbitrary, not tuning: large enough that the stroked circle
 *  below doesn't pixellate at `RETICLE_DIAMETER` on screen; nothing about the reticle's look depends
 *  on this number specifically. */
const RETICLE_TEXTURE_SIZE = 128;

/**
 * Reticle tint. Unlit and saturated so it reads as a HUD marker rather than scenery.
 *
 * **Untuned**: plain red, chosen only to be unambiguous against the crystal's own cyan
 * `CRYSTAL_EMISSIVE` (`crystals.ts`) — a hit crystal flashes this same red (`crystals.ts`'s
 * `FLASH_EMISSIVE`), so the two are meant to read as one colour vocabulary ("this crystal matters"),
 * not independently chosen. Nobody has watched this in the browser; retune by eye.
 */
const RETICLE_EMISSIVE = new Color3(1, 0, 0);

/** A stroked circle on a transparent background — the reticle's whole visual, drawn at runtime so no
 *  image file enters the repo (the same `DynamicTexture` house pattern `scatter.ts` uses for its grass
 *  and flower cards). The stroke colour itself doesn't matter: the material multiplies it by
 *  `RETICLE_EMISSIVE`, so this only needs to be opaque where the ring should show. */
function ringTexture(scene: Scene): DynamicTexture {
  const size = RETICLE_TEXTURE_SIZE;
  const tex = new DynamicTexture('homingReticleTex', { width: size, height: size }, scene, false);
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, size, size);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = size * 0.08;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size * 0.4, 0, Math.PI * 2);
  ctx.stroke();
  tex.update(true);
  tex.hasAlpha = true;
  return tex;
}

export interface HomingReticle {
  /** Shows the ring centred on `p` (a world position — typically a crystal's, from `Crystals.positions`). */
  showAt(p: Vec3): void;
  /** Hides the ring. Idempotent — safe to call every frame nothing is targeted. */
  hide(): void;
}

/**
 * A red ring marking whatever crystal a homing press would fly to right now.
 *
 * Procedural geometry (a plane) plus a runtime-drawn texture ({@link ringTexture}) — no model, no image
 * file, nothing entering Git LFS, the same house pattern `crystals.ts` (procedural polyhedra) and
 * `scatter.ts` (`DynamicTexture` cards) already use.
 *
 * Billboarded on **both** axes (`Mesh.BILLBOARDMODE_ALL`), not yaw-only the way `trees.ts`'s butterflies
 * once billboarded: this is a HUD-ish marker, not an object with a body that should foreshorten as the
 * camera looks down on it from above — it must always read as a flat, full-size ring, whatever the
 * camera angle.
 *
 * Not pickable, casts and receives no shadows (never registered with `shadows`, the same reasoning
 * `crystals.ts` gives for its own crystals), and has no physics body — it is a pure visual marker.
 */
export function createHomingReticle(scene: Scene): HomingReticle {
  const mat = new StandardMaterial('homingReticleMat', scene);
  mat.diffuseTexture = ringTexture(scene);
  mat.useAlphaFromDiffuseTexture = true;
  mat.disableLighting = true;
  mat.emissiveColor = RETICLE_EMISSIVE;
  mat.specularColor = new Color3(0, 0, 0);
  // The ring must read the same from either side of the plane — a billboard can present its back to
  // the camera transiently while `billboardMode` catches up to a sudden camera swing.
  mat.backFaceCulling = false;

  const mesh = CreatePlane('homingReticle', { size: RETICLE_DIAMETER }, scene);
  mesh.material = mat;
  mesh.isPickable = false;
  mesh.billboardMode = Mesh.BILLBOARDMODE_ALL;
  mesh.setEnabled(false);

  return {
    showAt(p: Vec3) {
      mesh.position.copyFrom(toBabylon(p));
      mesh.setEnabled(true);
    },
    hide() {
      mesh.setEnabled(false);
    },
  };
}
