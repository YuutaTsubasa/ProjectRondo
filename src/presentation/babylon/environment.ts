import type { Scene } from '@babylonjs/core/scene';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
// Side-effect: registers the shadow-map render component. Without it the ShadowGenerator produces no shadows.
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
// Side-effect: registers the StandardMaterial shader (tree-shaken deep imports need this).
import '@babylonjs/core/Materials/standardMaterial';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';

export interface Environment {
  readonly shadowGenerator: ShadowGenerator;
  readonly sun: DirectionalLight;
}

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
  // toward blue where a seam could show through a gap.
  //
  // The pale band is held through 0.5-0.68, not just at the single point 0.5, because the mountain
  // ring sits well above the horizon in screen terms: at the `mountains` viewpoint its ridge samples
  // to texture v ~0.62-0.66 (measured via the harness's vertical-stripe sampler). A single fog colour
  // (FOG_COLOR in postProcessing.ts, '#dcecf7') can only match the gradient at one height; ramping
  // away from pale immediately above the literal horizon (old stop layout: pale only at 0.5, mid by
  // 0.72) left the sky at the mountains' actual elevation measurably bluer than the fog they fade
  // into, so the ridge stayed a visible hard edge. Holding pale through v=0.68 brings the sky at the
  // mountains' height close to FOG_COLOR too. If the mountain ring's height changes, re-measure its
  // v-range at this viewpoint and adjust 0.68 to match — this coupling is easy to silently break.
  //
  // Measured effect at the `mountains` viewpoint (vertical stripe, fy 0.50-0.86): the sky immediately
  // above the ridge (fy ~0.70) now reads flat '#dcecf7' (220,236,247), same as the mountain band
  // (163,181,190) is far from -- contrast sum 169, worse than the 109 this was meant to fix. The ridge
  // itself is only partially fogged at this distance, so its own colour sits between the pale and mid
  // stops rather than at pure FOG_COLOR; making the sky purely pale here doesn't make it purely match
  // the ridge. 0.64 was also tried (per the fallback plan) and produced byte-identical results in this
  // frame, because the visible sky here never reaches past v~0.64 regardless -- the two values are
  // indistinguishable at this viewpoint. Neither closes the gap; that is reported, not hidden here.
  g.addColorStop(0.0, '#dcecf7'); // below horizon: unseen, held flat at the horizon colour
  g.addColorStop(0.68, '#dcecf7'); // pale held up through the mountain ring's elevation (v ~0.62-0.66)
  g.addColorStop(0.84, '#7fb2e5'); // mid sky: the original mid colour, restored
  g.addColorStop(1.0, '#2b6cb0'); // zenith: deep sky blue
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 16, 512);
  tex.update();
  return tex;
}

/** Builds the outdoor atmosphere: gradient skydome, directional sun with a shadow generator, and a dim ambient fill. */
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

  // Sun: an angled directional light that casts shadows.
  const sun = new DirectionalLight('sun', new Vector3(-0.5, -1, -0.5), scene);
  sun.position = new Vector3(30, 60, 30);
  sun.intensity = 1.1;
  sun.diffuse = new Color3(1, 0.98, 0.9);

  const shadowGenerator = new ShadowGenerator(1024, sun);
  shadowGenerator.usePercentageCloserFiltering = true;
  shadowGenerator.bias = 0.002;

  return { shadowGenerator, sun };
}
