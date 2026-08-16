// src/presentation/babylon/environment.ts
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

/** A vertical zenith→horizon gradient painted on a DynamicTexture, for the unlit skydome. */
function skyGradientTexture(scene: Scene): DynamicTexture {
  const tex = new DynamicTexture('skyGradient', { width: 16, height: 512 }, scene, false);
  const ctx = tex.getContext();
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0.0, '#2b6cb0'); // zenith: deep sky blue
  g.addColorStop(0.5, '#7fb2e5'); // mid sky
  g.addColorStop(1.0, '#dcecf7'); // horizon: pale
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
