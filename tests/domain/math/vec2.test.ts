import { describe, it, expect } from 'vitest';
import { vec2, add, sub, scale, length, normalize, moveToward, rotateToward, ZERO } from '../../../src/domain/math/vec2';

describe('vec2', () => {
  it('length of (3,4) is 5', () => {
    expect(length(vec2(3, 4))).toBeCloseTo(5, 6);
  });
  it('normalize keeps direction at unit length', () => {
    const n = normalize(vec2(3, 4));
    expect(length(n)).toBeCloseTo(1, 6);
    expect(n.x).toBeCloseTo(0.6, 6);
    expect(n.y).toBeCloseTo(0.8, 6);
  });
  it('normalize of zero returns zero', () => {
    expect(normalize(ZERO)).toEqual(ZERO);
  });
  it('add / sub / scale are pure componentwise ops', () => {
    expect(add(vec2(1, 2), vec2(3, 4))).toEqual(vec2(4, 6));
    expect(sub(vec2(3, 4), vec2(1, 2))).toEqual(vec2(2, 2));
    expect(scale(vec2(2, 3), 2)).toEqual(vec2(4, 6));
  });
  it('moveToward stops at target when within maxDelta', () => {
    expect(moveToward(vec2(0, 0), vec2(1, 0), 5)).toEqual(vec2(1, 0));
  });
  it('moveToward steps by maxDelta toward target when far', () => {
    const r = moveToward(vec2(0, 0), vec2(10, 0), 4);
    expect(r).toEqual(vec2(4, 0));
  });
  describe('rotateToward', () => {
    const HALF_PI = Math.PI / 2;
    const RIGHT = vec2(1, 0);
    const UP = vec2(0, 1);
    it('snaps to the target when it is within reach', () => {
      expect(rotateToward(RIGHT, UP, HALF_PI)).toEqual(UP);
    });
    it('turns only as far as allowed, staying unit length', () => {
      const r = rotateToward(RIGHT, UP, HALF_PI / 3);
      expect(length(r)).toBeCloseTo(1, 6);
      expect(Math.atan2(r.y, r.x)).toBeCloseTo(HALF_PI / 3, 6);
    });
    it('takes the shorter way round', () => {
      const r = rotateToward(RIGHT, vec2(0, -1), HALF_PI / 3);
      expect(Math.atan2(r.y, r.x)).toBeCloseTo(-HALF_PI / 3, 6);
    });
    it('steps by exactly maxRadians whatever the size of the turn left to make', () => {
      const heading = (v: { x: number; y: number }) => Math.atan2(v.y, v.x);
      expect(heading(rotateToward(RIGHT, UP, 0.1))).toBeCloseTo(0.1, 6);
      expect(heading(rotateToward(RIGHT, vec2(-1, 0.001), 0.1))).toBeCloseTo(0.1, 6);
    });
    it('still makes progress toward a target exactly opposite it', () => {
      // The degenerate case: cross product zero, dot -1. Returning `from` here would wedge a
      // character that asked for a straight about-turn.
      const r = rotateToward(RIGHT, vec2(-1, 0), 0.1);
      expect(Math.abs(Math.atan2(r.y, r.x))).toBeCloseTo(0.1, 6);
    });
    it('holds still when already pointing at the target', () => {
      expect(rotateToward(RIGHT, RIGHT, 0.1)).toEqual(RIGHT);
    });
  });
});
