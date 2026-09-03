import type { Scene } from '@babylonjs/core/scene';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
// Side-effect: registers the StandardMaterial shader (tree-shaken deep imports need this).
import '@babylonjs/core/Materials/standardMaterial';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { rng } from '../../domain/math/rng';

/** Just inside `environment.ts`'s 1000-diameter skydome, so the clouds are in front of the gradient
 *  and behind everything else. Both are `infiniteDistance`, so neither has a real position. */
const DOME_DIAMETER = 900;

/** Texture widths of drift per second. Small: clouds that visibly race read as a timelapse. Tuned in
 *  the browser (Step 7). */
const DRIFT_SPEED = 0.004;

/** Peak alpha of a cloud's centre. Above ~0.7 the layer stops reading as cloud and starts reading as
 *  a painted ceiling. */
const CLOUD_ALPHA = 0.55;

/**
 * A drifting cloud layer: a second inward-facing dome carrying a procedurally drawn alpha texture
 * that scrolls in u.
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

  // Drift from the same clock as the grass. `uOffset` is in texture widths, so it wraps naturally as
  // long as the texture tiles in u — which `cloudTexture` is drawn to do.
  //
  // Which SIGN sends the clouds the same way the grass leans is a property of how the sphere's UVs
  // wrap against WIND_DIR_*, not something worth deriving on paper. Confirm it in the browser
  // (Step 7) and negate DRIFT_SPEED if they cross.
  scene.onBeforeRenderObservable.add(() => {
    tex.uOffset += (DRIFT_SPEED * scene.getEngine().getDeltaTime()) / 1000;
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
