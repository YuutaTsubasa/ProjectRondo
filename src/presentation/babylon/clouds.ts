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

/** Peak alpha of a single blob's centre. NOT the layer's ceiling: 40 blobs are drawn `source-over`
 *  into one canvas, so two overlapping centres already composite to 0.55 + 0.55*(1-0.55) = 0.80, and
 *  denser clusters go higher still. Above ~0.7 in the composited result the layer stops reading as
 *  cloud and starts reading as a painted ceiling — 0.55 keeps a single blob well under that, but says
 *  nothing about what clusters do. */
const CLOUD_ALPHA = 0.55;

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
  for (let i = 0; i < 40; i++) {
    const cx = rand() * width;
    // v 0.05..0.5 keeps the band above the horizon; clouds sitting on the skyline would cut through
    // the mountain ring that `terrain.ts` draws there.
    const cy = height * (0.05 + rand() * 0.45);
    const r = 40 + rand() * 90;
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
