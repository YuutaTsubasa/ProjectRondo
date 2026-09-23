import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prepareVrm, validateGameAsset } from './core.mjs';
const directory = path.dirname(fileURLToPath(import.meta.url));
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const arrayBytes = accessor => {
  const array = accessor.getArray();
  return Buffer.from(array.buffer, array.byteOffset, array.byteLength);
};
const [sourcePath, outputPath = path.resolve(directory, '../../public/models/player-v20.glb')] = process.argv.slice(2);
if (!sourcePath) throw Error('Usage: node tools/player-model/verify.mjs <source.vrm> [output.glb]');
const sourceBytes = await fs.readFile(sourcePath);
const input = await io.binaryToJSON(sourceBytes);
const source = await io.readJSON({ json: prepareVrm(input.json).json, resources: input.resources });
const bytes = await fs.readFile(outputPath);
const output = await io.readBinary(bytes);
validateGameAsset((await io.binaryToJSON(bytes)).json);
const receipt = JSON.parse(await fs.readFile(outputPath.replace(/\.glb$/i, '') + '.json', 'utf8'));
assert.equal(createHash('sha256').update(bytes).digest('hex'), receipt.outputSha256);
assert.equal(createHash('sha256').update(sourceBytes).digest('hex'), receipt.sourceSha256);
// Read all original morphs independently of selection and consolidation to catch dropped binds.
const originalJson = structuredClone(input.json);
for (const key of ['extensionsUsed', 'extensionsRequired']) originalJson[key] = (originalJson[key] ?? []).filter(name => !/^VRM/.test(name));
const original = await io.readJSON({ json: originalJson, resources: input.resources });
const originalBinds = input.json.extensions.VRMC_vrm.expressions.preset.blink.morphTargetBinds;
let verifiedBlinkPrimitives = 0;
for (const [meshIndex, mesh] of original.getRoot().listMeshes().entries()) {
  const binds = originalBinds.filter(bind => input.json.nodes[bind.node].mesh === meshIndex);
  const target = output.getRoot().listMeshes().find(m => m.getName() === mesh.getName());
  mesh.listPrimitives().forEach((primitive, i) => {
    const result = target.listPrimitives()[i];
    if (!binds.length) { assert.equal(result.listTargets().length, 0); return; }
    assert.equal(result.listTargets().length, 1);
    const blink = result.listTargets()[0];
    assert.equal(blink.getName(), 'playerBlink');
    const semantics = [...new Set(binds.flatMap(bind => primitive.listTargets()[bind.index].listSemantics()))].sort();
    assert.deepEqual(blink.listSemantics().sort(), semantics);
    for (const semantic of semantics) {
      const actual = blink.getAttribute(semantic).getArray();
      const expected = new Float32Array(actual.length);
      for (let component = 0; component < expected.length; component++) {
        let sum = 0;
        for (const bind of binds) sum += (primitive.listTargets()[bind.index].getAttribute(semantic)?.getArray()[component] ?? 0) * bind.weight;
        expected[component] = sum;
      }
      assert.deepEqual(actual, expected, mesh.getName() + ': closed-eye ' + semantic + ' delta changed');
    }
    verifiedBlinkPrimitives++;
  });
}
assert.equal(verifiedBlinkPrimitives, receipt.blink.primitiveCount);
assert.equal(originalBinds.length, receipt.blink.sourceBindCount);
for (const mesh of source.getRoot().listMeshes()) {
  const target = output.getRoot().listMeshes().find(m => m.getName() === mesh.getName());
  assert(target, `Missing neutral mesh ${mesh.getName()}`);
  assert.equal(mesh.listPrimitives().length, target.listPrimitives().length);
  mesh.listPrimitives().forEach((primitive, i) => {
    const result = target.listPrimitives()[i];
    for (const semantic of primitive.listSemantics()) assert.deepEqual(arrayBytes(primitive.getAttribute(semantic)), arrayBytes(result.getAttribute(semantic)), `${mesh.getName()}: ${semantic} changed`);
    if (primitive.getIndices()) assert.deepEqual(arrayBytes(primitive.getIndices()), arrayBytes(result.getIndices()));
    assert.deepEqual(primitive.getMaterial().getBaseColorFactor(), result.getMaterial().getBaseColorFactor());
  });
}
for (const skin of source.getRoot().listSkins()) {
  const target = output.getRoot().listSkins().find(s => s.getName() === skin.getName());
  assert.deepEqual(arrayBytes(skin.getInverseBindMatrices()), arrayBytes(target.getInverseBindMatrices()));
  assert.deepEqual(skin.listJoints().map(n => n.getName()), target.listJoints().map(n => n.getName()));
}
for (const node of source.getRoot().listNodes()) {
  const target = output.getRoot().listNodes().find(n => n.getName() === node.getName());
  assert(target, `Missing neutral node ${node.getName()}`);
  for (const property of ['getTranslation', 'getRotation', 'getScale']) {
    node[property]().forEach((value, i) => assert(Math.abs(value - target[property]()[i]) < 1e-6, node.getName() + ' rest transform drift'));
  }
}
console.log('PASS: original weighted blink deltas (' + verifiedBlinkPrimitives + ' primitives), neutral geometry, topology, skin weights, bind matrices, joint order, node rest transforms (1e-6 tolerance), base factors and receipt checksum valid');
