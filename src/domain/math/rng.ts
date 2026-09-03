/**
 * Deterministic PRNG (mulberry32), uniform in [0, 1). Seeded so every procedural layout in the hub is
 * identical on every run — the ground scatter's 16 000 grass tufts and its rock colliders come out of
 * this, so the exact sequence is load-bearing and pinned by a test. Change the algorithm and the whole
 * hub rearranges.
 */
export const rng = (seed: number): (() => number) => {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
