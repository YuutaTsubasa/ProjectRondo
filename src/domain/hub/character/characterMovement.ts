import { type CharacterMotion } from './characterMotion';
import { type MovementInput } from './movementInput';
import { type MovementConfig } from './movementConfig';
import { type Vec2, vec2, scale, normalize, length, moveToward, rotateToward, ZERO } from '../../math/vec2';
import { type Vec3, vec3, ZERO3, length as length3, normalize as normalize3, scale as scale3 } from '../../math/vec3';
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
  if (motion.homing) return stepHoming(motion, motion.homing.elapsed, input.homingTarget, config, delta);
  if (canEnterHoming(motion, input)) return stepHoming(motion, 0, input.homingTarget, config, delta);

  const facing = nextFacing(motion, input, config, delta);
  const planar = nextPlanarVelocity(motion, input, config, delta, facing);
  const justJumped = motion.isGrounded && input.jumpRequested;
  const verticalSpeed = nextVerticalSpeed(motion, justJumped, config, delta);

  return {
    velocity: vec3(planar.x, verticalSpeed, planar.y),
    facing,
    isGrounded: motion.isGrounded && !justJumped,
    homing: null,
  };
};

/**
 * A press only becomes a dash in the air, and only when it came with a target offset. On the ground
 * the same button is an ordinary jump, which the normal path below handles.
 *
 * A zero-length offset is deliberately NOT filtered here. It used to be, but that guard was untested
 * and unreachable in play: `selectHomingTarget` already rejects a candidate coincident with the
 * player (a zero direction dots to 0, below any `cos` under 90°), so presentation can never hand this
 * function a same-point target. Worse, it disagreed with `stepHoming`'s own handling of the identical
 * input arriving mid-dash instead of at entry — there, a zero offset satisfies `travelled >= remaining`
 * immediately and bounces. Falling through to `stepHoming` here instead makes both paths agree: a
 * zero-length offset always bounces, whether it shows up at entry or mid-flight, rather than silently
 * downgrading an entry-frame zero into an ordinary jump.
 */
const canEnterHoming = (motion: CharacterMotion, input: MovementInput): boolean =>
  !motion.isGrounded && input.homingTarget !== null;

/**
 * The dash frame. `offset` is presentation's LIVE offset from the player to the locked crystal,
 * supplied fresh every frame it is in flight — never the entry-frame value carried forward. `elapsed`
 * is the one thing that *is* carried across frames (as `motion.homing.elapsed`, or 0 on the entry
 * frame), because it is the only quantity `offset` cannot supply.
 *
 * Deriving `direction` and `remaining` from `offset` every frame rather than dead-reckoning them from
 * `homingSpeed * delta` is the fix for a defect the browser pass found: the domain emits a velocity
 * but Havok's character controller is what actually moves the capsule, and collides. A dash blocked by
 * terrain stops advancing, so a *real* offset stops shrinking — and only because `remaining` now
 * tracks that real offset can it ever fail to reach zero, which is what makes the timeout below
 * reachable at all (previously `remaining` shrank by `homingSpeed * delta` regardless of whether the
 * capsule had actually moved, so it always hit zero within `homingRange / homingSpeed` = 0.5s, strictly
 * before `homingMaxDuration`'s 0.6s — see the design spec §5). Reading the live offset instead of a
 * fixed entry direction also makes the dash genuinely home: it corrects course toward the target every
 * frame rather than flying a straight line decided at the press.
 *
 * A null `offset` — presentation has nothing to report for the locked crystal on a frame it must, by
 * the contract in `movementInput.ts`, supply one — is not something to coast through on the previous
 * frame's direction: that would be moving on stale data with no idea whether it is still correct. It
 * ends the dash exactly like the timeout below, safely, rather than trusting it.
 *
 * Arrival is still checked BEFORE the timeout: arriving is a success and should beat a timeout that
 * fires on the same frame, and this ordering matters at real frame times (`playerController` clamps
 * to `MAX_DT = 1/30`, well under `homingMaxDuration`), so the two branches almost never compete — but
 * when they do, the friendlier outcome should win.
 */
const stepHoming = (
  motion: CharacterMotion, elapsedSoFar: number, offset: Vec3 | null, config: MovementConfig, delta: number,
): CharacterMotion => {
  if (offset === null) {
    return { velocity: ZERO3, facing: motion.facing, isGrounded: false, homing: null };
  }

  const remaining = length3(offset);
  const travelled = config.homingSpeed * delta;
  if (travelled >= remaining) {
    return {
      velocity: vec3(0, config.homingBounceSpeed, 0),
      facing: motion.facing,
      isGrounded: false,
      homing: null,
    };
  }

  const elapsed = elapsedSoFar + delta;
  if (elapsed >= config.homingMaxDuration) {
    return { velocity: ZERO3, facing: motion.facing, isGrounded: false, homing: null };
  }

  const direction = normalize3(offset);
  return {
    velocity: scale3(direction, config.homingSpeed),
    facing: dashFacing(motion, direction),
    isGrounded: false,
    // `direction` and `remaining - travelled` are NOT republished onto `homing` — see HomingDash's
    // doc comment. They still did their job this frame (velocity, facing); only `elapsed` needs to
    // outlive it.
    homing: { elapsed },
  };
};

/**
 * Spec §4: "facing turns to the dash direction." `facing` is planar (X maps to world X, Y to world
 * Z — see the doc comment on `IDLE`), so this is the normalized X/Z projection of the 3D dash
 * direction. A dash straight up or down projects to a zero-length vector — `normalize` would return
 * `ZERO`, a meaningless facing — so that degenerate case keeps the previous facing instead. It is
 * reachable: the hub's test crystals include ones directly overhead.
 */
const dashFacing = (motion: CharacterMotion, direction: Vec3): Vec2 => {
  const projected = normalize(vec2(direction.x, direction.z));
  return projected === ZERO ? motion.facing : projected;
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

