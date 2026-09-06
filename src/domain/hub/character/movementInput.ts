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
   * points and subtracts.
   *
   * Non-null on the frame a press is resolved to a target, AND on every frame after that while
   * `CharacterMotion.homing` stays non-null: presentation holds the locked crystal and re-supplies
   * the live offset to it each frame, not the press-frame snapshot. `characterMovement.stepHoming`
   * takes this as ground truth for both the dash's direction and how much distance remains — that is
   * what lets a dash blocked by terrain be told apart from one still closing on its target. A null
   * value while a dash is in flight is presentation reporting it has nothing to offer; the domain
   * treats that as reason to end the dash safely rather than continue on a stale offset.
   */
  readonly homingTarget: Vec3 | null;
}

export const NONE_INPUT: MovementInput = {
  direction: NONE, jumpRequested: false, runRequested: false, homingTarget: null,
};
