import { describe, it, expect } from 'vitest';
import { AIR_LIFT_MAX_ANGLE, AIR_LIFT_MAX_FALL_SPEED, solveRoll, stepSpring, springGravity, type Quat, type Vec3 } from '../../src/presentation/babylon/secondaryMotion';

const identity: Quat = [0, 0, 0, 1];
const axisAngle = (axis: Vec3, degrees: number): Quat => {
  const half = (degrees * Math.PI) / 360;
  return [axis[0] * Math.sin(half), axis[1] * Math.sin(half), axis[2] * Math.sin(half), Math.cos(half)];
};
const closeQuat = (a: Quat, b: Quat) => {
  const sign = a[3] * b[3] < 0 ? -1 : 1;
  a.forEach((v, i) => expect(v * sign).toBeCloseTo(b[i]!, 5));
};

describe('VRM roll constraint', () => {
  it('copies only the twist about the roll axis, scaled by weight', () => {
    // Source turns 40 degrees about Z and 30 about X; a Z roll keeps only the 40.
    const source = [axisAngle([0, 0, 1], 40), axisAngle([1, 0, 0], 30)].reduce((a, b) => [
      a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
      a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
      a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
      a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
    ]) as Quat;
    closeQuat(solveRoll(identity, source, identity, 'Z', 1), axisAngle([0, 0, 1], 40));
    closeQuat(solveRoll(identity, axisAngle([1, 0, 0], 50), identity, 'X', 0.3), axisAngle([1, 0, 0], 15));
  });
  it('leaves the destination at rest while the source is at rest', () => {
    const rest = axisAngle([0, 1, 0], 70);
    closeQuat(solveRoll(rest, rest, axisAngle([1, 0, 0], 20), 'Z', 1), axisAngle([1, 0, 0], 20));
  });
  it('expresses the source twist in the destination rest frame', () => {
    // Destination rest is turned 90 degrees about Y, so the source's X twist is its local +Z twist.
    const dstRest = axisAngle([0, 1, 0], 90);
    const solved = solveRoll(identity, axisAngle([1, 0, 0], 30), dstRest, 'Z', 1);
    closeQuat(solved, [dstRest, axisAngle([0, 0, 1], 30)].reduce((a, b) => [
      a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
      a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
      a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
      a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
    ]) as Quat);
  });
});

describe('spring step', () => {
  const base = { head: [0, 0, 0] as Vec3, length: 1, restDirection: [0, -1, 0] as Vec3, stiffness: 0, dragForce: 0.5, gravityDir: [0, -1, 0] as Vec3, gravityPower: 0, hitRadius: 0, colliders: [] };
  it('keeps the tail at bone length from the joint', () => {
    const next = stepSpring({ current: [0.3, -1, 0], previous: [0, -1, 0] }, base, 1 / 60);
    expect(Math.hypot(...next.current)).toBeCloseTo(1, 6);
    expect(next.previous).toEqual([0.3, -1, 0]);
  });
  it('carries momentum reduced by drag and pulls back toward rest by stiffness', () => {
    const swinging = stepSpring({ current: [0.1, -1, 0], previous: [0, -1, 0] }, base, 1 / 60);
    expect(swinging.current[0]).toBeGreaterThan(0.1);
    const settling = stepSpring({ current: [0.5, -0.866, 0], previous: [0.5, -0.866, 0] }, { ...base, stiffness: 2 }, 1 / 60);
    expect(settling.current[0]).toBeLessThan(0.5);
  });
  it('keeps the tail within a maximum angle of its rest direction when one is given', () => {
    const lifted = stepSpring({ current: [0.2, 0.98, 0], previous: [0.2, 0.98, 0] }, { ...base, gravityDir: [0, 1, 0], gravityPower: 5, maxAngle: 50 }, 1 / 60);
    const angle = (Math.acos(-lifted.current[1] / Math.hypot(...lifted.current)) * 180) / Math.PI;
    expect(angle).toBeCloseTo(50, 3);
    expect(Math.hypot(...lifted.current)).toBeCloseTo(1, 6);
  });
  it('pushes the tail out of a capsule collider', () => {
    const thigh = { head: [0.05, 0, 0] as Vec3, tail: [0.05, -2, 0] as Vec3, radius: 0.1 };
    const next = stepSpring({ current: [0.06, -1, 0], previous: [0.06, -1, 0] }, { ...base, hitRadius: 0.02, colliders: [thigh] }, 1 / 60);
    expect(Math.abs(next.current[0] - 0.05)).toBeGreaterThan(0.11);
  });
});

describe('falling air lift', () => {
  const own = { gravityDir: [0, -1, 0] as Vec3, gravityPower: 0.4 };
  it('stops growing at the fall speed it was tuned for, so a long fall does not flip the plates over', () => {
    const capped = springGravity(own, { offGround: true, verticalSpeed: -9 }, 1.5);
    expect(capped.gravityPower).toBeCloseTo(1.5 * AIR_LIFT_MAX_FALL_SPEED, 6);
    expect(springGravity(own, { offGround: true, verticalSpeed: -30 }, 1.5)).toEqual(capped);
  });
  it('turns gravity up in proportion to fall speed only while airborne and falling', () => {
    expect(springGravity(own, { offGround: true, verticalSpeed: -2 }, 1.5)).toEqual({ gravityDir: [0, 1, 0], gravityPower: 3 });
    expect(springGravity(own, { offGround: true, verticalSpeed: 3 }, 1.5)).toEqual(own);
    expect(springGravity(own, { offGround: false, verticalSpeed: -4 }, 1.5)).toEqual(own);
  });
});

import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { TargetCamera } from '@babylonjs/core/Cameras/targetCamera';
import { attachSecondaryMotion, type AirLift } from '../../src/presentation/babylon/secondaryMotion';

describe('side plates on a moving character', () => {
  // A plate hanging 0.34 below a hinge at the hip, tipped out like B01's; the thigh capsule is clear of it.
  const mount = () => {
    const engine = new NullEngine();
    engine.getDeltaTime = () => 1000 / 60;
    const scene = new Scene(engine);
    new TargetCamera('camera', new Vector3(0, 1, -5), scene);
    const root = new TransformNode('root', scene);
    const hips = new TransformNode('Hips', scene); hips.parent = root; hips.position.y = 1;
    const thigh = new TransformNode('UpperLeg.L', scene); thigh.parent = hips; thigh.rotationQuaternion = Quaternion.Identity();
    const plate = new TransformNode('TassetPlate.L', scene); plate.parent = hips; plate.position.x = 0.15; plate.rotationQuaternion = Quaternion.Identity();
    let air: AirLift = { offGround: false, verticalSpeed: 0 };
    attachSecondaryMotion(scene, [root, hips, thigh, plate], {
      constraints: [],
      springs: [{ name: 'Tasset.L', joints: [{ node: 'TassetPlate.L', tail: [0.045, -0.34, 0.027], stiffness: 2, gravityPower: 0.4, gravityDir: [0, -1, 0], dragForce: 0.6, hitRadius: 0.025 }],
        colliders: [{ node: 'UpperLeg.L', offset: [0, 0, 0], tail: [0, -0.4, 0], radius: 0.05 }] }],
    }, () => air, 1.5, root);
    const tilt = () => {
      plate.computeWorldMatrix(true);
      const tail = Vector3.TransformCoordinates(new Vector3(0.045, -0.34, 0.027), plate.getWorldMatrix()).subtract(plate.getAbsolutePosition());
      return (Math.acos(-tail.y / tail.length()) * 180) / Math.PI;
    };
    return { scene, root, tilt, setAir: (next: AirLift) => { air = next; }, dispose: () => engine.dispose() };
  };

  it('hangs still while the character runs, because springs are simulated relative to its root', () => {
    const rig = mount();
    rig.scene.render();
    const rest = rig.tilt();
    for (let i = 0; i < 30; i++) { rig.root.position.z += 8 / 60; rig.scene.render(); }
    expect(Math.abs(rig.tilt() - rest)).toBeLessThan(1.5);
    rig.dispose();
  });
  it('is lifted by the air while falling and drops back on landing', () => {
    const rig = mount();
    rig.scene.render();
    const rest = rig.tilt();
    rig.setAir({ offGround: true, verticalSpeed: -4 });
    for (let i = 0; i < 90; i++) rig.scene.render();
    const lifted = rig.tilt();
    expect(lifted - rest).toBeGreaterThan(20);
    expect(lifted - rest).toBeLessThanOrEqual(AIR_LIFT_MAX_ANGLE + 0.5);
    rig.setAir({ offGround: false, verticalSpeed: 0 });
    for (let i = 0; i < 120; i++) rig.scene.render();
    expect(rig.tilt() - rest).toBeLessThan((lifted - rest) / 2);
    rig.dispose();
  });
});
