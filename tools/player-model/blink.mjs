export const PLAYER_BLINK = 'playerBlink';
const SEMANTICS = ['POSITION', 'NORMAL', 'TANGENT'];

/** Validate VRM1's continuous blink and retain only the source targets it references. */
export function retainBlink(json) {
  const expression = json.extensions?.VRMC_vrm?.expressions?.preset?.blink;
  if (!expression?.morphTargetBinds?.length) throw Error('Missing VRM1 preset blink morph bindings');
  if (expression.isBinary || expression.materialColorBinds?.length || expression.textureTransformBinds?.length) throw Error('Unsupported blink: requires continuous morph-only bindings');
  const bindings = expression.morphTargetBinds.map(bind => {
    const node = Number.isInteger(bind.node) && json.nodes[bind.node];
    const mesh = node && json.meshes[node.mesh];
    if (!mesh || !Number.isInteger(bind.index) || bind.index < 0 || !Number.isFinite(bind.weight) || bind.weight < 0 || bind.weight > 1) throw Error('Invalid blink node, target index or weight');
    if (json.nodes.filter(n => n.mesh === node.mesh).length !== 1) throw Error('Unsupported blink on instanced mesh');
    for (const primitive of mesh.primitives) {
      const target = primitive.targets?.[bind.index];
      if (!target || !Object.keys(target).length) throw Error(`Missing blink target on ${node.name}`);
      for (const [semantic, index] of Object.entries(target)) {
        const accessor = json.accessors?.[index];
        const base = json.accessors?.[primitive.attributes?.[semantic]];
        if (!SEMANTICS.includes(semantic) || !accessor || !base || accessor.type !== 'VEC3' || accessor.componentType !== 5126 || accessor.normalized || accessor.count !== base.count) throw Error(`Invalid blink ${semantic} accessor on ${node.name}`);
      }
    }
    return { nodeName: node.name, mesh: node.mesh, index: bind.index, weight: bind.weight };
  });
  if (!bindings.some(bind => bind.weight > 0)) throw Error('Blink weights are all zero');
  for (const [index, mesh] of json.meshes.entries()) {
    const selected = [...new Set(bindings.filter(bind => bind.mesh === index).map(bind => bind.index))].sort((a, b) => a - b);
    if ((mesh.weights ?? []).some(w => w !== 0)) throw Error('Nonneutral default morph weights');
    delete mesh.weights;
    delete mesh.extras?.targetNames;
    for (const primitive of mesh.primitives) {
      if (selected.length) primitive.targets = selected.map(i => primitive.targets[i]);
      else delete primitive.targets;
    }
    for (const bind of bindings.filter(bind => bind.mesh === index)) bind.index = selected.indexOf(bind.index);
  }
  return { bindings };
}

/** NodeIO expands sparse accessors; sum source deltas before dropping all authoring targets. */
export function bakePlayerBlink(document, blink) {
  const root = document.getRoot();
  let primitiveCount = 0;
  const nodeNames = [];
  for (const [meshIndex, mesh] of root.listMeshes().entries()) {
    const bindings = blink.bindings.filter(bind => bind.mesh === meshIndex);
    if (!bindings.length) continue;
    nodeNames.push(bindings[0].nodeName);
    mesh.setWeights([0]);
    for (const primitive of mesh.listPrimitives()) {
      const targets = primitive.listTargets();
      const combined = document.createPrimitiveTarget(PLAYER_BLINK);
      for (const semantic of SEMANTICS) {
        const contributing = bindings.filter(bind => targets[bind.index]?.getAttribute(semantic));
        if (!contributing.length) continue;
        const count = targets[contributing[0].index].getAttribute(semantic).getCount();
        const values = new Float32Array(count * 3);
        // Accumulate in double precision, then round once to the glTF float payload.
        for (let i = 0; i < values.length; i++) {
          let sum = 0;
          for (const bind of contributing) sum += targets[bind.index].getAttribute(semantic).getArray()[i] * bind.weight;
          values[i] = sum;
        }
        if (!values.every(Number.isFinite)) throw Error('Nonfinite blink deltas');
        combined.setAttribute(semantic, document.createAccessor().setType('VEC3').setArray(values).setBuffer(root.listBuffers()[0]));
      }
      for (const target of targets) primitive.removeTarget(target);
      primitive.addTarget(combined);
      primitiveCount++;
    }
  }
  return { targetName: PLAYER_BLINK, sourcePreset: 'blink', sourceBindCount: blink.bindings.length, primitiveCount, nodeNames };
}
