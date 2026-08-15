import { type Vec3, ZERO3 } from '../../math/vec3';
import { type Vec2, vec2 } from '../../math/vec2';

/** Kinematic state: world-space velocity, planar (X/Z) facing, and grounded flag. */
export interface CharacterMotion {
  readonly velocity: Vec3;
  readonly facing: Vec2;
  readonly isGrounded: boolean;
}

/**
 * Grounded, motionless, facing forward. Facing is planar (X/Y), where planar Y maps to world Z
 * in {@link CharacterMovement.step}; the default `(0, -1)` therefore faces negative world Z.
 */
export const IDLE: CharacterMotion = { velocity: ZERO3, facing: vec2(0, -1), isGrounded: true };
