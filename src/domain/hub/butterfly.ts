import { WIND_DIRECTION_X, WIND_DIRECTION_Z } from './windDirection';

/**
 * A butterfly's position and wingbeat at a moment in time, as plain data — pure and engine-agnostic,
 * the same way `waterBody.ts` is. `butterflies.ts` turns it into billboards.
 */
export interface ButterflySample {
  readonly x: number;
  readonly z: number;
  /**
   * Height ABOVE THE GROUND, not a world Y. Ground height comes from `terrainHeight`, which lives in
   * the presentation layer; reading it here would drag an engine-adjacent dependency into the domain.
   * The caller adds the two.
   */
  readonly heightAboveGround: number;
  /** Wingbeat position, in [0, 1). What a beat looks like is the presentation layer's business. */
  readonly wingPhase: number;
}

const TAU = Math.PI * 2;

/** No butterfly leaves this radius from the origin. Comfortably inside the hub's ~36-unit walkable
 *  field, so none of them is ever seen out over the barrier slope. The tests assert this bound; the
 *  construction below *guarantees* it rather than clamping to it. The proof: each wander axis is a sum
 *  of two sines whose amplitudes sum to 1, so |alongU| <= WANDER and |acrossV| <= WANDER/WIND_STRETCH,
 *  and the worst case is HOME_MAX + sqrt(WANDER^2 + (WANDER/WIND_STRETCH)^2) = 24 + 4.13 = 28.13.
 *  Changing WANDER, HOME_MAX or WIND_STRETCH means redoing that arithmetic. */
export const BUTTERFLY_RADIUS = 30;

/** Height band above the terrain: knee height to just over the knight's head (~1.9 units). */
export const MIN_HEIGHT = 0.4;
export const MAX_HEIGHT = 2.2;

/** Bound on |d(position)/dt|, in units per second — what the continuity test checks against. Derived,
 *  not measured: each axis is a sum of sinusoids whose derivatives are bounded by
 *  sum(amplitude_i * omega_i), and the value below is that sum over all three axes with margin. */
export const MAX_SPEED = 4;

/** Furthest a butterfly's home can sit from the origin. */
const HOME_MAX = 24;
/** Half-extent of the wander loop around home, per axis. */
const WANDER = 3.5;

/** How much longer the wander loop is along the wind than across it. Elongating the loop is what makes
 *  the butterflies read as going *with* the weather; an actual translating drift would leave the field
 *  eventually, and BUTTERFLY_RADIUS is a guarantee rather than a clamp. */
const WIND_STRETCH = 1.6;

/** Wingbeats per second. */
const WINGBEAT_HZ = 7;

/** Deterministic 0..1 hash of a real number — a per-seed offset generator, not a sequence. */
const hash01 = (n: number): number => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/** Fractional part, always in [0, 1) — including for negative inputs, where `%` would not be. */
const fract = (n: number): number => n - Math.floor(n);

/**
 * Where butterfly `seed` is at time `t`.
 *
 * The path is a slow wander around a fixed home point: two sinusoids per axis at incommensurate
 * frequencies, so it never retraces a visible loop, stretched along the wind direction. Everything is
 * bounded by construction — `|wander| <= WANDER` per axis because the two sine amplitudes sum to 1 —
 * so no clamp is needed and the radius bound is provable rather than enforced.
 */
export const butterflyAt = (seed: number, t: number): ButterflySample => {
  const homeAngle = hash01(seed) * TAU;
  // sqrt() spreads homes evenly over the disc instead of bunching them at the centre.
  const homeDist = HOME_MAX * Math.sqrt(hash01(seed + 1.3));
  const homeX = homeDist * Math.cos(homeAngle);
  const homeZ = homeDist * Math.sin(homeAngle);

  const px = hash01(seed + 2.7) * TAU;
  const pz = hash01(seed + 4.1) * TAU;
  const py = hash01(seed + 5.9) * TAU;

  // Amplitudes sum to exactly 1, so each wander term is bounded by WANDER.
  const wanderU = WANDER * (0.667 * Math.sin(0.37 * t + px) + 0.333 * Math.sin(0.83 * t + px * 1.7));
  const wanderV = WANDER * (0.667 * Math.sin(0.41 * t + pz) + 0.333 * Math.sin(0.91 * t + pz * 1.7));

  // u runs along the wind, v across it. The elongation is done by SHRINKING the across-wind axis, not
  // by stretching the along-wind one: stretching would push |alongU| past WANDER and break the radius
  // proof, whereas shrinking leaves both axes bounded by WANDER and still gives a 1.6:1 loop.
  const alongU = wanderU;
  const acrossV = wanderV / WIND_STRETCH;
  const x = homeX + alongU * WIND_DIRECTION_X - acrossV * WIND_DIRECTION_Z;
  const z = homeZ + alongU * WIND_DIRECTION_Z + acrossV * WIND_DIRECTION_X;

  const midHeight = (MIN_HEIGHT + MAX_HEIGHT) / 2;
  const heightSwing = (MAX_HEIGHT - MIN_HEIGHT) / 2;
  const heightAboveGround =
    midHeight + heightSwing * (0.667 * Math.sin(0.53 * t + py) + 0.333 * Math.sin(1.19 * t + py * 1.7));

  return { x, z, heightAboveGround, wingPhase: fract(t * WINGBEAT_HZ + hash01(seed + 7.3)) };
};
