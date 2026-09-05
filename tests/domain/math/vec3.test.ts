import { describe, it, expect } from 'vitest';
import { vec3, ZERO3, sub, scale, lengthSquared, length, normalize, dot } from '../../../src/domain/math/vec3';

const P = 10;

describe('vec3 arithmetic', () => {
  it('subtracts componentwise', () => {
    expect(sub(vec3(10, 20, 30), vec3(1, 2, 3))).toEqual(vec3(9, 18, 27));
  });

  it('scales componentwise', () => {
    expect(scale(vec3(1, -2, 3), 2)).toEqual(vec3(2, -4, 6));
  });

  it('measures length and squared length', () => {
    expect(lengthSquared(vec3(3, 4, 12))).toBe(169);
    expect(length(vec3(3, 4, 12))).toBeCloseTo(13, P);
  });

  it('normalizes to unit length', () => {
    const n = normalize(vec3(0, 0, -5));
    expect(n).toEqual(vec3(0, 0, -1));
    expect(length(normalize(vec3(1, 2, 3)))).toBeCloseTo(1, P);
  });

  // Mirrors vec2.normalize, which returns ZERO rather than NaN for a zero vector and documents that
  // as intentional. The homing cone relies on it: a crystal exactly at the player has a zero-length
  // direction, and NaN there would poison the whole comparison.
  it('normalizes the zero vector to zero rather than NaN', () => {
    expect(normalize(ZERO3)).toEqual(ZERO3);
  });

  it('takes a dot product', () => {
    expect(dot(vec3(1, 0, 0), vec3(0, 1, 0))).toBe(0);
    expect(dot(vec3(1, 2, 3), vec3(4, -5, 6))).toBe(4 - 10 + 18);
  });
});
