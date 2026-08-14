import { fromRaw, NONE, type NormalizedPlanarDirection } from '../../domain/kernel/normalizedPlanarDirection';
import { vec2 } from '../../domain/math/vec2';

export interface PlanarBasis { readonly x: number; readonly z: number }
export interface InputAxis { readonly x: number; readonly y: number }

/** Maps a WASD axis into a camera-relative planar direction (X/Z), clamped to unit length. */
export const planarDirectionFromInput = (
  axis: InputAxis, right: PlanarBasis, forward: PlanarBasis,
): NormalizedPlanarDirection => {
  if (axis.x === 0 && axis.y === 0) return NONE;
  const worldX = right.x * axis.x + forward.x * axis.y;
  const worldZ = right.z * axis.x + forward.z * axis.y;
  return fromRaw(vec2(worldX, worldZ));
};
