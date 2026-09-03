import { describe, it, expect } from 'vitest';
import {
  butterflyAt,
  BUTTERFLY_RADIUS,
  MIN_HEIGHT,
  MAX_HEIGHT,
  MAX_SPEED,
} from '../../../src/domain/hub/butterfly';

const SEEDS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const TIMES = Array.from({ length: 400 }, (_, i) => i * 0.37);

describe('butterflyAt', () => {
  it('is deterministic', () => {
    expect(butterflyAt(3, 12.5)).toEqual(butterflyAt(3, 12.5));
  });

  it('gives different seeds different paths', () => {
    const a = butterflyAt(1, 5);
    const b = butterflyAt(2, 5);
    expect(a.x === b.x && a.z === b.z).toBe(false);
  });

  it('stays inside the field radius for every seed over a long span', () => {
    for (const seed of SEEDS) {
      for (const t of TIMES) {
        const s = butterflyAt(seed, t);
        expect(Math.hypot(s.x, s.z)).toBeLessThanOrEqual(BUTTERFLY_RADIUS);
      }
    }
  });

  it('stays inside the height band', () => {
    for (const seed of SEEDS) {
      for (const t of TIMES) {
        const s = butterflyAt(seed, t);
        expect(s.heightAboveGround).toBeGreaterThanOrEqual(MIN_HEIGHT);
        expect(s.heightAboveGround).toBeLessThanOrEqual(MAX_HEIGHT);
      }
    }
  });

  it('moves continuously — no teleport at any period boundary', () => {
    const dt = 0.01;
    for (const seed of SEEDS) {
      for (const t of TIMES) {
        const a = butterflyAt(seed, t);
        const b = butterflyAt(seed, t + dt);
        const moved = Math.hypot(b.x - a.x, b.z - a.z, b.heightAboveGround - a.heightAboveGround);
        expect(moved).toBeLessThanOrEqual(MAX_SPEED * dt);
      }
    }
  });

  it('keeps wingPhase in [0, 1) for positive and negative time', () => {
    for (const t of [-13.7, -0.2, 0, 0.2, 13.7]) {
      const p = butterflyAt(4, t).wingPhase;
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThan(1);
    }
  });
});
