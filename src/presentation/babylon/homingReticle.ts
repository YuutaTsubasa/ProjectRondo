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
import { CRYSTAL_EXTENT } from './crystals';

/**
 * Reticle diameter, as a multiple of a crystal's own full extent ({@link CRYSTAL_EXTENT}).
 *
 * Deliberately well under 1: the ring sits *inside* the crystal's silhouette rather than enclosing it.
 * Two larger values were watched against the running scene first — 1.35 read as a halo floating around
 * the crystal, and 1.1 still read as too heavy — so the marker is not meant to trace the target's
 * outline at all. It only has to be findable: small, centred, and read at a glance as "that one".
 *
 * Scaling off `CRYSTAL_EXTENT` rather than `CRYSTAL_SIZE` matters even now that the ratio is < 1:
 * `CRYSTAL_SIZE` is a polyhedron-builder scale factor, not a dimension (see its doc in `crystals.ts`),
 * so a ratio against it would mean nothing in world units and would not track a retune of the crystal.
 */
const RETICLE_EXTENT_RATIO = 0.5;

/**
 * How much of the plane's width the drawn ring actually spans — {@link ringTexture} strokes its circle
 * at this fraction of the texture, leaving the rest transparent padding.
 *
 * {@link RETICLE_DIAMETER} divides by this so that `RETICLE_EXTENT_RATIO` means what it says: without
 * the division, a nominal 1.35x margin renders as 1.35 * 0.8 = 1.08x — measured in the browser as a
 * 1.374-unit ring around a 1.273-unit crystal, i.e. a stroke landing almost exactly on the silhouette,
 * which is the reading `RETICLE_EXTENT_RATIO` exists to avoid.
 */
const RING_TEXTURE_FRACTION = 0.8;

/** Plane size, in world units. The *visible* ring is `CRYSTAL_EXTENT * RETICLE_EXTENT_RATIO` across;
 *  the plane is wider by the transparent padding {@link RING_TEXTURE_FRACTION} accounts for. */
const RETICLE_DIAMETER = (CRYSTAL_EXTENT * RETICLE_EXTENT_RATIO) / RING_TEXTURE_FRACTION;

/**
 * Rendering group the reticle draws in. Babylon renders groups in ascending order and, by default,
 * clears the depth buffer between them — so a mesh alone in group 1 is drawn over every group-0 mesh
 * regardless of depth. That is exactly what this marker wants: the ring is centred *on* the crystal,
 * so with a shared depth buffer the crystal's near faces occlude the near half of the ring and it
 * reads as a broken arc from most angles. A HUD-ish marker should not be hidden by the thing it marks.
 *
 * Not tuning — the specific number only has to be greater than the default group 0 that everything
 * else in the hub renders in (nothing else in this codebase sets `renderingGroupId` today).
 */
const RETICLE_RENDERING_GROUP = 1;

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

/**
 * Opacity of the whole ring, multiplied on top of the texture's own alpha.
 *
 * The marker draws over everything ({@link RETICLE_RENDERING_GROUP}), which is what stops the crystal
 * from swallowing it — but that also means a fully opaque ring would punch a solid hole through the
 * crystal it is meant to point at. Letting the crystal show through keeps the marker readable as an
 * overlay on the target rather than a decal replacing part of it.
 *
 * **Untuned**: 0.6 is a first pass at "clearly visible, clearly not solid". Retune by eye.
 */
const RETICLE_ALPHA = 0.6;

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
  // Radius, not diameter — hence the halving. Derived from RING_TEXTURE_FRACTION rather than written
  // as its own literal so the two cannot drift apart: RETICLE_DIAMETER's sizing maths assumes the ring
  // drawn here spans exactly that fraction of the texture.
  ctx.arc(size / 2, size / 2, (size * RING_TEXTURE_FRACTION) / 2, 0, Math.PI * 2);
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
 * Drawn over the scene rather than into it, via {@link RETICLE_RENDERING_GROUP} — the crystal it marks
 * would otherwise occlude the near half of the ring, since the ring is centred inside it.
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
  mat.alpha = RETICLE_ALPHA;
  // The ring must read the same from either side of the plane — a billboard can present its back to
  // the camera transiently while `billboardMode` catches up to a sudden camera swing.
  mat.backFaceCulling = false;

  const mesh = CreatePlane('homingReticle', { size: RETICLE_DIAMETER }, scene);
  mesh.material = mat;
  mesh.isPickable = false;
  mesh.billboardMode = Mesh.BILLBOARDMODE_ALL;
  mesh.renderingGroupId = RETICLE_RENDERING_GROUP;
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
