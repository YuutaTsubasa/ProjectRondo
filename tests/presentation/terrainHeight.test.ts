import { describe, it, expect } from 'vitest';
import {
  terrainHeight,
  AMPLITUDE,
  BASE_AMPLITUDE,
  BARRIER_HEIGHT,
  FLAT_RADIUS,
  EDGE_RADIUS,
} from '../../src/presentation/babylon/terrainHeight';

/** Max terrain slope (degrees) sampled around the ring at radius r. */
function maxSlopeOnRing(r: number): number {
  const d = 0.5;
  let max = 0;
  for (let a = 0; a < Math.PI * 2; a += 0.04) {
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const gx = (terrainHeight(x + d, z) - terrainHeight(x - d, z)) / (2 * d);
    const gz = (terrainHeight(x, z + d) - terrainHeight(x, z - d)) / (2 * d);
    max = Math.max(max, (Math.atan(Math.hypot(gx, gz)) * 180) / Math.PI);
  }
  return max;
}

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
    expect(anyUndulation).toBe(true);
    expect(maxAbs).toBeLessThanOrEqual(BASE_AMPLITUDE + 1e-9);
  });

  it('keeps the walkable belt climbable (≤ 35°) but the rim barrier steep (> 60°)', () => {
    for (let r = FLAT_RADIUS + 1; r < EDGE_RADIUS - 1; r += 1) {
      expect(maxSlopeOnRing(r)).toBeLessThanOrEqual(35);
    }
    let barrierMax = 0;
    for (let r = 43; r <= 47; r += 0.5) barrierMax = Math.max(barrierMax, maxSlopeOnRing(r));
    expect(barrierMax).toBeGreaterThan(60);
  });

  it('is deterministic and reproducible across builds (pinned golden values)', () => {
    expect(terrainHeight(12.3, -7.1)).toBe(terrainHeight(12.3, -7.1));
    expect(terrainHeight(30, 10)).toBeCloseTo(3.146473615124727, 10);
    expect(terrainHeight(-22, 14)).toBeCloseTo(1.738889023831396, 10);
    expect(terrainHeight(5, 5)).toBeCloseTo(0.07281288298824791, 10);
    expect(terrainHeight(45, 0)).toBeCloseTo(9.713762882765149, 10);
  });

  it('stays within [-BASE_AMPLITUDE, AMPLITUDE + BASE_AMPLITUDE + BARRIER_HEIGHT]', () => {
    for (let x = -49; x <= 49; x += 1) {
      for (let z = -49; z <= 49; z += 1) {
        const h = terrainHeight(x, z);
        expect(h).toBeGreaterThanOrEqual(-BASE_AMPLITUDE - 1e-9);
        expect(h).toBeLessThanOrEqual(AMPLITUDE + BASE_AMPLITUDE + BARRIER_HEIGHT + 1e-9);
      }
    }
  });
});
