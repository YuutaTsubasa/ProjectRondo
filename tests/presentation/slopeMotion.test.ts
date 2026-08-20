import { describe, it, expect } from 'vitest';
import { alignToSurface, flattenToGroundSpeed } from '../../src/presentation/babylon/slopeMotion';
import { vec3 } from '../../src/domain/math/vec3';

const P = 4;
const length = (v: { x: number; y: number; z: number }) => Math.hypot(v.x, v.y, v.z);
const planarLength = (v: { x: number; z: number }) => Math.hypot(v.x, v.z);
/** Unit normal of a surface that rises toward +X at `deg` degrees. */
const slopeNormal = (deg: number) => {
  const r = (deg * Math.PI) / 180;
  return vec3(-Math.sin(r), Math.cos(r), 0);
};

describe('alignToSurface', () => {
  it('leaves a horizontal velocity alone on level ground', () => {
    const r = alignToSurface(vec3(8, 0, 0), vec3(0, 1, 0));
    expect(r).toEqual(vec3(8, 0, 0));
  });

  it('tilts the velocity up the slope, keeping its speed', () => {
    const r = alignToSurface(vec3(8, 0, 0), slopeNormal(30));
    expect(length(r)).toBeCloseTo(8, P);
    expect(r.y).toBeCloseTo(8 * Math.sin((30 * Math.PI) / 180), P);
    expect(planarLength(r)).toBeCloseTo(8 * Math.cos((30 * Math.PI) / 180), P);
  });

  it('tilts the velocity down when heading downhill', () => {
    const r = alignToSurface(vec3(-8, 0, 0), slopeNormal(30));
    expect(length(r)).toBeCloseTo(8, P);
    expect(r.y).toBeCloseTo(-8 * Math.sin((30 * Math.PI) / 180), P);
  });

  it('leaves a velocity running across the slope horizontal', () => {
    const r = alignToSurface(vec3(0, 0, 8), slopeNormal(30));
    expect(r.y).toBeCloseTo(0, P);
    expect(length(r)).toBeCloseTo(8, P);
  });

  it('passes a resting velocity straight through', () => {
    expect(alignToSurface(vec3(0, 0, 0), slopeNormal(20))).toEqual(vec3(0, 0, 0));
  });

  it('passes through a velocity parallel to the normal, which has no tangent to align to', () => {
    const n = slopeNormal(20);
    const v = vec3(n.x * 5, n.y * 5, n.z * 5);
    expect(alignToSurface(v, n)).toEqual(v);
  });
});

describe('flattenToGroundSpeed', () => {
  it('leaves a horizontal velocity alone', () => {
    expect(flattenToGroundSpeed(vec3(8, 0, 0))).toEqual(vec3(8, 0, 0));
  });

  it('reports the along-the-ground speed as the horizontal speed', () => {
    // Climbing at 8 u/s up a 30 degree slope: horizontally that is only 6.93, but the character is
    // travelling 8 along the ground and the domain must see 8, or it accelerates from the wrong value.
    const climbing = alignToSurface(vec3(8, 0, 0), slopeNormal(30));
    expect(planarLength(flattenToGroundSpeed(climbing))).toBeCloseTo(8, P);
  });

  it('is the inverse of alignToSurface for any slope the character can walk', () => {
    for (const deg of [0, 5, 10, 20, 30, 45]) {
      const flattened = flattenToGroundSpeed(alignToSurface(vec3(8, 0, 0), slopeNormal(deg)));
      expect(planarLength(flattened)).toBeCloseTo(8, P);
    }
  });

  it('keeps the vertical component untouched', () => {
    const r = flattenToGroundSpeed(vec3(3, -4, 0));
    expect(r.y).toBeCloseTo(-4, P);
  });

  it('passes a purely vertical velocity through rather than dividing by zero', () => {
    expect(flattenToGroundSpeed(vec3(0, -9, 0))).toEqual(vec3(0, -9, 0));
  });
});
