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
 *  Its SIGN decides which way the sky rotates about +Y. Per {@link createClouds}'s doc this can never
 *  fully agree with the wind's bearing: an azimuthal drift agrees at only two viewing azimuths and
 *  runs crosswise at the two at right angles to them, for either sign — negating this only swaps which
 *  pair of azimuths agrees, it does not fix the crosswise ones. Don't chase agreement here. */
const DRIFT_SPEED = 0.004;

/**
 * Where the cloud band sits on the texture: `BASE_F` is the band's LOWEST elevation and `SPAN_F` the
 * height it covers, both as fractions of canvas height (hence the `_F` — they are the `f` of the
 * mapping below). The band is f 0.55..0.75, elevation 9..45 degrees.
 *
 * These were `CLOUD_BAND_TOP` and `CLOUD_BAND_SPAN`. "TOP" was only correct read as a canvas row
 * index — under the mapping below, larger f is HIGHER, so the smaller of the two bounds is the band's
 * bottom — and reading a canvas direction as a sky direction is the exact mistake that put every cloud
 * underground the first time. A constant that has to be read the wrong way round to make sense of its
 * own name is not one to leave in this file.
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
const CLOUD_BAND_BASE_F = 0.55;
const CLOUD_BAND_SPAN_F = 0.2;

/** The cloud texture's size in pixels. Not incidental to `cloudTexture`, which is why it is out here:
 *  {@link BLOB_MIN_RADIUS} and {@link BLOB_RADIUS_SPREAD} are pixel radii, so their angular size on the
 *  dome — and with it {@link CLOUD_BAND_BASE_F}'s measured coverage table — is set by CANVAS_HEIGHT, and
 *  {@link cloudTexture}'s seamless u-tiling draws each blob at ±CANVAS_WIDTH. Change either and the
 *  coverage table must be re-measured with the probe {@link CLOUD_BAND_BASE_F} describes; halving the
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
 * at elevation 9..45 degrees ({@link CLOUD_BAND_BASE_F}); under a rotation by theta about a horizontal
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
 * texel along its own elevation ring — which is also why {@link CLOUD_BAND_BASE_F}'s coverage table holds
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
  // out of step across a scene teardown.
  //
  // `% 1` for the same reason `wind.ts` wraps its phase by GUST_PERIOD, and it is an identity for the
  // same kind of reason: `uOffset` is in texture widths and `cloudTexture` tiles in u, so subtracting
  // a whole number of widths cannot change a single sampled texel. It is not cosmetic. `uOffset`
  // reaches the GPU through `Texture.getTextureMatrix`, i.e. as a translation entry of a float32
  // `mat4`, and the DRIFT_SPEED scale cancels out of that failure mode — the step-to-ULP ratio is
  // `(V / 2^exponent) * 2^23 * dt / t`, which depends on elapsed time and frame time only. Unwrapped,
  // at 144 Hz: 8 h gives offset 115.2, ULP 7.6e-6 against a 2.8e-5 step (3.6 ULP, so the drift already
  // moves in stair-steps) and 24 h gives 345.6, ULP 3.05e-5 against the same 2.8e-5 step — under one
  // ULP, where the drift stalls outright. Those are the wind's own numbers to within 8% (3.9 and 1.0
  // ULP at the same two times), because the ratio never saw the constant. Wrapped, the offset stays
  // under 1 and a ULP is ~6e-8 for any uptime.
  scene.onBeforeRenderObservable.add(() => {
    tex.uOffset = (windTime() * DRIFT_SPEED) % 1;
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
    // See CLOUD_BAND_BASE_F: canvas fraction maps to elevation as f * 180 - 90, so LARGER f is HIGHER in
    // the sky. This is inverted from the obvious reading and is what the first version got wrong.
    const cy = height * (CLOUD_BAND_BASE_F + rand() * CLOUD_BAND_SPAN_F);
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
  // `uOffset` sweeps the whole of [0, 1), so u is sampled across [0, 2): WRAP is what makes the loop a
  // loop, and it is also what lets `createClouds` take that `% 1` for free. CLAMP on v because nothing
  // ever samples outside the band vertically, and wrapping there would fold the horizon's edge into
  // the zenith.
  tex.wrapU = Texture.WRAP_ADDRESSMODE;
  tex.wrapV = Texture.CLAMP_ADDRESSMODE;
  return tex;
}
