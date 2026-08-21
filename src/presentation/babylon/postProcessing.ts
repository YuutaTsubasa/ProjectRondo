import { Scene } from '@babylonjs/core/scene';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { Camera } from '@babylonjs/core/Cameras/camera';
import { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline';
import { HORIZON_HEX } from './atmosphereColors';
import { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration';
// Belt-and-braces: in Babylon 9.21 PostProcessRenderPipeline's own constructor registers this scene
// component, so the import is redundant today. It is kept because that is an implementation detail
// we do not control, and because every other deep-import side effect in this codebase is explicit.
import '@babylonjs/core/PostProcesses/RenderPipeline/postProcessRenderPipelineManagerSceneComponent';

/**
 * Distance fog and the camera's rendering pipeline — the frame-level half of the atmosphere, as
 * opposed to `environment.ts`, which builds the lights and the sky themselves.
 */

/** Fog colour — shared with the sky's horizon stop; see `atmosphereColors.ts` for why. */
const FOG_COLOR = Color3.FromHexString(HORIZON_HEX);

/**
 * EXP2 density, chosen from the scene's real distances rather than by eye: the field's half-extent is
 * 50, the mountain ring sits at radius 85, and the barrier confines the player to about 42 — so the
 * far side of the field is up to ~100 units away and the mountains 43–127 depending on where the
 * player stands.
 *
 * With `factor = exp(-(d * density)^2)`, this value leaves ~9 % haze at 40 units (the field the player
 * is actually looking across stays clear) and ~50 % at 110 (the mountains read as far off). Squared
 * falloff rather than linear because aerial perspective builds with distance; linear fog reads as a
 * flat curtain hung in front of the scene.
 */
const FOG_DENSITY = 0.0076;

/**
 * Exposure and contrast are nudges, not a grade: the palette is deliberately unchanged (spec §1), so
 * these exist to stop ACES flattening the image, not to restyle it.
 *
 * ACES darkens this scene globally — full-frame mean luminance runs ~20-22% below a fixed
 * reference (no tone mapping, exposure 1.0, contrast 1.0) captured at the `spawn` and `shade`
 * viewpoints. That reference must be captured once and held fixed while exposure is swept; if it's
 * re-captured at each exposure step it moves with the sweep and the comparison is meaningless
 * (measures "what ACES costs at this exposure", not "does it match the pre-ACES scene"). Exposure
 * is the global control that puts the lost brightness back without touching any material colour, so
 * it's the fix, not the material floors. EXPOSURE = 1.7 was chosen this way: it brings mean
 * luminance within about 3% of that fixed reference at both viewpoints (spawn +2.9%, shade +0.7%)
 * with zero blown pixels. Re-measure the same way (full-frame luminance against the fixed
 * reference, camera locked, several settle frames before sampling so the shadow map has converged)
 * before changing either constant.
 */
const EXPOSURE = 1.7;
const CONTRAST = 1.1;

/** Only pixels above this luminance bloom, so the effect finds highlights rather than the whole image. */
const BLOOM_THRESHOLD = 0.85;
/** How much of the blurred highlight is added back. Low: this is a sheen, not a glow. */
const BLOOM_WEIGHT = 0.15;
/** Blur radius in pixels. */
const BLOOM_KERNEL = 32;
/** Resolution the bloom is computed at, as a fraction of the frame. Half-res is the usual trade. */
const BLOOM_SCALE = 0.5;

/** Applies the scene's atmosphere. Call once, after the camera exists. */
export function createAtmosphere(scene: Scene, camera: Camera): void {
  scene.fogMode = Scene.FOGMODE_EXP2;
  scene.fogColor = FOG_COLOR.clone(); // clone: the scene may mutate its copy; the constant must not move
  scene.fogDensity = FOG_DENSITY;

  const pipeline = new DefaultRenderingPipeline('atmosphere', true, scene, [camera]);

  pipeline.imageProcessingEnabled = true;
  pipeline.imageProcessing.toneMappingEnabled = true;
  pipeline.imageProcessing.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
  pipeline.imageProcessing.exposure = EXPOSURE;
  pipeline.imageProcessing.contrast = CONTRAST;

  // Restrained on purpose: a high threshold with a low weight lets only the brightest sky and the
  // sunlit tips of grass bleed. A cohesion pass does not want a glowing field.
  pipeline.bloomEnabled = true;
  pipeline.bloomThreshold = BLOOM_THRESHOLD;
  pipeline.bloomWeight = BLOOM_WEIGHT;
  pipeline.bloomKernel = BLOOM_KERNEL;
  pipeline.bloomScale = BLOOM_SCALE;
  // Everything the pipeline can do that this scene did not ask for. Each one left enabled would cost
  // a render target for an effect nobody wants.
  pipeline.depthOfFieldEnabled = false;
  pipeline.chromaticAberrationEnabled = false;
  pipeline.grainEnabled = false;
  pipeline.sharpenEnabled = false;

  // MSAA on the pipeline's render target. NOT optional: the engine is created with `antialias: true`
  // (hubScene.ts), but that only anti-aliases the default framebuffer, and attaching a pipeline
  // redirects the scene into an offscreen target where it no longer applies. Babylon defaults
  // `samples` to 1, so without this line adding post-processing would silently make the image more
  // aliased than before it — worst on the tree canopies, grass billboards and the mountain ridge,
  // which are the highest-frequency edges in the frame.
  //
  // Measured at the 'across the field' viewpoint: 4x turns hard adjacent-pixel luma steps into
  // gradients (hard edges -3.0 %, soft edges +15.4 %). 8x measured no better (-3.4 % / +15.8 %) for
  // roughly double the cost. The cost of 4x is under 0.4 ms — the medians could not separate it from
  // samples 1 at all — against a 16.7 ms vsync budget.
  pipeline.samples = 4;
  // FXAA would be the cheaper alternative, but MSAA is geometric and this scene's aliasing is almost
  // entirely geometric edges rather than shader aliasing.
  pipeline.fxaaEnabled = false;
}
