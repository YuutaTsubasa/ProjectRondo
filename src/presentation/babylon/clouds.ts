import type { Scene } from '@babylonjs/core/scene';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import '@babylonjs/core/Materials/standardMaterial';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { windTime } from './wind';

/** One sky layer: cloud groups drift with the shared, pause-aware wind clock. */
export function createClouds(scene: Scene): void {
  const dome = CreateSphere('clouds', { diameter: 900, segments: 32, sideOrientation: Mesh.BACKSIDE }, scene);
  dome.infiniteDistance = true;
  dome.isPickable = false;
  dome.alphaIndex = 0;
  const mat = new StandardMaterial('cloudMat', scene);
  mat.disableLighting = true;
  mat.backFaceCulling = false;
  mat.fogEnabled = false;
  const tex = cloudTexture(scene);
  mat.emissiveTexture = tex;
  mat.opacityTexture = tex;
  dome.material = mat;
  scene.onBeforeRenderObservable.add(() => { tex.uOffset = (windTime() * 0.0015) % 1; });
}

/** Periodic value noise lets the drifting texture wrap without a seam. */
function cloudNoise(x: number, y: number, period: number): number {
  const ix = Math.floor(x), iy = Math.floor(y);
  const smooth = (v: number) => v * v * (3 - 2 * v);
  const tx = smooth(x - ix), ty = smooth(y - iy);
  const hash = (a: number, b: number) => {
    a = ((a % period) + period) % period;
    let h = Math.imul(a + 71, 374761393) ^ Math.imul(b + 31, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const low = hash(ix, iy) * (1 - tx) + hash(ix + 1, iy) * tx;
  const high = hash(ix, iy + 1) * (1 - tx) + hash(ix + 1, iy + 1) * tx;
  return low * (1 - ty) + high * ty;
}

/** Broken, wind-stretched cloud banks instead of large circular illustration puffs. */
function cloudTexture(scene: Scene): DynamicTexture {
  const width = 1024, height = 512;
  const tex = new DynamicTexture('cloudLayer', { width, height }, scene, true);
  const ctx = tex.getContext();
  const pixels = new ImageData(width, height);
  for (let y = 0; y < height; y++) {
    const band = (y / height - 0.54) / 0.31;
    if (band <= 0 || band >= 1) continue;
    const envelope = Math.pow(Math.sin(band * Math.PI), 0.6);
    for (let x = 0; x < width; x++) {
      const u = x / width;
      const coarse = cloudNoise(u * 8, band * 7, 8);
      const medium = cloudNoise(u * 16, band * 14, 16);
      const fine = cloudNoise(u * 40, band * 32, 40);
      const density = coarse * 0.58 + medium * 0.29 + fine * 0.13;
      const alpha = Math.max(0, Math.min(1, (density - 0.49) * 3.8)) * envelope;
      const i = (y * width + x) * 4;
      const shade = 223 + fine * 23;
      pixels.data[i] = shade;
      pixels.data[i + 1] = shade + 3;
      pixels.data[i + 2] = shade + 4;
      pixels.data[i + 3] = alpha * 170;
    }
  }
  ctx.putImageData(pixels, 0, 0);
  tex.update(true);
  tex.hasAlpha = true;
  tex.wrapU = Texture.WRAP_ADDRESSMODE;
  tex.wrapV = Texture.CLAMP_ADDRESSMODE;
  return tex;
}
