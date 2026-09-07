import { MovementConstants } from './movementConstants';
import { type HomingSelectionConfig } from './homingTarget';

/**
 * Extends {@link HomingSelectionConfig} rather than restating `homingRange` and
 * `homingConeHalfAngle`: `playerController` hands this same object to `selectHomingTarget`, and
 * `extends` is what makes `tsc` fail if the two ever drift apart. The dependency only runs this way —
 * `homingTarget` still declares the pair it reads and imports nothing from here, so selection stays
 * independent of the rest of the movement tuning.
 */
export interface MovementConfig extends HomingSelectionConfig {
  readonly maxSpeed: number;
  readonly runSpeed: number;
  /** How fast the heading swings toward the input direction, in radians per second. */
  readonly turnRate: number;
  readonly acceleration: number;
  readonly deceleration: number;
  readonly gravity: number;
  readonly jumpSpeed: number;
  /** Speed a homing dash travels at, in world units per second. */
  readonly homingSpeed: number;
  /** Vertical speed granted on arrival, so a chained dash gains height. */
  readonly homingBounceSpeed: number;
  /** Safety bound on how long a dash may run before it is aborted — see characterMovement's dash branch. */
  readonly homingMaxDuration: number;
}

export const DEFAULT_CONFIG: MovementConfig = { ...MovementConstants };
