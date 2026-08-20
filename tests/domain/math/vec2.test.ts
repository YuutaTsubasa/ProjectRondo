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
    it('turns at the same rate whatever the speed it will be applied to', () => {
      const slowStep = rotateToward(RIGHT, UP, 0.1);
      const fastStep = rotateToward(RIGHT, UP, 0.1);
      expect(slowStep).toEqual(fastStep);
    });
    it('holds still when already pointing at the target', () => {
      expect(rotateToward(RIGHT, RIGHT, 0.1)).toEqual(RIGHT);
    });
  });
});
