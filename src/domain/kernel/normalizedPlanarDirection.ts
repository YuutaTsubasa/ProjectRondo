import { type Vec2, ZERO, lengthSquared, normalize } from '../math/vec2';

declare const brand: unique symbol;

/**
 * A planar (X/Z) direction whose magnitude is always in [0, 1]. The brand makes the invariant
 * unforgeable: an instance can only come from {@link fromRaw} or {@link NONE}, never a bare
 * `{ value }` literal — the type equivalent of the C# private constructor.
 */
export interface NormalizedPlanarDirection {
  readonly value: Vec2;
  readonly [brand]: never;
}

const of = (value: Vec2): NormalizedPlanarDirection => ({ value }) as NormalizedPlanarDirection;

export const NONE: NormalizedPlanarDirection = of(ZERO);

/** Clamps `raw` to unit length, leaving shorter vectors untouched (analog input keeps its magnitude). */
export const fromRaw = (raw: Vec2): NormalizedPlanarDirection =>
  of(lengthSquared(raw) > 1 ? normalize(raw) : raw);

export const isZero = (d: NormalizedPlanarDirection): boolean =>
  d.value.x === 0 && d.value.y === 0;
