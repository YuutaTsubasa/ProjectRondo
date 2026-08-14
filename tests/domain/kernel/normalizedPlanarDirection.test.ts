import { describe, it, expect } from 'vitest';
import { vec2, length } from '../../../src/domain/math/vec2';
import { fromRaw, isZero, NONE } from '../../../src/domain/kernel/normalizedPlanarDirection';

describe('NormalizedPlanarDirection', () => {
  it('vector longer than unit is clamped to unit length', () => {
    const d = fromRaw(vec2(3, 4));
    expect(length(d.value)).toBeCloseTo(1, 3);
    expect(d.value.x).toBeCloseTo(0.6, 3);
    expect(d.value.y).toBeCloseTo(0.8, 3);
  });
  it('vector shorter than unit is preserved for analog input', () => {
    const d = fromRaw(vec2(0.5, 0));
    expect(d.value.x).toBeCloseTo(0.5, 3);
    expect(d.value.y).toBeCloseTo(0, 3);
    expect(isZero(d)).toBe(false);
  });
  it('zero vector is zero', () => {
    expect(isZero(fromRaw(vec2(0, 0)))).toBe(true);
    expect(isZero(NONE)).toBe(true);
  });
  it('diagonal overflow preserves direction at unit length', () => {
    const d = fromRaw(vec2(1, 1));
    expect(length(d.value)).toBeCloseTo(1, 3);
    expect(d.value.x).toBeCloseTo(d.value.y, 3);
  });
});
