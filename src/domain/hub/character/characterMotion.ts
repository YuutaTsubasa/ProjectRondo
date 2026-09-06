import { type Vec3, ZERO3 } from '../../math/vec3';
import { type Vec2, vec2 } from '../../math/vec2';

/**
 * An in-flight homing dash. Carries only `elapsed`, because that is the only thing about a dash that
 * cannot be recomputed from what presentation supplies each frame: `characterMovement.stepHoming`
 * derives the dash's direction and its remaining distance from the LIVE offset to the target every
 * frame — which is what makes the dash home for real (design spec §4) and the timeout reachable at
 * all (§5) — while how long the dash has been running has no such source.
 */
export interface HomingDash {
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
