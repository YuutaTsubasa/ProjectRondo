import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTTextureWebP } from '@gltf-transform/extensions';
import { prune } from '@gltf-transform/functions';
import sharp from 'sharp';

/**
 * Game derivative of a member character's VRM. Unlike the player importer there is no retargeting:
 * an NPC keeps its own skeleton and is posed procedurally by the scene. The authoring VRM stays in
 * ProjectVtuber; only this GLB and its receipt enter the repository.
 */
const DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
export const SETTINGS = Object.freeze({ maxTextureSize: 1024, textureFormat: 'webp', textureQuality: 88, morphTargets: 'source', decimation: false, vrmExtensions: 'removed' });
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export async function importNpc(sourcePath, outputPath) {
  const resolvedSource = path.resolve(sourcePath), resolvedOutput = path.resolve(outputPath);
  const sourceBytes = await fs.readFile(resolvedSource);
  const json = JSON.parse(sourceBytes.subarray(20, 20 + sourceBytes.readUInt32LE(12)).toString('utf8'));
  const vrm = json.extensions?.VRMC_vrm;
  if (!vrm) throw Error('Source is not a VRM 1.0 model (VRMC_vrm missing)');
  const humanBones = Object.fromEntries(Object.entries(vrm.humanoid.humanBones).map(([bone, { node }]) => [bone, json.nodes[node].name]));
  // ALL_EXTENSIONS has no VRMC_* readers, so the authoring-only extensions are dropped on read.
  const document = await io.readBinary(sourceBytes);
  const root = document.getRoot();
  for (const name of ['VRMC_vrm', 'VRMC_springBone', 'VRMC_materials_mtoon']) {
    if (root.listExtensionsUsed().some(e => e.extensionName === name)) throw Error(`Unexpected reader for ${name}`);
  }
  const textures = [];
  for (const texture of root.listTextures()) {
    const original = texture.getImage();
    const result = await sharp(original).resize({ width: SETTINGS.maxTextureSize, height: SETTINGS.maxTextureSize, fit: 'inside', withoutEnlargement: true }).webp({ quality: SETTINGS.textureQuality }).toBuffer({ resolveWithObject: true });
    texture.setImage(result.data).setMimeType('image/webp').setURI('');
    textures.push({ name: texture.getName(), width: result.info.width, height: result.info.height });
  }
  document.createExtension(EXTTextureWebP).setRequired(true);
  await document.transform(prune({ keepLeaves: true, keepAttributes: true }));
  const morphTargets = root.listMeshes().flatMap(mesh => (mesh.getExtras()?.targetNames ?? []).map(name => `${mesh.getName()}:${name}`));
  const metadata = { schemaVersion: 1, sourceFile: path.basename(resolvedSource), sourceSha256: sha256(sourceBytes), title: vrm.meta?.name ?? '', humanBones, lookAt: vrm.lookAt ?? null, morphTargets, settings: SETTINGS };
  root.getAsset().extras = { npcModel: metadata };
  const outputBytes = Buffer.from(await io.writeBinary(document));
  const receipt = { ...metadata, outputSha256: sha256(outputBytes), outputBytes: outputBytes.length, textures };
  const receiptPath = resolvedOutput.replace(/\.glb$/i, '') + '.json';
  await fs.writeFile(`${resolvedOutput}.${process.pid}.tmp`, outputBytes);
  await fs.writeFile(`${receiptPath}.${process.pid}.tmp`, JSON.stringify(receipt, null, 2) + '\n');
  await fs.rename(`${resolvedOutput}.${process.pid}.tmp`, resolvedOutput);
  await fs.rename(`${receiptPath}.${process.pid}.tmp`, receiptPath);
  return receipt;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [source, output = path.resolve(DIRECTORY, '../../public/models/ichimoku-gen.glb')] = process.argv.slice(2);
  if (!source) { console.error('usage: node tools/npc-model/import.mjs <model.vrm> [output.glb]'); process.exit(2); }
  const receipt = await importNpc(source, output);
  console.log(`${path.relative(process.cwd(), output)}: ${receipt.outputBytes} bytes, sha256 ${receipt.outputSha256}`);
}
