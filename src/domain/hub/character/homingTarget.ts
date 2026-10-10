import { type Vec3, vec3, sub, length, normalize, dot } from '../../math/vec3';

export interface HomingSelectionConfig {
  /** Maximum straight-line distance, including height. */
  readonly homingRange: number;
  /** Horizontal half-angle around the character's facing, in radians. */
  readonly homingConeHalfAngle: number;
}

/**
 * Nearest target in the character's horizontal facing cone, within the full 3D range.
 * Height does not require camera aiming: forward elevated targets and vertical chain links
 * remain reachable. Forward targets take priority over directly vertical links so a bounce
 * advances along the route instead of picking the crystal just below again. Exact overlaps are rejected; equal distances retain the first candidate.
 * This is shared by the preview and committed lock, never by camera rotation.
 */
export const selectHomingTarget = (
  from: Vec3,
  characterForward: Vec3,
  candidates: readonly Vec3[],
  config: HomingSelectionConfig,
): number | null => {
  const aim = normalize(vec3(characterForward.x, 0, characterForward.z));
  if (!(length(aim) > 0)) return null;
  const minCos = Math.cos(config.homingConeHalfAngle);
  let best: number | null = null, bestDistance = Infinity;
  let vertical: number | null = null, verticalDistance = Infinity;
  candidates.forEach((candidate, index) => {
    const offset = sub(candidate, from), distance = length(offset);
    if (!(distance > 0 && distance <= config.homingRange)) return;
    const planar = vec3(offset.x, 0, offset.z);
    if (length(planar) <= 1e-6) {
      if (distance < verticalDistance) { vertical = index; verticalDistance = distance; }
      return;
    }
    const inCone = dot(normalize(planar), aim) >= minCos;
    if (inCone && distance < bestDistance) { best = index; bestDistance = distance; }
  });
  return best ?? vertical;
};
