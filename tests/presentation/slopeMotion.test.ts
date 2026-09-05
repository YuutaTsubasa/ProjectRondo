import { describe, it, expect } from 'vitest';
import { alignToSurface, solverVelocity } from '../../src/presentation/babylon/slopeMotion';
import { vec3 } from '../../src/domain/math/vec3';

const P = 6;
const radians = (deg: number) => (deg * Math.PI) / 180;
/** Unit normal of a surface that rises toward +X at `deg` degrees. */
const slopeNormal = (deg: number) => vec3(-Math.sin(radians(deg)), Math.cos(radians(deg)), 0);
const planarLength = (v: { x: number; z: number }) => Math.hypot(v.x, v.z);

describe('alignToSurface', () => {
  it('leaves a horizontal velocity alone on level ground', () => {
    const r = alignToSurface(vec3(8, 0, 0), vec3(0, 1, 0));
    expect(r.x).toBeCloseTo(8, P);
    expect(r.y).toBeCloseTo(0, P);
    expect(r.z).toBeCloseTo(0, P);
  });

  it('adds the climb rate the slope demands', () => {
    const r = alignToSurface(vec3(8, 0, 0), slopeNormal(30));
    expect(r.y).toBeCloseTo(8 * Math.tan(radians(30)), P);
  });

  it('descends when heading downhill', () => {
    const r = alignToSurface(vec3(-8, 0, 0), slopeNormal(30));
    expect(r.y).toBeCloseTo(-8 * Math.tan(radians(30)), P);
  });

  it('never bends the heading — this is what stopped running straight at a hill sliding sideways', () => {
    for (const deg of [5, 15, 25, 35]) {
      const r = alignToSurface(vec3(6, 0, 6), slopeNormal(deg));
      expect(r.x).toBeCloseTo(6, P);
      expect(r.z).toBeCloseTo(6, P);
    }
  });

  it('never shrinks the horizontal speed — this is what stopped the slope bleeding speed away', () => {
    for (const deg of [5, 15, 25, 35]) {
      expect(planarLength(alignToSurface(vec3(8, 0, 0), slopeNormal(deg)))).toBeCloseTo(8, P);
    }
  });

  it('leaves a velocity running across the slope level', () => {
    const r = alignToSurface(vec3(0, 0, 8), slopeNormal(30));
    expect(r.y).toBeCloseTo(0, P);
  });

  it('hands a too-steep face over untouched, so it still blocks like a wall', () => {
    const steep = slopeNormal(55);
    expect(alignToSurface(vec3(8, 0, 0), steep)).toEqual(vec3(8, 0, 0));
  });

  it('hands a vertical wall over untouched rather than dividing by a vanishing normal', () => {
    expect(alignToSurface(vec3(8, 0, 0), vec3(-1, 0, 0))).toEqual(vec3(8, 0, 0));
  });

  it('leaves a resting character resting', () => {
    const r = alignToSurface(vec3(0, 0, 0), slopeNormal(20));
    expect(r.x).toBeCloseTo(0, P);
    expect(r.y).toBeCloseTo(0, P);
    expect(r.z).toBeCloseTo(0, P);
  });
});

describe('solverVelocity', () => {
  const SLOPE = slopeNormal(20);

  it('follows the ground on an ordinary grounded frame', () => {
    const r = solverVelocity(vec3(8, 0, 0), SLOPE, { grounded: true, ownsClimb: false });
    expect(r.y).toBeCloseTo(8 * Math.tan(radians(20)), P);
  });

  it('leaves an airborne velocity alone — there is no surface under it to follow', () => {
    expect(solverVelocity(vec3(8, -12, 0), SLOPE, { grounded: false, ownsClimb: false }))
      .toEqual(vec3(8, -12, 0));
  });

  it('lets a jump leave a slope with the speed the domain gave it', () => {
    expect(solverVelocity(vec3(8, 9, 0), SLOPE, { grounded: true, ownsClimb: true }))
      .toEqual(vec3(8, 9, 0));
  });

  // `alignToSurface` REPLACES velocity.y. A bounce is purely vertical, so its `intoSlope` is 0 and the
  // substitution handed the solver (0, 0, 0): the crystal flashed and the knight restarted its jump
  // clip for a rise Havok was never asked to make. Reachable whenever the probe finds floor under the
  // crystal, which grounds the contact on that very frame.
  it('keeps a homing bounce whole on an arrival frame the probe called SUPPORTED', () => {
    expect(solverVelocity(vec3(0, 14, 0), SLOPE, { grounded: true, ownsClimb: true }))
      .toEqual(vec3(0, 14, 0));
  });

  // The same substitution flattened a dash climbing toward an overhead crystal into a horizontal
  // skim, for as many frames as the probe kept reporting support beneath it.
  it('keeps a dash climbing while the probe still reports support beneath it', () => {
    expect(solverVelocity(vec3(3, 23, 0), SLOPE, { grounded: true, ownsClimb: true }))
      .toEqual(vec3(3, 23, 0));
  });
});
