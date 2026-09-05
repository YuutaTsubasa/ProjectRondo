import { type NormalizedPlanarDirection, NONE } from '../../kernel/normalizedPlanarDirection';
import { type Vec3 } from '../../math/vec3';

export interface MovementInput {
  readonly direction: NormalizedPlanarDirection;
  readonly jumpRequested: boolean;
  /** Sprint modifier held. A state, not an edge — unlike `jumpRequested`. */
  readonly runRequested: boolean;
  /**
   * The OFFSET from the player to the crystal a homing dash should fly to, or null. Not a world
   * position: `step` does not know where the player is, and giving the domain a position would make
   * it a second source of truth for something the physics controller owns. Presentation knows both
   * points and subtracts. Non-null only on the frame the press is resolved to a target.
   */
  readonly homingTarget: Vec3 | null;
}

export const NONE_INPUT: MovementInput = {
  direction: NONE, jumpRequested: false, runRequested: false, homingTarget: null,
};
