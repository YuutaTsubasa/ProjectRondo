import type { Scene } from '@babylonjs/core/scene';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';

export type Vec3 = readonly [number, number, number];
/** glTF order [x, y, z, w]; products are Hamilton products, `a ⊗ b` applies b first. */
export type Quat = readonly [number, number, number, number];

/** Receipt form of VRMC_node_constraint roll constraints (see tools/player-model/secondary.mjs). */
export interface RollConstraintSettings {
  readonly node: string;
  readonly source: string;
  /** Source rest rotation from the import; the live node may already be animated when attached. */
  readonly sourceRest: readonly number[];
  readonly rollAxis: 'X' | 'Y' | 'Z';
  readonly weight: number;
}
export interface SpringJointSettings {
  readonly node: string;
  /** Child tail position in the joint's local frame, model units. */
  readonly tail: readonly number[];
  readonly stiffness: number;
  readonly gravityPower: number;
  readonly gravityDir: readonly number[];
  readonly dragForce: number;
  readonly hitRadius: number;
}
export interface SpringColliderSettings {
  readonly node: string;
  readonly offset: readonly number[];
  readonly tail: readonly number[];
  readonly radius: number;
}
export interface SecondaryMotionSettings {
  readonly constraints: readonly RollConstraintSettings[];
  readonly springs: readonly { readonly name: string; readonly joints: readonly SpringJointSettings[]; readonly colliders: readonly SpringColliderSettings[] }[];
}

/** The character's own motion that the springs react to beyond inertia. */
export interface AirLift {
  readonly offGround: boolean;
  /** World units/s, negative while falling. */
  readonly verticalSpeed: number;
}
/**
 * Upward pull per unit of fall speed on springs while falling. ProjectVtuber's three-vrm trial of the
 * B01 side plates read 1.5 as the most natural lift (~48° from a 0.3 m hop); 2 flips them about.
 */
export const AIR_LIFT_WIND = 1.5;
/** Larger frame gaps (tab switches, loading hitches) are simulated as this step, not extrapolated. */
const MAX_STEP = 1 / 30;

const AXES = { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] } as const;
const IDENTITY: Quat = [0, 0, 0, 1];
const mul = (a: Quat, b: Quat): Quat => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
const inv = (q: Quat): Quat => [-q[0], -q[1], -q[2], q[3]];
const rotate = (q: Quat, v: Vec3): Vec3 => mul(mul(q, [v[0], v[1], v[2], 0]), inv(q)).slice(0, 3) as unknown as Vec3;
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a: Vec3): Vec3 => {
  const length = Math.hypot(...a);
  return length > 1e-12 ? scale(a, 1 / length) : [0, -1, 0];
};
/** Shortest rotation taking unit vector `from` onto unit vector `to`. */
function fromTo(from: Vec3, to: Vec3): Quat {
  const d = dot(from, to);
  if (d < -0.999999) {
    const ortho = unit(Math.abs(from[0]) < 0.9 ? [0, -from[2], from[1]] : [-from[2], 0, from[0]]);
    return [ortho[0], ortho[1], ortho[2], 0];
  }
  const c: Vec3 = [from[1] * to[2] - from[2] * to[1], from[2] * to[0] - from[0] * to[2], from[0] * to[1] - from[1] * to[0]];
  const q: Quat = [c[0], c[1], c[2], 1 + d];
  const length = Math.hypot(...q);
  return q.map((v) => v / length) as unknown as Quat;
}
function slerpFromIdentity(q: Quat, t: number): Quat {
  const signed: Quat = q[3] < 0 ? q.map((v) => -v) as unknown as Quat : q;
  const angle = Math.acos(Math.min(1, signed[3]));
  if (angle < 1e-9) return IDENTITY;
  const s = Math.sin(angle * t) / Math.sin(angle);
  return [signed[0] * s, signed[1] * s, signed[2] * s, Math.cos(angle * t)];
}

/**
 * VRMC_node_constraint 1.0 roll, as three-vrm evaluates it: the source's delta from rest, moved into
 * the destination's rest frame, keeps only its twist about the roll axis, scaled by weight.
 */
export function solveRoll(sourceRest: Quat, source: Quat, destinationRest: Quat, rollAxis: 'X' | 'Y' | 'Z', weight: number): Quat {
  const deltaInParent = mul(source, inv(sourceRest));
  const deltaInDestination = mul(mul(inv(destinationRest), deltaInParent), destinationRest);
  const axis = AXES[rollAxis];
  const swing = fromTo(axis, unit(rotate(deltaInDestination, axis)));
  return mul(destinationRest, slerpFromIdentity(mul(inv(swing), deltaInDestination), weight));
}

export interface SpringState { readonly current: Vec3; readonly previous: Vec3 }
export interface SpringStep {
  /** Joint world position this frame. */
  readonly head: Vec3;
  /** World tail distance. */
  readonly length: number;
  /** World direction the joint's rest pose points its tail, under the current parent pose. */
  readonly restDirection: Vec3;
  /** Rest pull and external force, both already scaled to world units per second. */
  readonly stiffness: number;
  readonly dragForce: number;
  readonly gravityDir: Vec3;
  readonly gravityPower: number;
  readonly hitRadius: number;
  readonly colliders: readonly { readonly head: Vec3; readonly tail: Vec3; readonly radius: number }[];
}

/** One VRM 1.0 spring-bone verlet step for a joint's tail, in world space. */
export function stepSpring(state: SpringState, step: SpringStep, dt: number): SpringState {
  let next = add(add(state.current, scale(sub(state.current, state.previous), 1 - step.dragForce)),
    add(scale(step.restDirection, step.stiffness * dt), scale(step.gravityDir, step.gravityPower * dt)));
  const onBone = () => add(step.head, scale(unit(sub(next, step.head)), step.length));
  next = onBone();
  for (const collider of step.colliders) {
    const segment = sub(collider.tail, collider.head);
    const span = dot(segment, segment);
    const t = span > 1e-12 ? Math.min(1, Math.max(0, dot(sub(next, collider.head), segment) / span)) : 0;
    const closest = add(collider.head, scale(segment, t));
    const away = sub(next, closest);
    const reach = collider.radius + step.hitRadius;
    if (dot(away, away) < reach * reach) {
      next = add(closest, scale(unit(away), reach));
      next = onBone();
    }
  }
  return { current: next, previous: state.current };
}

/** While airborne and falling, the springs' gravity turns upward with the fall: air catching them. */
export function springGravity(
  own: { readonly gravityDir: Vec3; readonly gravityPower: number },
  air: AirLift,
  wind: number,
): { gravityDir: Vec3; gravityPower: number } {
  if (!air.offGround || air.verticalSpeed >= 0) return own;
  return { gravityDir: [0, 1, 0], gravityPower: wind * -air.verticalSpeed };
}

const quatOf = (node: TransformNode): Quat => {
  const q = node.rotationQuaternion ?? Quaternion.FromEulerVector(node.rotation);
  return [q.x, q.y, q.z, q.w];
};
const vec = (v: Vector3): Vec3 => [v.x, v.y, v.z];
/** World matrices top-down, so a node read right after its ancestors moved is current. */
function refreshWorld(node: TransformNode): void {
  const chain: TransformNode[] = [];
  for (let n: TransformNode | null = node; n; n = n.parent as TransformNode | null) chain.unshift(n);
  for (const n of chain) n.computeWorldMatrix(true);
}
const worldPoint = (node: TransformNode, local: readonly number[]): Vec3 =>
  vec(Vector3.TransformCoordinates(new Vector3(local[0], local[1], local[2]), node.getWorldMatrix()));
const worldRotation = (node: TransformNode | null): Quat => {
  if (!node) return IDENTITY;
  const q = new Quaternion();
  node.getWorldMatrix().decompose(undefined, q);
  return [q.x, q.y, q.z, q.w];
};

/**
 * Drive the receipt's roll constraints and spring chains on the imported nodes every frame, after the
 * skeletal clips have posed this frame and before skinning reads the nodes. Rest rotations are read
 * here for the constrained and spring nodes, which no clip animates. Returns the unsubscribe.
 */
export function attachSecondaryMotion(
  scene: Scene,
  nodes: readonly TransformNode[],
  settings: SecondaryMotionSettings,
  air: () => AirLift,
  wind = AIR_LIFT_WIND,
): () => void {
  const byName = new Map(nodes.map((node) => [node.name, node]));
  const find = (name: string) => {
    const node = byName.get(name);
    if (!node) throw new Error(`Player model is missing secondary-motion node ${name}`);
    return node;
  };
  const constraints = settings.constraints.map((c) => {
    const node = find(c.node), source = find(c.source);
    return { ...c, node, source, nodeRest: quatOf(node), sourceRest: c.sourceRest as unknown as Quat };
  });
  type Joint = SpringJointSettings & { target: TransformNode; rest: Quat; axis: Vec3; state: SpringState | null };
  const springs = settings.springs.map((spring) => ({
    joints: spring.joints.map((j): Joint => {
      const target = find(j.node);
      return { ...j, target, rest: quatOf(target), axis: unit(j.tail as unknown as Vec3), state: null };
    }),
    colliders: spring.colliders.map((c) => ({ ...c, target: find(c.node) })),
  }));

  const observer = scene.onBeforeRenderObservable.add(() => {
    const dt = Math.min(MAX_STEP, scene.getEngine().getDeltaTime() / 1000);
    for (const c of constraints) {
      const q = solveRoll(c.sourceRest, quatOf(c.source), c.nodeRest, c.rollAxis, c.weight);
      (c.node.rotationQuaternion ??= new Quaternion()).set(q[0], q[1], q[2], q[3]);
    }
    const lift = air();
    for (const spring of springs) {
      for (const joint of spring.joints) {
        // Simulate against the rest pose under the current parent pose; the result replaces it.
        (joint.target.rotationQuaternion ??= new Quaternion()).set(...(joint.rest as [number, number, number, number]));
        refreshWorld(joint.target);
        const head = vec(joint.target.getAbsolutePosition());
        const restTail = worldPoint(joint.target, joint.tail);
        const length = Math.hypot(...sub(restTail, head));
        // The model is scaled to its game height; keep the authored metre-based forces in proportion.
        const unitsPerMetre = length / Math.max(1e-9, Math.hypot(...joint.tail));
        const stale = !joint.state || Math.hypot(...sub(joint.state.current, head)) > 3 * length;
        const state = stale ? { current: restTail, previous: restTail } : joint.state!;
        if (dt <= 0) { joint.state = state; continue; }
        const gravity = springGravity({ gravityDir: joint.gravityDir as unknown as Vec3, gravityPower: joint.gravityPower }, lift, wind);
        const colliders = spring.colliders.map((c) => {
          refreshWorld(c.target);
          return { head: worldPoint(c.target, c.offset), tail: worldPoint(c.target, c.tail), radius: c.radius * unitsPerMetre };
        });
        joint.state = stepSpring(state, {
          head, length, restDirection: unit(sub(restTail, head)),
          stiffness: joint.stiffness * unitsPerMetre, dragForce: joint.dragForce,
          gravityDir: gravity.gravityDir, gravityPower: gravity.gravityPower * unitsPerMetre,
          hitRadius: joint.hitRadius * unitsPerMetre, colliders,
        }, dt);
        // Turn the rest tail direction onto the simulated one, in the joint's local rest frame.
        const restWorld = mul(worldRotation(joint.target.parent as TransformNode | null), joint.rest);
        const to = unit(rotate(inv(restWorld), sub(joint.state.current, head)));
        const q = mul(joint.rest, fromTo(joint.axis, to));
        joint.target.rotationQuaternion!.set(q[0], q[1], q[2], q[3]);
      }
    }
  });
  return () => { scene.onBeforeRenderObservable.remove(observer); };
}
