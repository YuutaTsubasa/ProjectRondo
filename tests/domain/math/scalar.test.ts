import { describe, it, expect } from 'vitest';
import { moveToward } from '../../../src/domain/math/scalar';

describe('scalar moveToward', () => {
  it('steps up by at most maxDelta', () => {
    expect(moveToward(1, 10, 2)).toBe(3);
  });
  it('steps down by at most maxDelta', () => {
    expect(moveToward(10, 1, 2)).toBe(8);
  });
  it('lands exactly on the target rather than overshooting it', () => {
    expect(moveToward(9, 10, 5)).toBe(10);
    expect(moveToward(10, 9, 5)).toBe(9);
  });
  it('holds still when already there', () => {
    expect(moveToward(4, 4, 2)).toBe(4);
  });
});
