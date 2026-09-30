import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';

// One full left/right stride in world metres. Its phase advances only with patrol travel.
const STRIDE = 1.4;
const STANCE = .52;
const LIFT = .07;
interface Joint {
  node: TransformNode;
  rotation: Quaternion;
  position: Vector3;
}
function worldRotation(node: TransformNode): Quaternion {
  node.computeWorldMatrix(true);
  const rotation = Quaternion.Identity();
  node.getWorldMatrix().decompose(undefined, rotation);
  return rotation;
}

/** Uses the imported rig's measured axes, rather than assuming its bones use XYZ Euler bends. */
export function createPalaceGuardWalk(holder: TransformNode) {
  const nodes = holder.getChildTransformNodes();
  const joint = (name: string): Joint | null => {
    const node = nodes.find(n => n.name.endsWith(name));
    if (!node) return null;
    node.computeWorldMatrix(true);
    return { node, rotation: worldRotation(node), position: node.getAbsolutePosition().clone() };
  };
  const pelvis = joint('DEF-spine');
  const legs = ['L', 'R'].map(side => ({
    hip: joint('DEF-thigh.' + side), knee: joint('DEF-shin.' + side), ankle: joint('DEF-foot.' + side),
    arm: joint('DEF-upper_arm.' + side),
  }));
  if (!pelvis || legs.some(l => !l.hip || !l.knee || !l.ankle)) return null;
  const rig = legs.map(l => {
    const hip = l.hip!, knee = l.knee!, ankle = l.ankle!;
    const upper = knee.position.subtract(hip.position), lower = ankle.position.subtract(knee.position);
    return { hip, knee, ankle, arm: l.arm, upper, lower, a: upper.length(), b: lower.length() };
  });
  let phase = 0;
  const inverse = Matrix.Identity();
  function setRotation(j: Joint, desired: Quaternion, facing: Quaternion) {
    const parent = j.node.parent as TransformNode;
    const parentRotation = worldRotation(parent);
    j.node.rotationQuaternion = parentRotation.conjugate().multiply(facing.multiply(desired)).normalize();
    j.node.computeWorldMatrix(true);
  }
  function aim(j: Joint, from: Vector3, to: Vector3, facing: Quaternion) {
    const turn = Quaternion.Identity();
    Quaternion.FromUnitVectorsToRef(from.normalizeToNew(), to.normalizeToNew(), turn);
    setRotation(j, turn.multiply(j.rotation), facing);
  }
  function pose(distance: number) {
    phase = (phase + Math.max(0, distance) / STRIDE) % 1;
    holder.computeWorldMatrix(true);
    const facing = worldRotation(holder), world = holder.getWorldMatrix();
    // Lower the pelvis enough to reach both grounded feet at the longest stride.
    const pelvisPosition = pelvis!.position.add(new Vector3(0, -.08 + .015 * Math.sin(phase * Math.PI * 2) ** 2, 0));
    const pelvisParent = pelvis!.node.parent as TransformNode;
    pelvisParent.computeWorldMatrix(true); pelvisParent.getWorldMatrix().invertToRef(inverse);
    pelvis!.node.position.copyFrom(Vector3.TransformCoordinates(Vector3.TransformCoordinates(pelvisPosition, world), inverse));
    pelvis!.node.computeWorldMatrix(true);
    holder.getWorldMatrix().invertToRef(inverse);
    rig.forEach((leg, index) => {
      const step = (phase + index * .5) % 1;
      let forward: number, lift = 0;
      if (step <= STANCE) {
        // Constant backward foot travel cancels the holder's forward movement during contact.
        forward = STRIDE * (STANCE / 2 - step);
      } else {
        const swing = (step - STANCE) / (1 - STANCE);
        const smooth = swing * swing * (3 - 2 * swing);
        forward = STRIDE * STANCE * (smooth - .5);
        lift = LIFT * Math.sin(Math.PI * swing) ** 2;
      }
      const target = leg.ankle.position.add(new Vector3(0, lift, forward));
      leg.hip.node.computeWorldMatrix(true);
      const hip = Vector3.TransformCoordinates(leg.hip.node.getAbsolutePosition(), inverse);
      const delta = target.subtract(hip), length = Math.min(delta.length(), leg.a + leg.b - .0001);
      const direction = delta.normalizeToNew();
      const along = (leg.a ** 2 - leg.b ** 2 + length ** 2) / (2 * length);
      // Project the model's forward direction into the bend plane; knees always bend forward.
      const pole = new Vector3(0, 0, 1);
      const bend = pole.subtract(direction.scale(Vector3.Dot(pole, direction))).normalize();
      const knee = hip.add(direction.scale(along)).add(bend.scale(Math.sqrt(Math.max(0, leg.a ** 2 - along ** 2))));
      aim(leg.hip, leg.upper, knee.subtract(hip), facing);
      aim(leg.knee, leg.lower, target.subtract(knee), facing);
      // Preserve the imported boot orientation through stance and low swing clearance.
      setRotation(leg.ankle, leg.ankle.rotation, facing);
      if (leg.arm) {
        const swing = .13 * Math.cos(step * Math.PI * 2);
        setRotation(leg.arm, Quaternion.RotationAxis(Vector3.Right(), swing).multiply(leg.arm.rotation), facing);
      }
    });
  }
  return { pose, reset() { phase = 0; pose(0); } };
}
