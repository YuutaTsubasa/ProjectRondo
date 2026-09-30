import { describe, expect, it } from 'vitest';
import { MEADOW_PATHS, meadowPathDistance, meadowClearing, meadowPatch } from '../../src/presentation/babylon/meadowLayout';

describe('decorative meadow layout', () => {
  it('keeps trails continuous along every segment, including destinations', () => {
    for (const path of MEADOW_PATHS) for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i];
      for (let t = 0; t <= 1; t += 0.1) {
        expect(meadowPathDistance(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)).toBeLessThan(1e-10);
      }
    }
  });
  it('leaves spawn and the portal plaza open without clearing the whole meadow', () => {
    expect(meadowClearing(0, 0)).toBe(true);
    expect(meadowClearing(-6, 32)).toBe(true);
    expect(meadowClearing(20, 10)).toBe(false);
  });
  it('has finite distances and bounded patch density across the field', () => {
    for (let x = -50; x <= 50; x += 2) for (let z = -50; z <= 50; z += 2) {
      expect(Number.isFinite(meadowPathDistance(x, z))).toBe(true);
      expect(meadowPatch(x, z)).toBeGreaterThanOrEqual(0);
      expect(meadowPatch(x, z)).toBeLessThanOrEqual(1);
    }
  });
});
