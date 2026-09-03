import { describe, it, expect } from 'vitest';
import { rng } from '../../../src/domain/math/rng';

// These four values were produced by the implementation that shipped the hub's layout (captured by
// running the mulberry32 body, unmodified, standalone via `node -e`, before it was moved into
// src/domain/math/rng.ts). If they change, every scattered thing in the hub has moved.
const EXPECTED_SEED_1 = [0.627073940588, 0.00273572118, 0.52744703996, 0.981050967472];

describe('rng (mulberry32)', () => {
  it('is deterministic for a seed', () => {
    const a = rng(1);
    const b = rng(1);
    const seqA = [a(), a(), a(), a()];
    const seqB = [b(), b(), b(), b()];
    expect(seqA).toEqual(seqB);
  });

  it('gives different sequences for different seeds', () => {
    const a = rng(1);
    const b = rng(2);
    expect(a()).not.toEqual(b());
  });

  it('stays in [0, 1)', () => {
    const r = rng(99);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  // The guard that makes this a move rather than a rewrite. These four values were produced by the
  // implementation that shipped the hub's layout; if they change, every scattered thing has moved.
  it('reproduces the exact sequence the hub layout was generated from', () => {
    const r = rng(1);
    const got = [r(), r(), r(), r()].map((v) => Number(v.toFixed(12)));
    expect(got).toEqual(EXPECTED_SEED_1);
  });
});
