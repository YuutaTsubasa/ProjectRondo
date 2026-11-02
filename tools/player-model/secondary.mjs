/**
 * VRM1 node constraints and spring bones are authoring extensions the importer strips. The game
 * drives the subset it supports (roll constraints, sphere/capsule spring colliders) from this
 * receipt data instead; anything else fails conversion rather than silently freezing a part.
 */
export function retainSecondaryMotion(json) {
  const nodes = json.nodes ?? [];
  const nameOf = index => {
    if (!nodes[index]?.name) throw Error(`Secondary motion references unnamed node ${index}`);
    return nodes[index].name;
  };
  const roll = new Map();
  for (const [index, node] of nodes.entries()) {
    const constraint = node.extensions?.VRMC_node_constraint?.constraint;
    if (!constraint) continue;
    const { roll: settings, ...other } = constraint;
    if (!settings || Object.keys(other).length) throw Error(`Unsupported node constraint on ${node.name}`);
    const weight = settings.weight ?? 1; // VRMC_node_constraint 1.0 default
    if (!['X', 'Y', 'Z'].includes(settings.rollAxis) || !(weight >= 0 && weight <= 1)) throw Error(`Invalid roll constraint on ${node.name}`);
    // The source is usually an animated bone, so its rest rotation travels with the receipt.
    roll.set(index, { node: nameOf(index), source: nameOf(settings.source), sourceIndex: settings.source, sourceRest: nodes[settings.source].rotation ?? [0, 0, 0, 1], rollAxis: settings.rollAxis, weight });
  }
  // A constraint reads its source's solved rotation, so sources come first.
  const constraints = [];
  const state = new Map();
  const visit = index => {
    if (state.get(index) === 'done') return;
    if (state.get(index) === 'visiting') throw Error('Node constraint cycle');
    state.set(index, 'visiting');
    const entry = roll.get(index);
    if (roll.has(entry.sourceIndex)) visit(entry.sourceIndex);
    state.set(index, 'done');
    const { sourceIndex, ...retained } = entry;
    constraints.push(retained);
  };
  for (const index of roll.keys()) visit(index);

  const springBone = json.extensions?.VRMC_springBone;
  const colliders = (springBone?.colliders ?? []).map(collider => {
    const { sphere, capsule } = collider.shape ?? {};
    if (!sphere && !capsule) throw Error('Unsupported spring collider shape');
    const shape = sphere ?? capsule;
    return { node: nameOf(collider.node), offset: shape.offset ?? [0, 0, 0], tail: capsule ? capsule.tail : shape.offset ?? [0, 0, 0], radius: shape.radius ?? 0 };
  });
  const springs = (springBone?.springs ?? []).map(spring => {
    if (spring.center !== undefined) throw Error(`Unsupported spring center on ${spring.name}`);
    const joints = spring.joints ?? [];
    if (joints.length < 2) throw Error(`Spring ${spring.name} needs a tail joint`);
    return {
      name: spring.name,
      joints: joints.slice(0, -1).map((joint, i) => {
        const tail = nodes[joints[i + 1].node];
        if (!nodes[joint.node]?.children?.includes(joints[i + 1].node)) throw Error(`Spring ${spring.name} joints must be parent and child`);
        return {
          node: nameOf(joint.node), tail: tail.translation ?? [0, 0, 0],
          stiffness: joint.stiffness ?? 1, gravityPower: joint.gravityPower ?? 0, gravityDir: joint.gravityDir ?? [0, -1, 0],
          dragForce: joint.dragForce ?? 0.5, hitRadius: joint.hitRadius ?? 0,
        };
      }),
      colliders: (spring.colliderGroups ?? []).flatMap(group => springBone.colliderGroups[group].colliders.map(i => colliders[i])),
    };
  });
  return { constraints, springs };
}

