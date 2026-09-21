import { describe, expect, it } from 'vitest';
import { Document, NodeIO } from '@gltf-transform/core';
import { readFileSync } from 'node:fs';
import { prepareVrm, validateGameAsset } from '../../tools/player-model/core.mjs';
import * as blinkTools from '../../tools/player-model/core.mjs';

function fixture() {
  return {
    asset: { version: '2.0' },
    extensions: { VRMC_vrm: { humanoid: { humanBones: { hips: { node: 0 }, head: { node: 0 } } }, expressions: { preset: { blink: { morphTargetBinds: [{ node: 0, index: 0, weight: 0.5 }, { node: 0, index: 2, weight: 0.25 }] } } } } },
    nodes: [{ name: 'Face', mesh: 0 }],
    meshes: [{ weights: [0, 0, 0], primitives: [{ attributes: { POSITION: 0, NORMAL: 0, TANGENT: 4 }, material: 0, targets: [{ POSITION: 1, NORMAL: 2 }, { POSITION: 2 }, { POSITION: 3, TANGENT: 1 }] }] }],
    accessors: Array.from({ length: 5 }, (_, i) => ({ componentType: 5126, type: i === 4 ? 'VEC4' : 'VEC3', count: 1 })),
    materials: [{ name: 'Skin', extensions: { VRMC_materials_mtoon: {} } }],
  };
}

describe('offline player blink retention', () => {
  it('retains only referenced blink targets before resolving accessors without mutating source', () => {
    const input = fixture();
    const result = prepareVrm(input);
    expect(result.json.meshes[0].primitives[0].targets).toEqual([{ POSITION: 1, NORMAL: 2 }, { POSITION: 3, TANGENT: 1 }]);
    expect(input.meshes[0].primitives[0].targets).toHaveLength(3);
    expect(result.blink.bindings.map((bind: any) => [bind.index, bind.weight])).toEqual([[0, 0.5], [1, 0.25]]);
  });
  it.each([
    ['missing', (input: any) => { delete input.extensions.VRMC_vrm.expressions; }],
    ['binary', (input: any) => { input.extensions.VRMC_vrm.expressions.preset.blink.isBinary = true; }],
    ['material', (input: any) => { input.extensions.VRMC_vrm.expressions.preset.blink.materialColorBinds = [{}]; }],
    ['texture', (input: any) => { input.extensions.VRMC_vrm.expressions.preset.blink.textureTransformBinds = [{}]; }],
    ['node', (input: any) => { input.extensions.VRMC_vrm.expressions.preset.blink.morphTargetBinds[0].node = 5; }],
    ['index', (input: any) => { input.extensions.VRMC_vrm.expressions.preset.blink.morphTargetBinds[0].index = 8; }],
    ['weight', (input: any) => { input.extensions.VRMC_vrm.expressions.preset.blink.morphTargetBinds[0].weight = NaN; }],
    ['semantic', (input: any) => { input.meshes[0].primitives[0].targets[0] = { COLOR_0: 1 }; }],
  ])('rejects %s blink data clearly', (_, mutate) => {
    const input = fixture(); mutate(input);
    expect(() => prepareVrm(input)).toThrow(/blink/i);
  });
  it('combines weighted POSITION, NORMAL and TANGENT deltas into one synchronously named target', async () => {
    const document = new Document();
    const buffer = document.createBuffer();
    const accessor = (values: number[]) => document.createAccessor().setType('VEC3').setArray(new Float32Array(values)).setBuffer(buffer);
    const neutral = accessor([10, 20, 30]);
    const first = document.createPrimitiveTarget('blinkLeft').setAttribute('POSITION', accessor([2, -4, 6])).setAttribute('NORMAL', accessor([1, 2, 3]));
    const second = document.createPrimitiveTarget('blinkRight').setAttribute('POSITION', accessor([-4, 8, 4])).setAttribute('TANGENT', accessor([4, 8, 12]));
    const primitive = document.createPrimitive().setAttribute('POSITION', neutral).addTarget(first).addTarget(second);
    const mesh = document.createMesh('Face').addPrimitive(primitive);
    const node = document.createNode('Face').setMesh(mesh);
    document.createScene().addChild(node);
    const blink = prepareVrm(fixture()).blink;
    expect(blinkTools.bakePlayerBlink).toBeTypeOf('function');
    const summary = blinkTools.bakePlayerBlink(document, blink);
    expect(primitive.listTargets()).toHaveLength(1);
    const target = primitive.listTargets()[0]!;
    expect(target.getName()).toBe('playerBlink');
    expect(Array.from(target.getAttribute('POSITION')!.getArray()!)).toEqual([0, 0, 4]);
    expect(Array.from(target.getAttribute('NORMAL')!.getArray()!)).toEqual([0.5, 1, 1.5]);
    expect(Array.from(target.getAttribute('TANGENT')!.getArray()!)).toEqual([1, 2, 3]);
    expect(Array.from(neutral.getArray()!)).toEqual([10, 20, 30]);
    expect(mesh.getWeights()).toEqual([0]);
    expect(summary).toMatchObject({ targetName: 'playerBlink', sourceBindCount: 2, primitiveCount: 1 });
    const json = (await new NodeIO().writeJSON(document)).json;
    expect(json.meshes![0]!.extras!.targetNames).toEqual(['playerBlink']);
  });
});


it('expands sparse source blink deltas before baking', async () => {
  const json: any = fixture();
  const data = new Uint8Array(28);
  new Float32Array(data.buffer, 0, 3).set([10, 20, 30]);
  data[12] = 0;
  new Float32Array(data.buffer, 16, 3).set([2, -4, 6]);
  json.buffers = [{ uri: 'fixture.bin', byteLength: data.length }];
  json.bufferViews = [{ buffer: 0, byteOffset: 0, byteLength: 12 }, { buffer: 0, byteOffset: 12, byteLength: 1 }, { buffer: 0, byteOffset: 16, byteLength: 12 }];
  json.accessors = [{ bufferView: 0, componentType: 5126, type: 'VEC3', count: 1 }, { componentType: 5126, type: 'VEC3', count: 1, sparse: { count: 1, indices: { bufferView: 1, componentType: 5121 }, values: { bufferView: 2 } } }];
  json.meshes[0].primitives = [{ attributes: { POSITION: 0 }, material: 0, targets: [{ POSITION: 1 }] }];
  json.meshes[0].weights = [0];
  json.extensions.VRMC_vrm.expressions.preset.blink.morphTargetBinds = [{ node: 0, index: 0, weight: 0.5 }];
  const prepared = prepareVrm(json);
  const document = await new NodeIO().readJSON({ json: prepared.json, resources: { 'fixture.bin': data } });
  blinkTools.bakePlayerBlink(document, prepared.blink);
  expect(Array.from(document.getRoot().listMeshes()[0]!.listPrimitives()[0]!.listTargets()[0]!.getAttribute('POSITION')!.getArray()!)).toEqual([1, -2, 3]);
});

it('rejects an empty named blink target in the published asset', async () => {
  const json = (await new NodeIO().binaryToJSON(readFileSync('public/models/player-v20.glb'))).json;
  const primitive = json.meshes!.flatMap(mesh => mesh.primitives).find(p => p.targets?.length)!;
  primitive.targets = [{}];
  expect(() => validateGameAsset(json)).toThrow(/blink/i);
});
