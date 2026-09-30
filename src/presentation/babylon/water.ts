import type { Scene } from '@babylonjs/core/scene';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { CreateDisc } from '@babylonjs/core/Meshes/Builders/discBuilder';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { rng } from '../../domain/math/rng';
import { FresnelParameters } from '@babylonjs/core/Materials/fresnelParameters';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
// Side-effect: registers the StandardMaterial shader. Required with tree-shaken deep imports.
import '@babylonjs/core/Materials/standardMaterial';
import { POND, type WaterBody } from '../../domain/hub/waterBody';

/** Edge length of the square ripple texture. Small on purpose — it is tiled and blurred by motion. */
const RIPPLE_TEXTURE_SIZE = 256;
/** How many times the ripple texture repeats across the pond. */
const RIPPLE_TILING = 6;
/** Surface scroll, world units per second, applied diagonally. */
const SCROLL_U_PER_SEC = 0.015;
const SCROLL_V_PER_SEC = 0.009;
/** Base transparency. `opacityFresnelParameters` varies it by view angle around this. */
const WATER_ALPHA = 0.72;

/**
 * Ripple normals, painted procedurally so no binary asset is added — the same technique as the sky
 * gradient in `environment.ts` and the grass cutouts in `scatter.ts`.
 *
 * Two sine frequencies are summed into the ONE texture rather than scrolled as two layers, because
 * `StandardMaterial` has a single `bumpTexture` slot: claiming two scrolling layers would be a claim
 * the material cannot deliver. The result is encoded as a tangent-space normal map, where flat is
 * (0.5, 0.5, 1.0) — the blue channel stays high because these are shallow ripples, not deep waves.
 */
function rippleNormalTexture(scene: Scene): DynamicTexture {
  const size = RIPPLE_TEXTURE_SIZE;
  const tex = new DynamicTexture('waterRipple', { width: size, height: size }, scene, false);
  const ctx = tex.getContext();
  // `ctx` is Babylon's `ICanvasRenderingContext`, a portable subset that omits `createImageData`
  // (headless/NullEngine contexts do not have it) even though `putImageData` is on the interface.
  // The DOM `ImageData` constructor produces the same object without going through `ctx`.
  const image = new ImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * Math.PI * 2;
      const v = (y / size) * Math.PI * 2;
      // Two frequencies, the second finer and rotated, so the surface does not read as one wave train.
      const dx = 0.6 * Math.cos(u * 2) + 0.4 * Math.cos(u * 5 + v * 3);
      const dy = 0.6 * Math.cos(v * 2) + 0.4 * Math.cos(v * 5 - u * 3);
      const i = (y * size + x) * 4;
      image.data[i] = 128 + dx * 40;
      image.data[i + 1] = 128 + dy * 40;
      image.data[i + 2] = 255;
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  tex.update();
  tex.uScale = RIPPLE_TILING;
  tex.vScale = RIPPLE_TILING;
  return tex;
}

/** Quiet colour variation and short reflected-sky strokes give the pond a readable surface. */
function waterColorTexture(scene: Scene): DynamicTexture {
  const tex = new DynamicTexture('pondColor', { width: 512, height: 512 }, scene, true);
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  const gradient = ctx.createLinearGradient(0, 0, 512, 512);
  gradient.addColorStop(0, '#465f65');
  gradient.addColorStop(0.55, '#6b8583');
  gradient.addColorStop(1, '#536e70');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 512, 512);
  const rand = rng(145);
  ctx.lineCap = 'round';
  for (let i = 0; i < 42; i++) {
    const x = rand() * 512, y = rand() * 512, length = 5 + rand() * 24;
    ctx.strokeStyle = `rgba(213,226,223,${0.055 + rand() * 0.085})`;
    ctx.lineWidth = 0.8 + rand() * 1.2;
    ctx.beginPath(); ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + length / 2, y - 1.5, x + length, y); ctx.stroke();
  }
  tex.update();
  return tex;
}

/**
 * Builds the pond: a disc at the water surface with animated ripple normals.
 *
 * `StandardMaterial` in gamma space, with `fogEnabled` left on, is the load-bearing choice and is a
 * direct consequence of P2. Every surface fog reaches in this hub is a StandardMaterial; the trees
 * bleached to grey because they were the one PBR surface, since PBR blends fog in linear space where
 * a small blend toward a near-white fog colour multiplies a dark pixel several-fold (P2 spec §11).
 *
 * The water carries **no collider**. The terrain underneath is already walkable, so wading is what
 * happens when nothing is added — blocking would be the option that costs work.
 */
export function createWater(scene: Scene, body: WaterBody = POND): void {
  const surface = CreateDisc('water', { radius: body.radius, tessellation: 64 }, scene);
  // Measured (not assumed): under `useRightHandedSystem = true`, CreateDisc's XY-plane vertices
  // come out with local normal (0, 0, -1), not the +Z one might expect. Rotating +π/2 about X
  // carries that (0, 0, -1) to world (0, 1, 0) — normal up — which is why this sign is correct.
  surface.rotation.x = Math.PI / 2;
  surface.position.set(body.centreX, body.surfaceY, body.centreZ);
  surface.isPickable = false;

  const mat = new StandardMaterial('waterMat', scene);
  mat.diffuseColor = new Color3(0.6, 0.72, 0.72);
  const color = waterColorTexture(scene);
  mat.diffuseTexture = color;
  // Water is the one surface here that should carry a highlight — unlike the trees, where specular
  // is zeroed because PBR roughness 0.5 never produced one.
  mat.specularColor = new Color3(0.12, 0.16, 0.16);
  mat.specularPower = 64;
  mat.emissiveColor = new Color3(0.025, 0.045, 0.045);
  mat.ambientColor = new Color3(1, 1, 1); // pick up the hemispheric ambient, as the rocks do
  mat.alpha = WATER_ALPHA;
  // Held as a DynamicTexture, NOT read back off `mat.bumpTexture` — that is typed
  // `Nullable<BaseTexture>`, and `uOffset` lives on `Texture`, so the scroll below would not compile.
  const ripple = rippleNormalTexture(scene);
  ripple.level = 0.18; // shallow pond ripples, avoiding harsh normal-map highlights
  mat.bumpTexture = ripple;
  // Edge-versus-centre opacity: looking straight down the water is clearer, at a grazing angle it
  // turns opaque. The largest "reads as water" gain available without a render target.
  mat.opacityFresnelParameters = new FresnelParameters();
  mat.opacityFresnelParameters.leftColor = Color3.White();
  mat.opacityFresnelParameters.rightColor = new Color3(0.35, 0.35, 0.35);
  mat.opacityFresnelParameters.power = 2;
  mat.backFaceCulling = false; // the camera can dip below the surface at the bank
  surface.material = mat;

  scene.onBeforeRenderObservable.add(() => {
    const dt = scene.getEngine().getDeltaTime() / 1000;
    // UV offsets are periodic, so wrap into [0, 1) rather than accumulate unbounded floats.
    ripple.uOffset = (ripple.uOffset + SCROLL_U_PER_SEC * dt) % 1;
    ripple.vOffset = (ripple.vOffset + SCROLL_V_PER_SEC * dt) % 1;
  });
}
