import type { Scene } from '@babylonjs/core/scene';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
// Side-effect: registers the StandardMaterial shader (tree-shaken deep imports need this).
import '@babylonjs/core/Materials/standardMaterial';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { rng } from '../../domain/math/rng';
import { WIND_DIRECTION_X, WIND_DIRECTION_Z } from '../../domain/hub/windDirection';
import { windTime } from './wind';

/** Just inside `environment.ts`'s 1000-diameter skydome, so the clouds are in front of the gradient
 *  and behind everything else. Both are `infiniteDistance`, so neither has a real position. */
const DOME_DIAMETER = 900;

/** Radians of dome rotation per second about the drift axis (see `createClouds`) — roughly the old
 *  `uOffset` scroll's apparent speed (0.004 texture-widths/s * 2*PI). UNTUNED: pick the real rate in
 *  the browser (Step 7); small values matter because clouds that visibly race read as a timelapse. */
const DRIFT_RATE = 0.025;

/**
 * Where the cloud band sits on the texture, as a fraction of canvas height.
 *
 * **The v axis is INVERTED relative to the obvious reading, and getting this wrong is why the first
 * shipped version of this file put every cloud underground.** Measured 2026-09-05 by painting a single
 * full-alpha stripe at a known canvas fraction and finding its elevation with a wide-FOV probe camera
 * pointed at the zenith (a stripe becomes a ring; ring radius gives the angle from the view axis):
 *
 * | canvas fraction f | 0.1 | 0.7 | 0.9 |
 * | elevation         | not visible at all | 36 deg | 72 deg |
 *
 * so **elevation ≈ f * 180 - 90**: f = 1 is the ZENITH, f = 0.5 the horizon, f = 0 the nadir. This is
 * the same trap `environment.ts` documents for the skydome's gradient, whose stop 1.0 also renders at
 * the zenith rather than where the stop names suggest — that comment was already in the repo when this
 * file was written, and this file assumed the naive mapping anyway.
 *
 * The original band was `0.05 + rand() * 0.45`, commented "keeps the band above the horizon". Under
 * the real mapping that is elevation **-81 to 0 degrees** — at and below the horizon, buried under the
 * world, which is why the layer was invisible in play.
 *
 * 0.55..0.75 is elevation 9..45 degrees. The gameplay camera sits at about -1.8 degrees of pitch with
 * a 0.8 rad vertical FOV, so it frames sky from roughly 10 to 23 degrees, and the mountain ring
 * occludes the bottom of that. Measured coverage of the shipped values, as the percentage of each
 * elevation ring carrying any cloud (and the mean summed RGB delta against a cloudless render, where
 * ~300 would be opaque white over dark sky):
 *
 * | elevation | 15 | 20 | 25 | 30 | 35 | 40 | 45 |
 * | coverage  | 5% | 33% | 40% | 34% | 36% | 29% | 20% |
 * | strength  | 1  | 19 | 30 | 26 | 27 | 24 | 14 |
 *
 * Re-measure with that probe after touching any constant here; do not reason about the mapping.
 */
const CLOUD_BAND_TOP = 0.55;
const CLOUD_BAND_SPAN = 0.2;

/** Blob count and radii, in pixels of the 512-tall canvas. Tuned together with CLOUD_ALPHA against the
 *  coverage table above: the target was scattered cloud in the camera's strip, not an overcast lid.
 *  The first version's 40 blobs at radius 40..130 gave 100% coverage wherever they landed. */
const BLOB_COUNT = 20;
const BLOB_MIN_RADIUS = 16;
const BLOB_RADIUS_SPREAD = 30;

/** Peak alpha of a single blob's centre. NOT the layer's ceiling: blobs are drawn `source-over` into
 *  one canvas, so two overlapping centres composite to `a + a*(1-a)` — 0.40 gives 0.64 for a pair and
 *  0.78 for a triple. Above ~0.7 composited the layer stops reading as cloud and starts reading as a
 *  painted ceiling, so the blob count above matters as much as this number does. */
const CLOUD_ALPHA = 0.4;

/**
 * A drifting cloud layer: a second inward-facing dome carrying a procedurally drawn alpha texture,
 * rotated about a HORIZONTAL axis so the cloud band travels along the wind's bearing.
 *
 * `fogEnabled = false` and `infiniteDistance = true` for the same reason `environment.ts` records for
 * the skydome: at this distance scene fog would flatten the whole thing into a sheet of fog colour.
 * `disableLighting` because a cloud lit by the scene's directional sun would take a terminator across
 * the dome.
 */
export function createClouds(scene: Scene): void {
  const dome = CreateSphere('clouds', { diameter: DOME_DIAMETER, segments: 24, sideOrientation: Mesh.BACKSIDE }, scene);
  dome.infiniteDistance = true;
  dome.isPickable = false;
  dome.rotationQuaternion = Quaternion.Identity();

  const mat = new StandardMaterial('cloudMat', scene);
  mat.disableLighting = true;
  mat.backFaceCulling = false;
  mat.fogEnabled = false;
  const tex = cloudTexture(scene);
  mat.emissiveTexture = tex;
  // The same texture drives coverage: StandardMaterial reads opacity from the alpha channel, which
  // is the channel `cloudTexture` paints the cloud shapes into.
  mat.opacityTexture = tex;
  dome.material = mat;

  // Rotating the dome about Y (what scrolling `tex.uOffset` amounts to, since u is the sphere's
  // azimuth) is a spin, not a drift: it has no single bearing, so it only agrees with the wind
  // direction from two viewing azimuths and is perpendicular to it from the other two. Rotating about
  // the HORIZONTAL axis perpendicular to the wind instead makes every point on the dome travel along
  // the wind's bearing, from any viewing angle. For a unit-length wind direction (dx, dz) in the XZ
  // plane, that axis is (dz, 0, -dx) — already unit length, and perpendicular to (dx, 0, dz) by
  // construction (their dot product is dz*dx + 0 + (-dx)*dz = 0).
  const driftAxis = new Vector3(WIND_DIRECTION_Z, 0, -WIND_DIRECTION_X);
  scene.onBeforeRenderObservable.add(() => {
    Quaternion.RotationAxisToRef(driftAxis, windTime() * DRIFT_RATE, dome.rotationQuaternion!);
  });
}

/**
 * Soft white blobs in the upper band of the dome, drawn into an alpha texture.
 *
 * Every blob is drawn three times — at x, x - width and x + width — so a cloud straddling the seam
 * appears on both edges and the texture **tiles in u**. Without that, the drift sweeps a hard vertical
 * cut across the sky once per loop, which is only visible after watching a full period and is
 * therefore very easy to ship.
 */
function cloudTexture(scene: Scene): DynamicTexture {
  const width = 1024;
  const height = 512;
  const tex = new DynamicTexture('cloudLayer', { width, height }, scene, false);
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, width, height);
  const rand = rng(11);
  for (let i = 0; i < BLOB_COUNT; i++) {
    const cx = rand() * width;
    // See CLOUD_BAND_TOP: canvas fraction maps to elevation as f * 180 - 90, so LARGER f is HIGHER in
    // the sky. This is inverted from the obvious reading and is what the first version got wrong.
    const cy = height * (CLOUD_BAND_TOP + rand() * CLOUD_BAND_SPAN);
    const r = BLOB_MIN_RADIUS + rand() * BLOB_RADIUS_SPREAD;
    for (const dx of [-width, 0, width]) {
      const g = ctx.createRadialGradient(cx + dx, cy, 0, cx + dx, cy, r);
      g.addColorStop(0, `rgba(255,255,255,${CLOUD_ALPHA})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx + dx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  tex.update(true);
  tex.hasAlpha = true;
  tex.wrapU = Texture.WRAP_ADDRESSMODE; // the drift depends on this
  tex.wrapV = Texture.CLAMP_ADDRESSMODE;
  return tex;
}
