import { describe, it, expect } from 'vitest';
import { solveRoll, stepSpring, springGravity, type Quat, type Vec3 } from '../../src/presentation/babylon/secondaryMotion';

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
  it('pushes the tail out of a capsule collider', () => {
    const thigh = { head: [0.05, 0, 0] as Vec3, tail: [0.05, -2, 0] as Vec3, radius: 0.1 };
    const next = stepSpring({ current: [0.06, -1, 0], previous: [0.06, -1, 0] }, { ...base, hitRadius: 0.02, colliders: [thigh] }, 1 / 60);
    expect(Math.abs(next.current[0] - 0.05)).toBeGreaterThan(0.11);
  });
});

describe('falling air lift', () => {
  const own = { gravityDir: [0, -1, 0] as Vec3, gravityPower: 0.4 };
  it('turns gravity up in proportion to fall speed only while airborne and falling', () => {
    expect(springGravity(own, { offGround: true, verticalSpeed: -4 }, 1.5)).toEqual({ gravityDir: [0, 1, 0], gravityPower: 6 });
    expect(springGravity(own, { offGround: true, verticalSpeed: 3 }, 1.5)).toEqual(own);
    expect(springGravity(own, { offGround: false, verticalSpeed: -4 }, 1.5)).toEqual(own);
  });
});
