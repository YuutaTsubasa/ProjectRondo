import { inverse, multiply, normalize } from './core.mjs';

/** V20's straight bind legs and extended fingers need a relaxed gameplay pose after transfer. */
export const RELAXED_POSE = Object.freeze({
  idleLegOutwardDegrees: 4.5,
  gaitLegOutwardDegrees: 6.6,
  gaitToeOutwardDegrees: { Walk: 12, Run: 12 },
  fingerCurlDegrees: [30, 45, 20],
  thumbCurlDegrees: [8, 12, 8],
});
const identity = [0, 0, 0, 1];
const axisAngle = (axis, degrees) => {
  const half = degrees * Math.PI / 360;
  const scale = Math.sin(half) / Math.hypot(...axis);
  return [...axis.map(v => v * scale), Math.cos(half)];
};
// Express a rotation about an authoring-world axis in the bone's parent-rest frame.
const inParent = (rotation, parent) => multiply(multiply(inverse(parent), rotation), parent);

/** Alters animation curves only: bind transforms, geometry, weights and donor stay untouched. */
export function applyRelaxedPose(document, boneMap) {
  const root = document.getRoot(), nodes = root.listNodes();
  const byName = new Map(nodes.map(n => [n.getName(), n]));
  const parents = new Map(nodes.flatMap(n => n.listChildren().map(child => [child, n])));
  const parentRest = node => parents.get(node)?.getWorldRotation() ?? identity;
  for (const [side, sign] of [['left', 1], ['right', -1]]) {
    for (const clipName of ['Idle', 'Walk', 'Run']) {
      const clip = root.listAnimations().find(a => a.getName() === clipName);
      const spread = clipName === 'Idle' ? RELAXED_POSE.idleLegOutwardDegrees : RELAXED_POSE.gaitLegOutwardDegrees;
      // Widen at the hip, then compensate ankle roll and the donor's inward foot heading.
      for (const [part, direction] of [['UpperLeg', 1], ['Foot', -1]]) {
        const node = byName.get(boneMap[side + part]);
        const channel = clip.listChannels().find(c => c.getTargetNode() === node && c.getTargetPath() === 'rotation');
        if (!node || !channel) throw Error(`Missing ${clipName} stance joint: ${side}${part}`);
        let worldDelta = axisAngle([0, 0, 1], sign * direction * spread);
        if (part === 'Foot' && clipName !== 'Idle') {
          worldDelta = multiply(axisAngle([0, 1, 0], sign * RELAXED_POSE.gaitToeOutwardDegrees[clipName]), worldDelta);
        }
        const delta = inParent(worldDelta, parentRest(node));
        const output = channel.getSampler().getOutput();
        const values = output.getArray().slice();
        for (let i = 0; i < values.length; i += 4) values.set(normalize(multiply(delta, Array.from(values.slice(i, i + 4)))), i);
        output.setArray(values);
      }
    }
    for (const finger of ['Index', 'Middle', 'Ring', 'Little', 'Thumb']) {
      const thumb = finger === 'Thumb';
      const segments = thumb ? ['Metacarpal', 'Proximal', 'Distal'] : ['Proximal', 'Intermediate', 'Distal'];
      for (const [index, segment] of segments.entries()) {
        const node = byName.get(boneMap[side + finger + segment]);
        if (!node) continue; // VRM finger joints are optional.
        const axis = thumb ? [1, 0, -sign] : [0, 0, -sign];
        const degrees = (thumb ? RELAXED_POSE.thumbCurlDegrees : RELAXED_POSE.fingerCurlDegrees)[index];
        const posed = normalize(multiply(inParent(axisAngle(axis, degrees), parentRest(node)), node.getRotation()));
        for (const clip of root.listAnimations()) {
          // Future donors may supply authored finger curves; those take precedence.
          if (clip.listChannels().some(c => c.getTargetNode() === node && c.getTargetPath() === 'rotation')) continue;
          const duration = Math.max(...clip.listSamplers().map(s => s.getInput().getMax([])[0]));
          const times = document.createAccessor().setType('SCALAR').setArray(new Float32Array([0, duration])).setBuffer(root.listBuffers()[0]);
          const values = document.createAccessor().setType('VEC4').setArray(new Float32Array([...posed, ...posed])).setBuffer(root.listBuffers()[0]);
          const sampler = document.createAnimationSampler().setInput(times).setOutput(values).setInterpolation('LINEAR');
          clip.addSampler(sampler).addChannel(document.createAnimationChannel().setTargetNode(node).setTargetPath('rotation').setSampler(sampler));
        }
      }
    }
  }
}
