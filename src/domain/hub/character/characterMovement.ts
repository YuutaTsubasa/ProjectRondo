import { type CharacterMotion } from './characterMotion';
import { type MovementInput } from './movementInput';
import { type MovementConfig } from './movementConfig';
import { type Vec2, vec2, scale, normalize, moveToward } from '../../math/vec2';
import { vec3 } from '../../math/vec3';
import { isZero } from '../../kernel/normalizedPlanarDirection';

/** Advances the character motion by a single frame of `delta` seconds. Pure. */
export const step = (
  motion: CharacterMotion,
  input: MovementInput,
  config: MovementConfig,
  delta: number,
): CharacterMotion => {
  const planar = nextPlanarVelocity(motion, input, config, delta);
  const justJumped = motion.isGrounded && input.jumpRequested;
  const verticalSpeed = nextVerticalSpeed(motion, justJumped, config, delta);
  const facing = isZero(input.direction) ? motion.facing : normalize(input.direction.value);

  return {
    velocity: vec3(planar.x, verticalSpeed, planar.y),
    facing,
    isGrounded: motion.isGrounded && !justJumped,
  };
};

const nextPlanarVelocity = (
  motion: CharacterMotion, input: MovementInput, config: MovementConfig, delta: number,
): Vec2 => {
  const current = vec2(motion.velocity.x, motion.velocity.z);
  // Sprint only scales an existing direction; holding run while standing still is a no-op, since
  // `direction` is zero and the target stays at rest either way.
  const topSpeed = input.runRequested ? config.runSpeed : config.maxSpeed;
  const target = scale(input.direction.value, topSpeed);
  const rate = isZero(input.direction) ? config.deceleration : config.acceleration;
  return moveToward(current, target, rate * delta);
};

const nextVerticalSpeed = (
  motion: CharacterMotion, justJumped: boolean, config: MovementConfig, delta: number,
): number => {
  if (motion.isGrounded) return justJumped ? config.jumpSpeed : 0;
  return motion.velocity.y - config.gravity * delta;
};
