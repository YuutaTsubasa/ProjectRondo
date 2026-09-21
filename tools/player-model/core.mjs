import { retainBlink, PLAYER_BLINK } from './blink.mjs';
export { bakePlayerBlink } from './blink.mjs';
export const CLIPS = Object.freeze(['Idle', 'Walk', 'Run', 'Jump', 'FlyingKick']);
const IDENTITY = [0, 0, 0, 1];
const BODY_MESH = /^Armor$/i;
const HEAD_MESH = /^(Brow|Face|FaceDetail|Glint|Hair|Iris|Lash|MouthCavity|NeckCap|Sclera|Teeth|Tongue)(\.|$)/i;
const MTOON_DEFAULTS = { shadeColorFactor: [1, 1, 1], shadingShiftFactor: 0, shadingToonyFactor: 0.9, giEqualizationFactor: 0.9, outlineWidthFactor: 0, outlineColorFactor: [0, 0, 0] };
export const multiply = (a, b) => [
  a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],
  a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],
  a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],
  a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2],
];
export const normalize = q => {
  const length = Math.hypot(...q);
  if (!Number.isFinite(length) || length < 1e-10) throw Error('Invalid quaternion');
  return q.map(v => v / length);
};
export const inverse = q => normalize(q).map((v, i) => i === 3 ? v : -v);
const rotate = (v, q) => multiply(multiply(q, [...v, 0]), inverse(q)).slice(0, 3);
/** Carry a local animation delta through the donor and target rest-world axes. */
export function transferRotation(animated, sourceLocalRest, sourceParentRest, targetLocalRest, targetParentRest) {
  const sourceWorldRest = multiply(sourceParentRest, sourceLocalRest);
  const targetWorldRest = multiply(targetParentRest, targetLocalRest);
  return normalize(multiply(multiply(multiply(multiply(inverse(targetParentRest), sourceParentRest), normalize(animated)), inverse(sourceWorldRest)), targetWorldRest));
}
/** Hip translation is a scaled displacement from each rig's own rest position. */
export function transferTranslation(animated, sourceRest, targetRest, scale, sourceParentRest, targetParentRest) {
  const delta = rotate(animated.map((v, i) => (v - sourceRest[i]) * scale), multiply(inverse(targetParentRest), sourceParentRest));
  return targetRest.map((v, i) => v + delta[i]);
}
export function worldRotations(nodes) {
  const parents = nodes.map(() => -1);
  nodes.forEach((n, i) => (n.children ?? []).forEach(child => { parents[child] = i; }));
  const world = [];
  const get = i => world[i] ??= normalize(multiply(parents[i] < 0 ? IDENTITY : get(parents[i]), nodes[i].rotation ?? IDENTITY));
  return { world: nodes.map((_, i) => get(i)), parent: parents.map(i => i < 0 ? IDENTITY : get(i)) };
}
/** Strip authoring VRM data, preserving neutral geometry and selected blink deltas. */
export function prepareVrm(input) {
  const json = structuredClone(input);
  const humanBones = json.extensions?.VRMC_vrm?.humanoid?.humanBones;
  if (!humanBones?.hips || !humanBones?.head) throw Error('Expected VRM 1 humanoid hips and head');
  const roles = new Map();
  for (const node of json.nodes) {
    if (node.mesh === undefined) continue;
    const role = BODY_MESH.test(node.name) ? 'body' : HEAD_MESH.test(node.name) ? 'head' : null;
    if (!role) throw Error(`Unclassified mesh ${node.name}; update the explicit material role policy`);
    for (const primitive of json.meshes[node.mesh].primitives) {
      const previous = roles.get(primitive.material);
      if (previous && previous !== role) throw Error('Material shared between head and body');
      roles.set(primitive.material, role);
    }
  }
  for (const [i, material] of json.materials.entries()) {
    const mtoon = material.extensions?.VRMC_materials_mtoon;
    if (!mtoon || !roles.has(i)) throw Error(`Missing MToon or role for ${material.name}`);
    const baseTexture = material.pbrMetallicRoughness?.baseColorTexture;
    const unsupported = (mtoon.parametricRimColorFactor ?? []).some(v => v !== 0)
      || ['uvAnimationRotationSpeedFactor', 'uvAnimationScrollXSpeedFactor', 'uvAnimationScrollYSpeedFactor'].some(k => (mtoon[k] ?? 0) !== 0)
      || mtoon.shadingShiftTexture || mtoon.matcapTexture || mtoon.rimMultiplyTexture
      || (mtoon.shadeMultiplyTexture && JSON.stringify(mtoon.shadeMultiplyTexture) !== JSON.stringify(baseTexture))
      || !['none', 'worldCoordinates'].includes(mtoon.outlineWidthMode ?? 'none')
      || (material.alphaMode ?? 'OPAQUE') !== 'OPAQUE';
    if (unsupported) throw Error(`Unsupported MToon effect in ${material.name}`);
    material.extras = { ...material.extras, playerMaterial: { role: roles.get(i), ...Object.fromEntries(Object.entries(MTOON_DEFAULTS).map(([k, fallback]) => [k, mtoon[k] ?? fallback])) } };
  }
  const blink = retainBlink(json);
  const strip = object => {
    if (!object || typeof object !== 'object') return;
    if (object.extensions) {
      for (const key of Object.keys(object.extensions)) if (/^VRM/.test(key)) delete object.extensions[key];
      if (!Object.keys(object.extensions).length) delete object.extensions;
    }
    for (const value of Object.values(object)) strip(value);
  };
  strip(json);
  for (const key of ['extensionsUsed', 'extensionsRequired']) json[key] = (json[key] ?? []).filter(name => !/^VRM/.test(name));
  for (const node of json.nodes) {
    if ((node.weights ?? []).some(w => w !== 0)) throw Error('Nonneutral node morph weights');
    delete node.weights;
  }
  delete json.animations;
  return { json, humanBones, blink };
}
/** Validate contract and references on the serialized glTF, before publishing it. */
export function validateGameAsset(json) {
  for (const name of CLIPS) {
    const clips = (json.animations ?? []).filter(a => a.name === name);
    if (clips.length !== 1 || !clips[0].channels.length) throw Error(`Missing or duplicate clip ${name}`);
  }
  const finite = object => {
    if (typeof object === 'number' && !Number.isFinite(object)) throw Error('Nonfinite transform/data');
    if (object && typeof object === 'object') Object.values(object).forEach(finite);
  };
  finite(json);
  for (const node of json.nodes) {
    if (node.mesh !== undefined && !json.meshes[node.mesh]) throw Error('Invalid mesh reference');
    if (node.skin !== undefined && !json.skins[node.skin]) throw Error('Invalid skin reference');
    for (const child of node.children ?? []) if (!json.nodes[child]) throw Error('Invalid child reference');
  }
  for (const skin of json.skins ?? []) {
    for (const joint of skin.joints) if (!json.nodes[joint]) throw Error('Invalid joint reference');
    if (!json.accessors[skin.inverseBindMatrices]) throw Error('Missing inverse bind matrices');
  }
  for (const animation of json.animations) for (const channel of animation.channels) {
    if (!json.nodes[channel.target.node]) throw Error('Invalid animation target');
    const sampler = animation.samplers[channel.sampler];
    if (!sampler || !json.accessors[sampler.input] || !json.accessors[sampler.output]) throw Error('Invalid animation sampler');
  }
  for (const mesh of json.meshes ?? []) for (const primitive of mesh.primitives) {
    if (primitive.targets?.length) {
      if (primitive.targets.length !== 1 || !Object.keys(primitive.targets[0]).length || JSON.stringify(mesh.extras?.targetNames) !== JSON.stringify([PLAYER_BLINK]) || (mesh.weights ?? []).some(w => w !== 0)) throw Error('Game derivative must contain only neutral playerBlink morphs');
      for (const [semantic, index] of Object.entries(primitive.targets[0])) {
        const accessor = json.accessors[index];
        if (!['POSITION', 'NORMAL', 'TANGENT'].includes(semantic) || !accessor || accessor.type !== 'VEC3' || accessor.componentType !== 5126 || accessor.count !== json.accessors[primitive.attributes[semantic]]?.count) throw Error('Invalid playerBlink accessor');
      }
    }
    for (const accessor of Object.values(primitive.attributes)) if (!json.accessors[accessor]) throw Error('Invalid attribute accessor');
    if (primitive.indices !== undefined && !json.accessors[primitive.indices]) throw Error('Invalid indices accessor');
    if (!json.materials[primitive.material]?.extras?.playerMaterial) throw Error('Missing player material metadata');
  }
  if (!(json.meshes ?? []).some(mesh => mesh.primitives.some(p => p.targets?.length))) throw Error('Missing playerBlink morphs');
  if (json.nodes.some(node => (node.weights ?? []).some(w => w !== 0))) throw Error('Nonneutral playerBlink node weights');
  if (JSON.stringify(json.extensionsUsed ?? []).includes('VRM')) throw Error('Unsupported VRM extension remains');
}
