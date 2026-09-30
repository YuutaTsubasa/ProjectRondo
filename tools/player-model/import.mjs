import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTTextureWebP } from '@gltf-transform/extensions';

import sharp from 'sharp';
import { blendLipSeam, LIP_SEAM_SETTINGS } from './lipSeam.mjs';
import { applyRelaxedPose, RELAXED_POSE } from './relaxedPose.mjs';
import { prune } from '@gltf-transform/functions';
import { CLIPS, prepareVrm, bakePlayerBlink, validateGameAsset, worldRotations, transferRotation, transferTranslation, inverse, multiply, normalize } from './core.mjs';

const DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const DONOR_PATH = path.join(DIRECTORY, 'animations.glb');
const DEFAULT_OUTPUT = path.resolve(DIRECTORY, '../../public/models/player-v20.glb');
const SETTINGS = Object.freeze({ maxTextureSize: 2048, textureFormat: 'webp', textureQuality: 90, lipSeam: LIP_SEAM_SETTINGS, morphTargets: 'preset-blink-only', decimation: false, quantization: false, retarget: 'rest-world-axes-v1', relaxedPose: RELAXED_POSE });
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const nodeJson = node => ({ name: node.getName(), rotation: node.getRotation(), translation: node.getTranslation(), children: node.listChildren() });
const restFrames = nodes => worldRotations(nodes.map(node => ({ ...nodeJson(node), children: node.listChildren().map(child => nodes.indexOf(child)) })));
const pruneUnused = prune({ keepLeaves: false, keepAttributes: true, keepSolidTextures: true });

/** One-time donor extraction; refuses overwrite to keep updates independent of active game output. */
export async function extractDonor(sourcePath) {
  try { await fs.access(DONOR_PATH); throw Error('Immutable donor already exists'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const bytes = await fs.readFile(sourcePath);
  const document = await io.readBinary(bytes);
  const root = document.getRoot();
  const corrections = root.getAsset().extras?.knightFootCalibration;
  if (corrections?.undoParentPitchDegrees) throw Error('Unsupported donor parent pitch correction');
  for (const correction of corrections?.corrections ?? []) {
    const node = root.listNodes().find(n => n.getName() === correction.name);
    node.setRotation(normalize(multiply(node.getRotation(), inverse(correction.rest.q))));
    for (const animation of root.listAnimations()) {
      for (const channel of animation.listChannels()) {
        if (channel.getTargetNode() !== node || channel.getTargetPath() !== 'rotation') continue;
        const output = channel.getSampler().getOutput();
        const values = output.getArray().slice();
        const undo = inverse(animation.getName() === '0_T-Pose' ? correction.tpose.q : correction.animation.q);
        for (let i = 0; i < values.length; i += 4) values.set(normalize(multiply(Array.from(values.slice(i, i + 4)), undo)), i);
        output.setArray(values);
      }
    }
  }
  for (const animation of root.listAnimations()) {
    if (!CLIPS.includes(animation.getName())) { animation.dispose(); continue; }
    for (const channel of animation.listChannels()) if (channel.getTargetNode().getName() === 'RL_BoneRoot') channel.dispose();
  }
  const retained = new Set();
  const parents = new Map(root.listNodes().flatMap(n => n.listChildren().map(child => [child, n])));
  for (const animation of root.listAnimations()) for (const channel of animation.listChannels()) {
    for (let node = channel.getTargetNode(); node; node = parents.get(node)) retained.add(node);
  }
  for (const node of root.listNodes()) {
    node.setMesh(null).setSkin(null);
    if (!retained.has(node)) node.dispose();
  }
  for (const mesh of root.listMeshes()) mesh.dispose();
  for (const skin of root.listSkins()) skin.dispose();
  for (const material of root.listMaterials()) material.dispose();
  for (const texture of root.listTextures()) texture.dispose();
  for (const extension of root.listExtensionsUsed()) extension.dispose();
  root.getAsset().extras = { playerAnimationDonor: { schemaVersion: 1, sourceSha256: sha256(bytes), sourceFile: path.basename(sourcePath), removedRootRotation: 'RL_BoneRoot', removedFootCalibration: corrections ?? null } };
  await document.transform(pruneUnused);
  const result = await io.writeBinary(document);
  await fs.writeFile(DONOR_PATH, result, { flag: 'wx' });
  return { donorBytes: result.length, donorSha256: sha256(result) };
}

/** Convert VRM1 into an ordinary glTF player with the immutable game's five animation clips. */
export async function importPlayer(sourcePath, outputPath = DEFAULT_OUTPUT) {
  const resolvedSource = await fs.realpath(sourcePath);
  const resolvedOutput = path.resolve(outputPath);
  if (resolvedSource.toLowerCase() === resolvedOutput.toLowerCase() || resolvedOutput.toLowerCase() === DONOR_PATH.toLowerCase()) throw Error('Output must not overwrite source or immutable donor');
  const sourceBytes = await fs.readFile(resolvedSource);
  const source = await io.binaryToJSON(sourceBytes);
  const { json, humanBones, blink } = prepareVrm(source.json);
  const document = await io.readJSON({ json, resources: source.resources });
  const blinkMetadata = bakePlayerBlink(document, blink);
  const donorBytes = await fs.readFile(DONOR_PATH);
  const donor = await io.readBinary(donorBytes);
  const root = document.getRoot();
  const targetNodes = root.listNodes();
  const donorNodes = donor.getRoot().listNodes();
  const sourceFrames = restFrames(donorNodes);
  const targetFrames = restFrames(targetNodes);
  const byName = new Map(targetNodes.map(n => [n.getName(), n]));
  if (byName.size !== targetNodes.length) throw Error('Target node names must be unique');
  const boneMap = Object.fromEntries(Object.entries(humanBones).map(([role, { node }]) => [role, json.nodes[node].name]));
  const mappings = new Map(donorNodes.map(n => {
    const role = n.getName()[0].toLowerCase() + n.getName().slice(1);
    return [n, byName.get(boneMap[role])];
  }));
  const sourceHips = donorNodes.find(n => n.getName() === 'Hips');
  const targetHips = byName.get(boneMap.hips);
  const motionScale = targetHips.getWorldTranslation()[1] / sourceHips.getWorldTranslation()[1];
  if (!Number.isFinite(motionScale) || motionScale <= 0) throw Error('Invalid hips height ratio');
  const buffer = root.listBuffers()[0];
  for (const name of CLIPS) {
    const original = donor.getRoot().listAnimations().find(a => a.getName() === name);
    if (!original) throw Error(`Missing donor ${name}`);
    const animation = document.createAnimation(name);
    for (const channel of original.listChannels()) {
      const sourceNode = channel.getTargetNode();
      const targetNode = mappings.get(sourceNode);
      if (!targetNode) throw Error(`Missing target humanoid role for ${sourceNode.getName()}`);
      const sampler = channel.getSampler();
      if (!['LINEAR', 'STEP'].includes(sampler.getInterpolation())) throw Error('Only LINEAR and STEP donor interpolation supported');
      const channelPath = channel.getTargetPath();
      if (channelPath !== 'rotation' && !(channelPath === 'translation' && sourceNode === sourceHips)) throw Error(`Unsupported donor channel ${sourceNode.getName()}:${channelPath}`);
      const sourceIndex = donorNodes.indexOf(sourceNode);
      const targetIndex = targetNodes.indexOf(targetNode);
      const width = channelPath === 'rotation' ? 4 : 3;
      const array = sampler.getOutput().getArray();
      const values = new Float32Array(array.length);
      for (let i = 0; i < array.length; i += width) {
        const sample = Array.from(array.slice(i, i + width));
        const mapped = channelPath === 'rotation'
          ? transferRotation(sample, sourceNode.getRotation(), sourceFrames.parent[sourceIndex], targetNode.getRotation(), targetFrames.parent[targetIndex])
          : transferTranslation(sample, sourceNode.getTranslation(), targetNode.getTranslation(), motionScale, sourceFrames.parent[sourceIndex], targetFrames.parent[targetIndex]);
        values.set(mapped, i);
      }
      const times = document.createAccessor().setType('SCALAR').setArray(sampler.getInput().getArray().slice()).setBuffer(buffer);
      const output = document.createAccessor().setType(width === 4 ? 'VEC4' : 'VEC3').setArray(values).setBuffer(buffer);
      const converted = document.createAnimationSampler().setInput(times).setOutput(output).setInterpolation(sampler.getInterpolation());
      animation.addSampler(converted).addChannel(document.createAnimationChannel().setTargetNode(targetNode).setTargetPath(channelPath).setSampler(converted));
    }
  }
  await document.transform(pruneUnused);
  applyRelaxedPose(document, boneMap);
  const textures = [];
  for (const texture of root.listTextures()) {
    const original = texture.getImage();
    const result = await sharp(original).resize({ width: SETTINGS.maxTextureSize, height: SETTINGS.maxTextureSize, fit: 'inside', withoutEnlargement: true }).webp({ quality: SETTINGS.textureQuality }).toBuffer({ resolveWithObject: true });
    texture.setImage(result.data).setMimeType('image/webp').setURI('');
    textures.push({ name: texture.getName(), width: result.info.width, height: result.info.height, bytes: result.data.length });
  }
  const lipSeam = await blendLipSeam(document);
  document.createExtension(EXTTextureWebP).setRequired(true);
  const metadata = {
    schemaVersion: 1, hipsNodeName: targetHips.getName(), rootNodeName: 'Root', orientation: 'gltf-positive-z-forward',
    headMaterialNames: root.listMaterials().filter(m => m.getExtras().playerMaterial.role === 'head').map(m => m.getName()),
    clips: CLIPS, sourceSha256: sha256(sourceBytes), donorSha256: sha256(donorBytes), boneMap, motionScale, blink: blinkMetadata, lipSeam, settings: SETTINGS,
  };
  root.getAsset().extras = { playerModel: metadata };
  const outputBytes = await io.writeBinary(document);
  const serialized = await io.binaryToJSON(outputBytes);
  validateGameAsset(serialized.json);
  const verified = await io.readBinary(outputBytes);
  for (const accessor of verified.getRoot().listAccessors()) if (!Array.from(accessor.getArray()).every(Number.isFinite)) throw Error('Nonfinite accessor data');
  for (const animation of verified.getRoot().listAnimations()) for (const channel of animation.listChannels()) {
    const sampler = channel.getSampler();
    const times = sampler.getInput().getArray();
    if (!times.length || times.some((time, i) => time < 0 || (i > 0 && time <= times[i - 1]))) throw Error('Invalid key times');
    if (sampler.getOutput().getCount() !== times.length) throw Error('Mismatched animation sample counts');
  }
  const receipt = { ...metadata, sourceFile: path.basename(resolvedSource), outputSha256: sha256(outputBytes), outputBytes: outputBytes.length, textures, clips: verified.getRoot().listAnimations().map(a => ({ name: a.getName(), durationSeconds: Math.max(...a.listSamplers().map(s => s.getInput().getMax([])[0])), channels: a.listChannels().length })) };
  const receiptPath = resolvedOutput.replace(/\.glb$/i, '') + '.json';
  await fs.mkdir(path.dirname(resolvedOutput), { recursive: true });
  const temporary = `${resolvedOutput}.${process.pid}.tmp`;
  const temporaryReceipt = `${receiptPath}.${process.pid}.tmp`;
  try {
    await fs.writeFile(temporary, outputBytes);
    await fs.writeFile(temporaryReceipt, JSON.stringify(receipt, null, 2) + '\n');
    await fs.rename(temporary, resolvedOutput);
    await fs.rename(temporaryReceipt, receiptPath);
  } finally {
    await fs.rm(temporary, { force: true });
    await fs.rm(temporaryReceipt, { force: true });
  }
  return receipt;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [source, output] = process.argv.slice(2);
  if (!source) throw Error('Usage: node tools/player-model/import.mjs <source.vrm> [output.glb]');
  const result = source === '--extract-donor' ? await extractDonor(output) : await importPlayer(source, output);
  console.log(JSON.stringify(result, null, 2));
}
