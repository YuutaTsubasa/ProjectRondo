import { describe, it, expect } from 'vitest';
import { transferRotation, transferTranslation, prepareVrm, validateGameAsset } from '../../tools/player-model/core.mjs';
const qx = [Math.SQRT1_2, 0, 0, Math.SQRT1_2];
const qz = [0, 0, Math.SQRT1_2, Math.SQRT1_2];
const identity = [0, 0, 0, 1];
const close = (a: number[], b: number[]) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 6));
describe('player model motion transfer', () => {
  it('maps rest to target rest even when bone axes differ', () => {
    close(transferRotation(qx, qx, identity, qz, identity), qz);
  });
  it('carries a parent-frame turn through a different target parent frame', () => {
    close(transferRotation(qx, identity, identity, identity, qz), [0, -Math.SQRT1_2, 0, Math.SQRT1_2]);
  });
  it('preserves identity-rig animation and quaternion normalization', () => {
    close(transferRotation(qx.map(v => v * 2), identity, identity, identity, identity), qx);
  });
  it('scales displacement from rest, not the absolute hip position', () => {
    close(transferTranslation([1, 0.7, 0], [0, 0.5, 0], [0, 1, -0.1], 2, identity, identity), [2, 1.4, -0.1]);
  });
  it('rotates hip displacement between parent frames', () => {
    close(transferTranslation([1, 0, 0], [0, 0, 0], [0, 2, 0], 1, qz, identity), [0, 3, 0]);
  });
});
describe('player asset contract', () => {
  it('rejects missing VRM humanoid data before conversion', () => {
    expect(() => prepareVrm({ nodes: [], materials: [], meshes: [] })).toThrow(/VRM 1/);
  });
  it('rejects missing clips instead of publishing a static player', () => {
    expect(() => validateGameAsset({ animations: [] })).toThrow(/Idle/);
  });
});

const vrmFixture = () => ({
  extensions: { VRMC_vrm: { humanoid: { humanBones: { hips: { node: 0 }, head: { node: 0 } } }, expressions: { preset: { blink: { morphTargetBinds: [{ node: 0, index: 0, weight: 1 }] } } } } },
  extensionsUsed: ['VRMC_vrm', 'VRMC_materials_mtoon'],
  nodes: [{ name: 'Face', mesh: 0 }],
  accessors: [{ type: 'VEC3', componentType: 5126, count: 1 }],
  meshes: [{ weights: [0], primitives: [{ attributes: { POSITION: 0 }, material: 0, targets: [{ POSITION: 0 }] }] }],
  materials: [{ name: 'Skin', pbrMetallicRoughness: { baseColorFactor: [0.5, 0.6, 0.7, 1] }, extensions: { VRMC_materials_mtoon: {} } }],
});
describe('VRM game derivative preparation', () => {
  it('preserves base color, annotates head role and strips authoring-only extensions while retaining blink', () => {
    const input = vrmFixture();
    const { json } = prepareVrm(input);
    expect(json.materials[0].pbrMetallicRoughness.baseColorFactor).toEqual([0.5, 0.6, 0.7, 1]);
    expect(json.materials[0].extras.playerMaterial).toEqual({ role: 'head', shadeColorFactor: [1, 1, 1], shadingShiftFactor: 0, shadingToonyFactor: 0.9, giEqualizationFactor: 0.9, outlineWidthFactor: 0, outlineColorFactor: [0, 0, 0] });
    expect(json.meshes[0].primitives[0].targets).toEqual([{ POSITION: 0 }]);
    expect(json.extensionsUsed).toEqual([]);
    expect(input.meshes[0].primitives[0].targets).toHaveLength(1);
  });
  it('rejects active unsupported MToon effects', () => {
    const input = vrmFixture();
    Object.assign(input.materials[0].extensions.VRMC_materials_mtoon, { parametricRimColorFactor: [1, 0, 0] });
    expect(() => prepareVrm(input)).toThrow(/Unsupported MToon/);
  });
  it('rejects unknown mesh roles rather than classifying future body pieces as head', () => {
    const input = vrmFixture();
    input.nodes[0].name = 'NewCape';
    expect(() => prepareVrm(input)).toThrow(/Unclassified mesh/);
  });
});

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
it('ships a checksummed derivative with the immutable donor key times and all humanoid targets', async () => {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const bytes = readFileSync('public/models/player-v20.glb');
  const receipt = JSON.parse(readFileSync('public/models/player-v20.json', 'utf8'));
  const donorBytes = readFileSync('tools/player-model/animations.glb');
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(receipt.outputSha256);
  expect(createHash('sha256').update(donorBytes).digest('hex')).toBe(receipt.donorSha256);
  const donor = (await io.readBinary(donorBytes)).getRoot();
  const output = (await io.readBinary(bytes)).getRoot();
  expect(donor.listMeshes()).toHaveLength(0);
  expect(donor.listTextures()).toHaveLength(0);
  expect(output.listAnimations().map(a => a.getName()).sort()).toEqual(['FlyingKick', 'Idle', 'Jump', 'Run', 'Walk']);
  for (const clip of donor.listAnimations()) {
    const target = output.listAnimations().find(a => a.getName() === clip.getName())!;
    for (const channel of clip.listChannels()) {
      const sourceName = channel.getTargetNode()!.getName();
      const role = sourceName[0]!.toLowerCase() + sourceName.slice(1);
      const mapped = target.listChannels().find(c => c.getTargetNode()!.getName() === receipt.boneMap[role] && c.getTargetPath() === channel.getTargetPath())!;
      expect(Array.from(mapped.getSampler()!.getInput()!.getArray()!)).toEqual(Array.from(channel.getSampler()!.getInput()!.getArray()!));
      expect(Array.from(mapped.getSampler()!.getOutput()!.getArray()!).every(Number.isFinite)).toBe(true);
    }
  }
  for (const texture of output.listTextures()) {
    expect(texture.getMimeType()).toBe('image/webp');
    expect(Math.max(...texture.getSize()!)).toBeLessThanOrEqual(2048);
  }
});
