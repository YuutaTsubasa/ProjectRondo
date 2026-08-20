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
}

export const DEFAULT_CONFIG: MovementConfig = { ...MovementConstants };
