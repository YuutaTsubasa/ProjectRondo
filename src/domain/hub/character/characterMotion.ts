import { type Vec3, ZERO3 } from '../../math/vec3';
import { type Vec2, vec2 } from '../../math/vec2';

/**
 * An in-flight homing dash. `direction` and `remaining` are NOT carried forward frame to frame —
 * `characterMovement.stepHoming` recomputes both every frame from presentation's live offset to the
 * locked crystal, so what is stored here is only the last frame's snapshot, useful to a caller but not
 * read back as input. `elapsed` is the one field that genuinely persists: it is what the timeout in
 * `characterMovement.step` reads, and the live offset has no way to supply it.
 *
 * Recomputing `direction`/`remaining` from the live offset (rather than fixing `direction` at entry
 * and dead-reckoning `remaining` down by `homingSpeed * delta`) is deliberate on two counts: it is
 * what makes the dash home for real — correcting course toward the target every frame, not flying the
 * straight line decided at the press (design spec §4) — and it is what makes `remaining` reflect
 * whether the capsule is actually moving, which is the timeout's whole reason to exist (§5).
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
