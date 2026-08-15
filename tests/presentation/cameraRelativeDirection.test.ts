import { describe, it, expect } from 'vitest';
import { planarDirectionFromInput } from '../../src/presentation/babylon/cameraRelativeDirection';
import { isZero } from '../../src/domain/kernel/normalizedPlanarDirection';

// Camera looking down -Z (default): right = +X (1,0), forward = -Z (0,-1) in {x,z}.
const RIGHT = { x: 1, z: 0 };
const FORWARD = { x: 0, z: -1 };

describe('planarDirectionFromInput', () => {
  it('zero axis yields the zero direction', () => {
    expect(isZero(planarDirectionFromInput({ x: 0, y: 0 }, RIGHT, FORWARD))).toBe(true);
  });
  it('pressing forward (axis.y=1) maps to camera forward', () => {
    const d = planarDirectionFromInput({ x: 0, y: 1 }, RIGHT, FORWARD);
    expect(d.value.x).toBeCloseTo(0, 3);
    expect(d.value.y).toBeCloseTo(-1, 3); // planar y == world z
  });
  it('pressing right (axis.x=1) maps to camera right', () => {
    const d = planarDirectionFromInput({ x: 1, y: 0 }, RIGHT, FORWARD);
    expect(d.value.x).toBeCloseTo(1, 3);
    expect(d.value.y).toBeCloseTo(0, 3);
  });
  it('diagonal is clamped to unit length', () => {
    const d = planarDirectionFromInput({ x: 1, y: 1 }, RIGHT, FORWARD);
    expect(Math.hypot(d.value.x, d.value.y)).toBeCloseTo(1, 3);
  });
});
