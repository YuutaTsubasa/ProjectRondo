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
import { HORIZON_HEX } from './atmosphereColors';

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
  // every stop's blue channel in this file (mid '#7fb2e5' is 229, pale '#dcecf7' is 247), so no stop
  // position can meet it. The deeper cause: at the ring's ~95-unit distance and the current fog
  // density (0.0076 in postProcessing.ts), the exponential-squared fog factor is only ~41%, nowhere
  // near enough to pull the ridge's material colour close to FOG_COLOR; reaching ~80% fog there would
  // need roughly double the density, which would fog the supposedly-clear near field too. So this is
  // not a lever this file can pull -- the candidate fix is the mountain ring's own material colour in
  // terrain.ts (`haze`), moved toward the fog colour, which is a hand-picked art-direction call for a
  // human, not something to change here. Whoever touches the mountain ring's height, distance, or
  // colour next should re-measure this coupling; it is easy to silently break either side of it.
  g.addColorStop(0.0, HORIZON_HEX); // below horizon: unseen, held flat at the horizon colour
  g.addColorStop(0.5, HORIZON_HEX); // horizon: pale, and the fog colour
  g.addColorStop(0.72, '#7fb2e5'); // mid sky: the original mid colour, restored
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
