import { MovementConstants } from './movementConstants';

export interface MovementConfig {
  readonly maxSpeed: number;
  readonly acceleration: number;
  readonly deceleration: number;
  readonly gravity: number;
  readonly jumpSpeed: number;
}

export const DEFAULT_CONFIG: MovementConfig = { ...MovementConstants };
