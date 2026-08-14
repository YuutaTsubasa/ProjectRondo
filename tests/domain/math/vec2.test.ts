import { describe, it, expect } from 'vitest';
import { vec2, add, sub, scale, length, normalize, moveToward, ZERO } from '../../../src/domain/math/vec2';

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
});
