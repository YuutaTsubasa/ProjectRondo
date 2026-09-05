import { type Vec3, sub, length, normalize, dot } from '../../math/vec3';

/**
 * The two numbers selection needs. A structural subset of `MovementConfig`, declared here rather
 * than imported, so this module depends on what it reads and not on the whole movement tuning.
 */
export interface HomingSelectionConfig {
  /** Furthest a candidate may be, in world units. */
  readonly homingRange: number;
  /** Half the cone's opening angle, in radians, measured off `cameraForward`. */
  readonly homingConeHalfAngle: number;
}

/**
 * Picks which candidate a homing attack should fly to, or `null` for none.
 *
 * A candidate qualifies when it is within `homingRange` of `from` AND the direction from `from` to it
 * is within `homingConeHalfAngle` of `cameraForward`. Among those, the nearest wins; an exact tie
 * goes to the lower index so the result never depends on iteration luck.
 *
 * Returns an INDEX, not a position: the caller needs to know *which* crystal, for the trail and for
 * anything a level wants to attach to a specific anchor.
 *
 * `cameraForward` is normalized here rather than assumed unit-length — it comes from a camera, and a
 * non-unit vector would inflate the dot product and silently widen the cone.
 *
 * The cone is a true 3D test, not a planar one. A climb is vertical, so a crystal directly overhead
 * has to be selectable when the player looks up at it; flattening the comparison to X/Z the way
 * `followCamera.planarBasis()` does for locomotion would make exactly that shot impossible.
 */
export const selectHomingTarget = (
  from: Vec3,
  cameraForward: Vec3,
  candidates: readonly Vec3[],
  config: HomingSelectionConfig,
): number | null => {
  const aim = normalize(cameraForward);
  const minCos = Math.cos(config.homingConeHalfAngle);

  let best: number | null = null;
  let bestDistance = Infinity;

  for (let i = 0; i < candidates.length; i++) {
    const offset = sub(candidates[i], from);
    const distance = length(offset);
    if (distance > config.homingRange) continue;
    // A candidate exactly at `from` normalizes to ZERO3, whose dot with `aim` is 0. That is below
    // any cos of a half-angle under 90 degrees, so it falls out here as "not in the cone" rather
    // than producing NaN — which is why this comparison is safe without a separate zero guard.
    if (dot(normalize(offset), aim) < minCos) continue;
    if (distance < bestDistance) {
      best = i;
      bestDistance = distance;
    }
  }
  return best;
};
