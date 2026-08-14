import { type Vec2, ZERO, lengthSquared, normalize } from '../math/vec2';

/** A planar (X/Z) direction whose magnitude is always in [0, 1]. Build via {@link fromRaw}. */
export interface NormalizedPlanarDirection { readonly value: Vec2 }

export const NONE: NormalizedPlanarDirection = { value: ZERO };

/** Clamps `raw` to unit length, leaving shorter vectors untouched (analog input keeps its magnitude). */
export const fromRaw = (raw: Vec2): NormalizedPlanarDirection =>
  lengthSquared(raw) > 1 ? { value: normalize(raw) } : { value: raw };

export const isZero = (d: NormalizedPlanarDirection): boolean =>
  d.value.x === 0 && d.value.y === 0;
