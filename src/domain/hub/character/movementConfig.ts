import { MovementConstants } from './movementConstants';

export interface MovementConfig {
  readonly maxSpeed: number;
  readonly runSpeed: number;
  /** How fast the heading swings toward the input direction, in radians per second. */
  readonly turnRate: number;
  readonly acceleration: number;
  readonly deceleration: number;
  readonly gravity: number;
  readonly jumpSpeed: number;
  /** Furthest a homing candidate may be, in world units. Also read as `HomingSelectionConfig.homingRange`. */
  readonly homingRange: number;
  /** Half the homing cone's opening angle, in radians. Also read as `HomingSelectionConfig.homingConeHalfAngle`. */
  readonly homingConeHalfAngle: number;
  /** Speed a homing dash travels at, in world units per second. */
  readonly homingSpeed: number;
  /** Vertical speed granted on arrival, so a chained dash gains height. */
  readonly homingBounceSpeed: number;
  /** Safety bound on how long a dash may run before it is aborted — see characterMovement's dash branch. */
  readonly homingMaxDuration: number;
}

// `MovementConfig` structurally satisfies `HomingSelectionConfig` (src/domain/hub/character/homingTarget.ts)
// via `homingRange` and `homingConeHalfAngle` above — selection is a separate concern from the dash and is
// not imported here.

export const DEFAULT_CONFIG: MovementConfig = { ...MovementConstants };
