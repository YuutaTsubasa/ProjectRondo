import { describe, it, expect } from 'vitest';
import {
  terrainHeight,
  AMPLITUDE,
  BASE_AMPLITUDE,
  FLAT_RADIUS,
  EDGE_RADIUS,
} from '../../src/presentation/babylon/terrainHeight';

describe('terrainHeight', () => {
  it('gently rolls in the central play area — never a dead-flat plane, never a big hill', () => {
    let maxAbs = 0;
    let anyUndulation = false;
    for (let x = -FLAT_RADIUS; x <= FLAT_RADIUS; x += 1) {
      for (let z = -FLAT_RADIUS; z <= FLAT_RADIUS; z += 1) {
        if (Math.hypot(x, z) > FLAT_RADIUS) continue;
        const h = terrainHeight(x, z);
        maxAbs = Math.max(maxAbs, Math.abs(h));
        if (Math.abs(h) > 0.05) anyUndulation = true;
      }
    }
    expect(anyUndulation).toBe(true); // the centre is NOT a flat plane
    expect(maxAbs).toBeLessThanOrEqual(BASE_AMPLITUDE + 1e-9); // …but only the gentle base roll, no big hills
  });

  it('is deterministic and reproducible across builds (pinned golden values)', () => {
    // Same input → same output within a run…
    expect(terrainHeight(12.3, -7.1)).toBe(terrainHeight(12.3, -7.1));
    // …and the seeded heightfield itself is pinned, so a changed SEED / frequency / amplitude / hash
    // constant (which the equality check above cannot catch) fails the suite.
    expect(terrainHeight(20, 20)).toBeCloseTo(3.1782806291859775, 10);
    expect(terrainHeight(-18, 6)).toBeCloseTo(2.1878851450842003, 10);
    expect(terrainHeight(3, 3)).toBeCloseTo(0.04081700809081701, 10);
  });

  it('stays within [-BASE_AMPLITUDE, AMPLITUDE + BASE_AMPLITUDE] across the whole field', () => {
    for (let x = -EDGE_RADIUS; x <= EDGE_RADIUS; x += 1) {
      for (let z = -EDGE_RADIUS; z <= EDGE_RADIUS; z += 1) {
        const h = terrainHeight(x, z);
        expect(h).toBeGreaterThanOrEqual(-BASE_AMPLITUDE - 1e-9);
        expect(h).toBeLessThanOrEqual(AMPLITUDE + BASE_AMPLITUDE + 1e-9);
      }
    }
  });

  it('raises real hills toward the edges (global max clearly above the gentle centre)', () => {
    let max = 0;
    for (let x = -EDGE_RADIUS; x <= EDGE_RADIUS; x += 1) {
      for (let z = -EDGE_RADIUS; z <= EDGE_RADIUS; z += 1) {
        max = Math.max(max, terrainHeight(x, z));
      }
    }
    expect(max).toBeGreaterThan(2);
  });
});
