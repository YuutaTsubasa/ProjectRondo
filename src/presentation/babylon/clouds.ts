import type { Scene } from '@babylonjs/core/scene';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
// Side-effect: registers the StandardMaterial shader (tree-shaken deep imports need this).
import '@babylonjs/core/Materials/standardMaterial';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { rng } from '../../domain/math/rng';
import { windTime } from './wind';

/** Just inside `environment.ts`'s 1000-diameter skydome, so the clouds are in front of the gradient
 *  and behind everything else. Both are `infiniteDistance`, so neither has a real position. */
const DOME_DIAMETER = 900;

/** Texture widths of drift per second, so one loop lasts `1 / DRIFT_SPEED` seconds — 250 s here. Small
 *  values matter: clouds that visibly race read as a timelapse rather than as weather.
 *
 *  **Untuned.** This is the initial value; nobody has watched the layer move. Judge it against the
 *  running scene, not by arithmetic, and note that one loop is four minutes — a few seconds of
 *  watching says nothing about the seam (see {@link cloudTexture}).
 *
 *  Its SIGN decides which way the sky travels. Whether that agrees with the way the grass leans is a
 *  property of how the sphere's UVs wrap, not something to derive on paper: if the clouds cross the
 *  field's lean, negate this. */
const DRIFT_SPEED = 0.004;

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
 * **That table describes every moment of the drift, not just t = 0** — but only because the drift is a
 * scroll in u, which slides each elevation ring along itself and so cannot move a cloud to a different
 * elevation. See {@link createClouds} for why no other kind of drift is available on this dome.
 *
 * Re-measure with that probe after touching any constant here; do not reason about the mapping.
 */
const CLOUD_BAND_TOP = 0.55;
const CLOUD_BAND_SPAN = 0.2;

/** The cloud texture's size in pixels. Not incidental to `cloudTexture`, which is why it is out here:
 *  {@link BLOB_MIN_RADIUS} and {@link BLOB_RADIUS_SPREAD} are pixel radii, so their angular size on the
 *  dome — and with it {@link CLOUD_BAND_TOP}'s measured coverage table — is set by CANVAS_HEIGHT, and
 *  {@link cloudTexture}'s seamless u-tiling draws each blob at ±CANVAS_WIDTH. Change either and the
 *  coverage table must be re-measured with the probe {@link CLOUD_BAND_TOP} describes; halving the
 *  height alone doubles every blob's angular radius. */
const CANVAS_WIDTH = 1024;
const CANVAS_HEIGHT = 512;

/** Blob count and radii, in pixels of the {@link CANVAS_HEIGHT}-tall canvas. Tuned together with
 *  CLOUD_ALPHA against the coverage table above: the target was scattered cloud in the camera's strip,
 *  not an overcast lid. The first version's 40 blobs at radius 40..130 gave 100% coverage wherever they
 *  landed. */
const BLOB_COUNT = 20;
const BLOB_MIN_RADIUS = 16;
const BLOB_RADIUS_SPREAD = 30;

/** Peak alpha of a single blob's centre. NOT the layer's ceiling: blobs are drawn `source-over` into
 *  one canvas, so two overlapping centres composite to `a + a*(1-a)` — 0.40 gives 0.64 for a pair and
 *  0.78 for a triple. Above ~0.7 composited the layer stops reading as cloud and starts reading as a
 *  painted ceiling, so the blob count above matters as much as this number does. */
const CLOUD_ALPHA = 0.4;

/**
 * A drifting cloud layer: a second inward-facing dome carrying a procedurally drawn alpha texture that
 * scrolls in u.
 *
 * **Why the drift is a u scroll and not a directional one.** Scrolling u is a rotation of the pattern
 * about +Y, and that is the only rotation a band on a dome survives. The band is an annulus about +Y
 * at elevation 9..45 degrees ({@link CLOUD_BAND_TOP}); under a rotation by theta about a horizontal
 * axis `(ax, 0, az)` a point `(px, y, pz)`'s height becomes `y*cos(theta) - (ax*px + az*pz)*sin(theta)`,
 * which at theta = pi is just `-y` — every cloud below the horizon. That version shipped, about the axis
 * perpendicular to the wind so that every point of the dome travelled along the wind's bearing from
 * any viewing angle, and it emptied the sky once per cycle. Sampling the band (elevation 9..45 every
 * 2 degrees, azimuth every 5 degrees) for the fraction still above the horizon, at its 0.025 rad/s:
 *
 * | t (s)            | 0 | 21 | 42 | 63 | 84 | 105 | 126 |
 * | horizontal axis  | 100% | 73% | 63% | 62% | 51% | 13% | 0% |
 *
 * The same sampler over the shipped scroll, at all 72 points of the 250 s loop: **100% above the
 * horizon at every one**, with the band's elevation extremes exactly 9 and 45 throughout. That is
 * invariant by construction rather than by luck — u is the sphere's azimuth, so the scroll moves each
 * texel along its own elevation ring — which is also why {@link CLOUD_BAND_TOP}'s coverage table holds
 * for the whole loop instead of only for the first frame.
 *
 * The cost, stated so nobody re-attempts the fix: an azimuthal drift reads as travelling along the
 * wind's bearing only from the two viewing azimuths where the ring's tangent IS that bearing, and
 * crosswise from the two at right angles to them. That is the trade spec §4 takes, and it is the only
 * one on offer — a band that must stay in the sky can only rotate about +Y.
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
  // Transparent meshes sort by `alphaIndex` first and only then back-to-front, and the default is
  // Number.MAX_VALUE for every mesh — so the dome and the pond would tie and be ordered by distance.
  // The dome loses that: `infiniteDistance` moves it with the camera in the shader, but the sort reads
  // its real bounding sphere, which is centred on the origin and therefore *nearer* than half the
  // water. Neither surface writes depth, so whichever draws second blends over the other, and a dome
  // drawn after the pond tints the water with sky. 0 pins it ahead of all other transparency.
  dome.alphaIndex = 0;

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

  // Set from the shared clock rather than accumulated here, so the clouds and the grass cannot drift
  // out of step across a scene teardown. `uOffset` is in texture widths and wraps naturally, as long
  // as the texture tiles in u — which `cloudTexture` is drawn to do.
  scene.onBeforeRenderObservable.add(() => {
    tex.uOffset = windTime() * DRIFT_SPEED;
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
  const width = CANVAS_WIDTH;
  const height = CANVAS_HEIGHT;
  const tex = new DynamicTexture('cloudLayer', { width, height }, scene, false);
  const ctx = tex.getContext();
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
  // `uOffset` grows without bound, so u is sampled far outside [0, 1): WRAP is what makes the loop a
  // loop. CLAMP on v because nothing ever samples outside the band vertically, and wrapping there
  // would fold the horizon's edge into the zenith.
  tex.wrapU = Texture.WRAP_ADDRESSMODE;
  tex.wrapV = Texture.CLAMP_ADDRESSMODE;
  return tex;
}
