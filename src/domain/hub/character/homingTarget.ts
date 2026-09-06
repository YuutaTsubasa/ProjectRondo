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

/** A candidate paired with the offset from the player to it, so distance is measured once. */
interface MeasuredCandidate {
  readonly index: number;
  readonly offset: Vec3;
  readonly distance: number;
}

/**
 * Picks which candidate a homing attack should fly to, or `null` for none.
 *
 * A candidate qualifies when it is within `homingRange` of `from` AND the direction from `from` to it
 * is within `homingConeHalfAngle` of `cameraForward`. Among those, the nearest wins; an exact tie
 * goes to the lower index so the result never depends on iteration luck.
 *
 * Returns an INDEX, not a position: every consumer names the crystal rather than a point in space.
 * `stepHomingLock` holds the index for the dash's whole flight and re-subtracts `candidates[index]`
 * from the player every frame to get the live offset, `crystals.flash` lights that crystal on
 * arrival, and the reticle reads its position back out of the list — and an index is what anything a
 * level wants to attach to a specific anchor would key off too.
 *
 * `cameraForward` is normalized here rather than assumed unit-length — it comes from a camera, and a
 * non-unit vector would inflate the dot product and silently widen the cone.
 *
 * The cone is a true 3D test, not a planar one. A climb is vertical, so a crystal directly overhead
 * has to be selectable when the player looks up at it; flattening the comparison to X/Z the way
 * `followCamera.planarBasis()` does for locomotion would make exactly that shot impossible.
 *
 * A candidate exactly at `from` is rejected outright rather than left to the cone test. Its direction
 * normalizes to `ZERO3`, which dots to 0 — below the cosine of any half-angle under 90°, but not of a
 * wider one, so relying on the cone would make "you cannot home onto the point you are standing on"
 * depend on how `homingConeHalfAngle` happens to be tuned.
 */
export const selectHomingTarget = (
  from: Vec3,
  cameraForward: Vec3,
  candidates: readonly Vec3[],
  config: HomingSelectionConfig,
): number | null => {
  const aim = normalize(cameraForward);
  const minCos = Math.cos(config.homingConeHalfAngle);
  const qualifies = ({ offset, distance }: MeasuredCandidate): boolean =>
    distance > 0 && distance <= config.homingRange && dot(normalize(offset), aim) >= minCos;
  // A later candidate only wins on a strictly shorter distance, which is what sends an exact tie to
  // the lower index.
  const nearer = (best: MeasuredCandidate | null, candidate: MeasuredCandidate): MeasuredCandidate =>
    best !== null && best.distance <= candidate.distance ? best : candidate;

  const nearest = candidates
    .map((candidate, index) => measure(index, sub(candidate, from)))
    .filter(qualifies)
    .reduce<MeasuredCandidate | null>(nearer, null);

  return nearest === null ? null : nearest.index;
};

const measure = (index: number, offset: Vec3): MeasuredCandidate => ({
  index,
  offset,
  distance: length(offset),
});
