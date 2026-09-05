import { type Vec3, ZERO3 } from '../../math/vec3';
import { type Vec2, vec2 } from '../../math/vec2';

/**
 * An in-flight homing dash. Carries only `elapsed` — the one thing that genuinely persists frame to
 * frame, because it is what the timeout in `characterMovement.step` reads and the live offset has no
 * way to supply it.
 *
 * `direction` and `remaining` used to live here too, computed by `characterMovement.stepHoming` and
 * stored on the returned motion. Neither ever had a production reader: `step` reads only
 * `motion.homing.elapsed`, presentation's `KnightMotionSample.homing` reads only `!== null`, and the
 * per-frame offset presentation feeds back in (`playerController`'s `homingOffset`) is computed fresh
 * from `root.getAbsolutePosition()` and the locked crystal, never from anything read off this
 * interface. Their only consumers were this module's own tests, which multiplied them back together
 * to synthesise the next frame's offset — dead reckoning the domain had just stopped doing internally,
 * reintroduced at the call site. The tests now track that offset themselves (subtracting each frame's
 * `velocity * delta`, the same arithmetic presentation performs by re-reading world position), so the
 * fields could be dropped rather than kept for a reader that turned out to be the test file itself.
 *
 * `direction` and `remaining` are still recomputed from the live offset every frame *inside*
 * `stepHoming` — that is what makes the dash home for real (design spec §4) and what makes the
 * timeout reachable at all (§5) — this interface just no longer republishes them.
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
