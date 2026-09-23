import { afterEach, describe, expect, it } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { applyPlayerMaterials } from '../../src/presentation/babylon/playerMaterials';
import { readPlayerMaterial } from '../../src/presentation/babylon/playerModel';

const metadata = (role: 'head' | 'body') => ({ gltf: { extras: { playerMaterial: {
  role, shadeColorFactor: [0.8, 0.85, 0.9], shadingShiftFactor: -0.2,
  shadingToonyFactor: 0.8, giEqualizationFactor: 0.9,
  outlineWidthFactor: 0.00065, outlineColorFactor: [0.012, 0.008, 0.009],
} } } });
const engine = new NullEngine();
let scene: Scene;
afterEach(() => scene?.dispose());

describe('player material boundary', () => {
  it('rejects absent or malformed metadata instead of guessing head/body from names', () => {
    expect(() => readPlayerMaterial(null)).toThrow(/playerMaterial/);
    const wrong = metadata('head');
    wrong.gltf.extras.playerMaterial.outlineWidthFactor = NaN;
    expect(() => readPlayerMaterial(wrong)).toThrow(/outlineWidthFactor/);
  });

  it('keeps base-color textures alive, preserves their tint, and applies role to shadow reception', () => {
    scene = new Scene(engine);
    const headSource = new PBRMaterial('renamed_head', scene);
    headSource.metadata = metadata('head');
    headSource.albedoColor = new Color3(0.25, 0.5, 0.75);
    const texture = RawTexture.CreateRGBATexture(new Uint8Array([255, 255, 255, 255]), 1, 1, scene);
    headSource.albedoTexture = texture;
    const bodySource = new PBRMaterial('renamed_armor', scene);
    bodySource.metadata = metadata('body');
    const head = new Mesh('arbitrary-1', scene); head.material = headSource;
    const body = new Mesh('arbitrary-2', scene); body.material = bodySource;
    const sibling = new Mesh('arbitrary-3', scene); sibling.material = headSource;
    const receivers = applyPlayerMaterials([head, body, sibling], scene);
    expect(receivers).toEqual([body]);
    expect(head.material).toBe(sibling.material);
    expect(head.material).not.toBe(headSource);
    const material = head.material as import('@babylonjs/core/Materials/standardMaterial').StandardMaterial;
    expect(material.diffuseTexture).toBe(texture);
    expect(scene.textures).toContain(texture);
    expect(material.diffuseColor.equalsWithEpsilon(headSource.albedoColor.toGammaSpace())).toBe(true);
    expect(head.renderOutline).toBe(true);
    expect(body.renderOutline).toBe(true);
  });

  it('validates the entire set before changing any mesh', () => {
    scene = new Scene(engine);
    const source = new PBRMaterial('valid', scene); source.metadata = metadata('head');
    const head = new Mesh('head', scene); head.material = source;
    const bad = new Mesh('body', scene); bad.material = new PBRMaterial('missing', scene);
    expect(() => applyPlayerMaterials([head, bad], scene)).toThrow(/playerMaterial/);
    expect(head.material).toBe(source);
  });
});

it('keeps surface-blend weight separate from opacity and preserves the underlying face texture', () => {
  scene = new Scene(engine);
  const source = new PBRMaterial('surface', scene);
  source.metadata = metadata('head');
  source.metadata.gltf.extras.playerMaterial.surfaceColorBlend = true;
  const texture = RawTexture.CreateRGBATexture(new Uint8Array([240, 210, 190, 255]), 1, 1, scene);
  source.albedoTexture = texture;
  const mesh = new Mesh('face', scene); mesh.material = source; mesh.hasVertexAlpha = true;
  applyPlayerMaterials([mesh], scene);
  expect(mesh.hasVertexAlpha).toBe(false);
  expect(mesh.useVertexColors).toBe(true);
  expect((mesh.material as import('@babylonjs/core/Materials/standardMaterial').StandardMaterial).diffuseTexture).toBe(texture);
  expect(readPlayerMaterial(mesh.material!.metadata).surfaceColorBlend).toBe(true);
  expect(mesh.material!.needAlphaBlendingForMesh(mesh)).toBeFalsy();
  expect(mesh.renderOutline).toBe(false);
});
