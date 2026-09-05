import type { Scene } from '@babylonjs/core/scene';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
// Side-effect: registers the StandardMaterial shader (tree-shaken deep imports need this).
import '@babylonjs/core/Materials/standardMaterial';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { HDRCubeTexture } from '@babylonjs/core/Materials/Textures/hdrCubeTexture';
import { HORIZON_HEX } from './atmosphereColors';

export interface Environment {
  readonly sun: DirectionalLight;
}

/** How much of the horizon colour the ambient's ground half carries. See the comment at its use. */
const AMBIENT_GROUND_SCALE = 0.3;

/** Cube-map face size the panorama is resampled to for image-based lighting. 128 is plenty: the
 *  environment is only ever seen as a *reflection* on the armour (the skydome is a separate unlit
 *  mesh), and metal reflections are prefiltered/blurred by roughness, so a larger map buys nothing
 *  visible while costing load-time convolution and memory. */
const IBL_FACE_SIZE = 128;

/** Scales the environment's contribution to every PBR material. 1.0 would be the panorama's own baked
 *  radiance; 1.4 is tuned live against the armour mask.
 *
 *  **This doc is the one place the shipped plate's brightness is recorded.** Measured during this
 *  branch's tuning pass on the stylized-knight armour, hide-the-body diff mask (85 687 px), scene
 *  frozen, at `BODY_METALLIC = 1` and `BODY_DIRECT_INTENSITY = 1`: the plate's mean luma is ~117/255,
 *  up from ~113 at IBL 1.0 — matching the pre-IBL brightness the old no-environment workaround reached
 *  — with blown highlights at 0% (1.6 starts clipping them) and ~2% of pixels below luma 30, down from
 *  7.7% pre-IBL.
 *
 *  It says "one place" because there were three, in two files, and they disagreed: this ~117, a second
 *  ~117 on `BODY_DIRECT_INTENSITY`, and a `BODY_METALLIC` note recording the same shipped configuration
 *  as 114.3 — which then justified this 1.4 as compensating for the ~4 luma between them, so the two
 *  numbers were arguing in a circle. None of the three could be re-measured while reconciling them (the
 *  mask measurement needs the scene running), so the pair that agreed is what survives, stated once,
 *  here. Treat it as inherited from that tuning pass rather than independently confirmed.
 *
 *  This is the lever to reach for if the plate reads too hot or too dim — and, for the panorama's own
 *  levels, the only one: `public/env/studio.hdr` is a committed binary with no committed generator (see
 *  `public/env/CREDITS.md`), so it cannot be re-baked brighter or darker. Prefer it over the
 *  per-material `BODY_METALLIC` too, which stays at the physically-correct 1 now that there is an
 *  environment to reflect (see `knight.ts`). The figures move with the model, so re-measure on a
 *  character swap. */
const IBL_INTENSITY = 1.4;

/** A vertical gradient painted on a DynamicTexture for the unlit skydome; stop 1.0 renders at the
 *  dome's zenith and stop 0.0 at its lowest, unseen point (see the comment inside for the measured
 *  evidence — this is the opposite of what the stop-position names would suggest). */
function skyGradientTexture(scene: Scene): DynamicTexture {
  const tex = new DynamicTexture('skyGradient', { width: 16, height: 512 }, scene, false);
  const ctx = tex.getContext();
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  // Stop 1.0 renders at the ZENITH, not the horizon, despite how the direction of travel reads on
  // the page. Measured with a camera at y=30, sampling the centre pixel for a few fixed look
  // directions, on the previous version of this gradient (whose pale colour '#dcecf7' sat at 1.0):
  //   straight up   -> (220,236,247), i.e. exactly the '#dcecf7' stop
  //   45 deg up     -> (178,211,239)
  //   horizontal    -> (134,181,223), far short of the pale stop
  // So the ramp direction on the dome is inverted from what the stop-position names suggest; treat
  // "1.0" as "up" and "0.0" as "down" here, not "1.0 = far/horizon" as elsewhere in this file's fog.
  // The visible sky is only the upper hemisphere (the ground blocks the rest), so the whole visible
  // range lives in stops 0.5-1.0; below 0.5 is unseen and is just held flat so nothing ramps back
  // toward blue where a seam could show through a gap. The horizon stop IS the fog colour -- both read
  // HORIZON_HEX from atmosphereColors.ts, so the two cannot drift apart.
  //
  // The pale band stops at 0.5 — it is NOT widened up through the mountain ring's elevation
  // (the ridge sits at gradient STOP ~0.62-0.66 at the `mountains` viewpoint — stop positions, not
  // texture v; the two run opposite ways, and in texture v the ridge is at ~0.34-0.38), even though
  // that was tried. Holding '#dcecf7' through stop 0.68 was measured to make the ridge MORE visible, not
  // less: contrast between the ridge band and the sky immediately above it went from 109 to 169.
  // The reason is that the ridge's own colour is unreachable by this gradient near its elevation --
  // its blue channel (~190, from `terrain.ts`'s `haze` colour partially blended with fog) sits below
  // every stop the gradient reaches NEAR THE RIDGE'S ELEVATION: across stops 0.62-0.66 the gradient
  // runs blue 237 -> 234, nowhere near 190. (It is not below every stop in the file — the zenith
  // '#2b6cb0' is blue 176, so the ramp does cross 190 somewhere around stop 0.93. That crossing is
  // far above the ridge and cannot be moved down to it without dragging the zenith with it.) The deeper cause: at the ring's ~95-unit distance and the current fog
  // density (0.0076 in postProcessing.ts), the exponential-squared fog factor is only ~41%, nowhere
  // near enough to pull the ridge's material colour close to FOG_COLOR; reaching ~80% fog there would
  // need roughly double the density, which would fog the supposedly-clear near field too. So this is
  // not a lever this file can pull -- the candidate fix is the mountain ring's own material colour in
  // terrain.ts (`haze`), moved toward the fog colour, which is a hand-picked art-direction call for a
  // human, not something to change here. Whoever touches the mountain ring's height, distance, or
  // colour next should re-measure this coupling; it is easy to silently break either side of it.
  g.addColorStop(0.0, HORIZON_HEX); // below horizon: unseen, held flat at the horizon colour
  g.addColorStop(0.5, HORIZON_HEX); // horizon: pale, and the fog colour
  // 0.72: the original mid colour, restored. The position is NOT measured — the visible sky spans
  // stops 0.5 (horizon) to 1.0 (zenith), so this sits a little below that band's midpoint (0.75),
  // keeping the original "mid blue partway up the visible sky" relationship while staying clear of
  // 0.68, which was measured to make the ridge worse. Treat it as inherited, not derived.
  g.addColorStop(0.72, '#7fb2e5'); // mid sky
  g.addColorStop(1.0, '#2b6cb0'); // zenith: deep sky blue
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 16, 512);
  tex.update();
  return tex;
}

/** Builds the outdoor atmosphere: gradient skydome, a directional sun, and a dim ambient fill.
 *  The sun's shadow generator lives in `shadows.ts` — it needs the camera, which does not exist yet. */
export function createEnvironment(scene: Scene): Environment {
  // Skydome: a large inward-facing sphere, unlit, infinitely far so it stays put as the camera moves.
  const sky = CreateSphere('sky', { diameter: 1000, sideOrientation: Mesh.BACKSIDE }, scene);
  sky.infiniteDistance = true;
  sky.isPickable = false;
  const skyMat = new StandardMaterial('skyMat', scene);
  skyMat.backFaceCulling = false;
  skyMat.disableLighting = true;
  skyMat.emissiveTexture = skyGradientTexture(scene);
  // The skydome is 500 units out, so scene fog would render it as a flat sheet of fog colour and
  // throw the gradient away. It is the thing fog fades *into*, not something to fade.
  skyMat.fogEnabled = false;
  sky.material = skyMat;

  // Ambient fill — dim so the sun's shadow stays visible (was intensity 1 as the only light).
  const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), scene);
  ambient.intensity = 0.45;
  // Shadowed surfaces are lit by ambient alone, so tinting the ground half of the hemisphere toward
  // the sky colour is what makes shadows read as sky-blue rather than dead grey. Babylon's hemispheric
  // term is mix(groundColor, diffuseColor, ndl) with ndl = dot(N, lightDir)*0.5 + 0.5 and lightDir
  // (0,1,0), so groundColor's weight is (1 - ndl): it goes to zero for a normal facing straight up and
  // is strongest for a normal facing straight down, scaling with everything in between. The terrain —
  // this scene's principal shadow receiver — has its normals explicitly flipped skyward (terrain.ts),
  // so it takes essentially none of this tint; what it actually tints is the grass/flower cards and any
  // surface not facing straight up. Scaled well below full because groundColor defaults to BLACK: the
  // undimmed #dcecf7 would nearly double the ambient term on those surfaces and brighten them well
  // beyond a subtle tint.
  ambient.groundColor = Color3.FromHexString(HORIZON_HEX).scale(AMBIENT_GROUND_SCALE);

  // Sun: an angled directional light that casts shadows.
  const sun = new DirectionalLight('sun', new Vector3(-0.5, -1, -0.5), scene);
  sun.position = new Vector3(30, 60, 30);
  sun.intensity = 1.1;
  sun.diffuse = new Color3(1, 0.98, 0.9);

  // Image-based lighting. A metal has no diffuse — it can only show what it reflects — so without an
  // environment texture the armour's metallic PBR renders near-black (this scene's long-standing
  // "darker than Tripo3D" complaint; Tripo's viewer lights the model with an HDRI). This is a
  // NEUTRAL studio panorama — strictly greyscale, verified pixel by pixel, so it casts no colour on
  // the steel — and it is what lets `BODY_METALLIC` sit at the physically-correct 1 in `knight.ts`
  // instead of the 0.6 that hid the missing IBL.
  //
  // **It is a committed binary with no committed generator.** Its own RGBE header names
  // `scratchpad/gen_studio_hdr.cjs`, which is not in this repository, not in `.gitignore`, and not on
  // the machine the file was made on. `public/env/CREDITS.md` records everything that is knowable
  // about it, and `tools/env/inspect_studio_hdr.mjs` re-derives those figures from the file so they
  // can be checked rather than taken on trust. Replacing it means authoring a new panorama and
  // re-tuning `IBL_INTENSITY` against it; there is no re-bake path.
  //
  // Only PBR materials read `scene.environmentTexture`; the terrain, sky, water and foliage are all
  // StandardMaterial and are untouched. The only other PBR material, the toon face, opts out with its
  // own `environmentIntensity = 0` (see `knight.ts`) so IBL cannot disturb the hand-lit face.
  //
  // Five of the six positional arguments below only exist to reach `prefilterOnLoad`, which is the
  // one that differs from `HDRCubeTexture`'s own defaults (`noMipmap=false`, `generateHarmonics=true`,
  // `gammaSpace=false`, `onLoad=null`); they are labelled rather than left as a run of bare literals.
  // Set from `onError`, and checked after construction: a synchronous failure would otherwise clear
  // `scene.environmentTexture` before the assignment below puts the dead texture straight back.
  let iblFailed = false;
  const ibl = new HDRCubeTexture(
    '/env/studio.hdr',
    scene,
    IBL_FACE_SIZE,
    /* noMipmap */ false, // default; the roughness mip chain below is built from these mips
    /* generateHarmonics */ true, // default; bakes the diffuse irradiance SH
    /* gammaSpace */ false, // default; RGBE is already linear
    /* prefilterOnLoad */ true, // NOT the default: builds the roughness mip chain, so rough steel reflects a blurred environment
    /* onLoad */ undefined,
    /* onError */ (message, exception) => {
      // Dropping the failed texture is load-bearing, not tidying. `PBRBaseMaterial.isReadyForSubMesh`
      // requires `_getReflectionTexture().isReadyOrNotBlocking()`, and `_getReflectionTexture()` falls
      // back to `scene.environmentTexture` for any material without its own — i.e. every PBR material
      // in this scene. `isReadyOrNotBlocking()` is `!isBlocking || isReady() || loadingError`;
      // `EnvCubeTexture` sets `_isBlocking = true`, `_loadingError` is only ever set by `Texture`
      // (never on the cube path), and the raw-cube URL loader leaves `isReady` false and just calls
      // this callback. So all three terms stay false forever, the material never becomes ready, and
      // `Mesh.render` returns early — the knight, body *and* face, would simply never be drawn. Only
      // the PBR materials are affected; the terrain, sky, water and foliage are StandardMaterial.
      //
      // With the texture cleared the readiness gate is skipped and the knight renders again, but as
      // metal with nothing to reflect: dark, the pre-IBL look that `BODY_METALLIC = 1` gave up on the
      // assumption an environment would always be there. That is a visible degradation, not a
      // fallback, hence the warning.
      iblFailed = true;
      scene.environmentTexture = null;
      console.warn(
        `[environment] studio IBL failed to load — dropped so the PBR materials can still render; the armour will read as dark, unlit metal until it is fixed. ${message ?? ''}`,
        exception,
      );
    },
  );
  if (!iblFailed) scene.environmentTexture = ibl;
  scene.environmentIntensity = IBL_INTENSITY;

  return { sun };
}
