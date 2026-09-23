import type { Scene } from '@babylonjs/core/scene';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Layer } from '@babylonjs/core/Layers/layer';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';

/** Only the infinitely distant sky is an image; all palace silhouettes remain modeled geometry. */
export function createPalaceSky(scene: Scene) {
  const sky = new Layer('palaceCloudSky', '/palace/white_palace_sky.webp', scene, true, new Color4(.92,.96,1,1));
  sky.convertToLinearSpace = true;
  // Keep the gradient as a fallback until the image is available.
  const gradient = scene.getMeshByName('sky');
  sky.onBeforeRenderObservable.add(() => {
    if (sky.texture?.isReady()) gradient?.setEnabled(false);
    const aspect = scene.getEngine().getAspectRatio(scene.activeCamera!);
    const sourceAspect = 1920/1080;
    // Crop the texture rather than scaling both clip-space geometry and UVs.
    const texture = sky.texture as Texture;
    texture.uScale = Math.min(1, aspect / sourceAspect);
    texture.vScale = Math.min(1, sourceAspect / aspect);
    texture.uOffset = (1 - texture.uScale) / 2;
    texture.vOffset = (1 - texture.vScale) / 2;
  });
  scene.fogColor = Color3.FromHexString('#b4d5e8');
  return sky;
}
