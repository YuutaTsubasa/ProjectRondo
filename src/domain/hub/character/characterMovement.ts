import { type CharacterMotion } from './characterMotion';
import { type MovementInput } from './movementInput';
import { type MovementConfig } from './movementConfig';
import { type Vec2, vec2, scale, normalize, length, moveToward, rotateToward, ZERO } from '../../math/vec2';
import { vec3 } from '../../math/vec3';
import { moveToward as moveTowardScalar } from '../../math/scalar';
import { isZero } from '../../kernel/normalizedPlanarDirection';

/** Below this speed there is no momentum to fight, so the heading may swing round much faster. */
const PIVOT_FREELY_BELOW = 0.5;
/**
 * Turn rate used below {@link PIVOT_FREELY_BELOW}, in radians per second — brisk enough that setting
 * off from rest does not pivot on the spot first, but still *bounded*. Snapping straight to the input
 * instead put a whole 180° into a single frame whenever the player tapped a reverse direction while
 * standing, and nothing downstream smooths that: the model reads the heading directly.
 */
const PIVOT_TURN_RATE = 30;

/** Advances the character motion by a single frame of `delta` seconds. Pure. */
export const step = (
  motion: CharacterMotion,
  input: MovementInput,
  config: MovementConfig,
  delta: number,
): CharacterMotion => {
  const facing = nextFacing(motion, input, config, delta);
  const planar = nextPlanarVelocity(motion, input, config, delta, facing);
  const justJumped = motion.isGrounded && input.jumpRequested;
  const verticalSpeed = nextVerticalSpeed(motion, justJumped, config, delta);

  return {
    velocity: vec3(planar.x, verticalSpeed, planar.y),
    facing,
    isGrounded: motion.isGrounded && !justJumped,
  };
};

/**
 * Swings the heading toward the input direction at a fixed angular rate. Capping the *turn* rather
 * than the change in velocity is what keeps a sprint from carving a wide arc: easing the velocity
 * vector straight toward its new target made a 90° turn at 8 u/s cover 11.3 u/s of vector change and
 * take 0.6s, while the model swung round in 0.2s — so the knight faced one way and slid the other for
 * a third of a second.
 */
const nextFacing = (
  motion: CharacterMotion, input: MovementInput, config: MovementConfig, delta: number,
): Vec2 => {
  if (isZero(input.direction)) return motion.facing;

  const wanted = normalize(input.direction.value);
  const speed = length(vec2(motion.velocity.x, motion.velocity.z));
  const rate = speed < PIVOT_FREELY_BELOW ? PIVOT_TURN_RATE : config.turnRate;

  return rotateToward(motion.facing, wanted, rate * delta);
};

/**
 * The character travels where it faces, so {@link nextFacing} is the only thing that steers here.
 * Speed is separate: it eases toward the requested top speed, or toward rest when nothing is held.
 * A part-pressed direction (an analog stick) asks for a proportionally lower top speed.
 */
const nextPlanarVelocity = (
  motion: CharacterMotion, input: MovementInput, config: MovementConfig, delta: number, facing: Vec2,
): Vec2 => {
  const current = vec2(motion.velocity.x, motion.velocity.z);
  if (isZero(input.direction)) return moveToward(current, ZERO, config.deceleration * delta);

  const topSpeed = input.runRequested ? config.runSpeed : config.maxSpeed;
  const requested = topSpeed * Math.min(1, length(input.direction.value));
  return scale(facing, moveTowardScalar(length(current), requested, config.acceleration * delta));
};

const nextVerticalSpeed = (
  motion: CharacterMotion, justJumped: boolean, config: MovementConfig, delta: number,
): number => {
  if (motion.isGrounded) return justJumped ? config.jumpSpeed : 0;
  return motion.velocity.y - config.gravity * delta;
};

