import { describe, it, expect } from 'vitest';
import {
  terrainHeight,
  AMPLITUDE,
  FLAT_RADIUS,
  EDGE_RADIUS,
} from '../../src/presentation/babylon/terrainHeight';

describe('terrainHeight', () => {
  it('is flat (exactly 0) at the centre and everywhere inside the flat radius', () => {
    expect(terrainHeight(0, 0)).toBe(0);
    for (let x = -FLAT_RADIUS; x <= FLAT_RADIUS; x += 1) {
      for (let z = -FLAT_RADIUS; z <= FLAT_RADIUS; z += 1) {
        if (Math.hypot(x, z) <= FLAT_RADIUS) expect(terrainHeight(x, z)).toBe(0);
      }
    }
  });

  it('is deterministic — same input always yields the same height', () => {
    expect(terrainHeight(12.3, -7.1)).toBe(terrainHeight(12.3, -7.1));
    expect(terrainHeight(20, 20)).toBe(terrainHeight(20, 20));
  });

  it('stays within [0, AMPLITUDE] across the whole field', () => {
    for (let x = -EDGE_RADIUS; x <= EDGE_RADIUS; x += 1) {
      for (let z = -EDGE_RADIUS; z <= EDGE_RADIUS; z += 1) {
        const h = terrainHeight(x, z);
        expect(h).toBeGreaterThanOrEqual(0);
        expect(h).toBeLessThanOrEqual(AMPLITUDE);
      }
    }
  });

  it('raises real hills toward the edges (global max clearly above the flat centre)', () => {
    let max = 0;
    for (let x = -EDGE_RADIUS; x <= EDGE_RADIUS; x += 1) {
      for (let z = -EDGE_RADIUS; z <= EDGE_RADIUS; z += 1) {
        max = Math.max(max, terrainHeight(x, z));
      }
    }
    expect(max).toBeGreaterThan(2);
  });
});
