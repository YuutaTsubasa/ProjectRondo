import { type Vec3, ZERO3 } from '../../math/vec3';
import { type Vec2, vec2 } from '../../math/vec2';

/**
 * An in-flight homing dash. `direction` is a unit vector fixed at entry — targets are static and the
 * dash lasts under a second, so re-aiming every frame would be invisible. `remaining` is the distance
 * left to cover, and `elapsed` is what the timeout in `characterMovement.step` reads.
 */
export interface HomingDash {
  readonly direction: Vec3;
  readonly remaining: number;
  readonly elapsed: number;
}

/** Kinematic state: world-space velocity, planar (X/Z) facing, and grounded flag. */
export interface CharacterMotion {
  readonly velocity: Vec3;
  readonly facing: Vec2;
  readonly isGrounded: boolean;
  /** Non-null only while a homing dash is in flight. */
  readonly homing: HomingDash | null;
}

/**
 * Grounded, motionless, facing forward. Facing is planar (X/Y), where planar Y maps to world Z
 * in {@link CharacterMovement.step}; the default `(0, -1)` therefore faces negative world Z.
 */
export const IDLE: CharacterMotion = { velocity: ZERO3, facing: vec2(0, -1), isGrounded: true, homing: null };
