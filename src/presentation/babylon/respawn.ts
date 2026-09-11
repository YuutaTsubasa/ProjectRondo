import { ZERO3 } from '../../domain/math/vec3';
import type { CharacterMotion } from '../../domain/hub/character/characterMotion';
import { NO_HOMING_LOCK, type HomingLock } from './homingLock';

/**
 * What a checkpoint respawn does to the character's own state — the part of `Player.teleport` that is
 * a rule rather than a call into Havok.
 *
 * Pure and separate from `playerController`'s render observable for the reason `groundContact` and
 * `homingLock` are: a rule that can only be reached through a live Babylon scene, a Havok world and a
 * fall past a checkpoint threshold is a rule that can only be checked by playing the game, and this
 * one is reachable in exactly the situation nobody would think to play — a respawn that fires on a
 * frame with a homing dash in flight.
 *
 * **Ending the dash is the whole point.** `isHomingFrame` is `motion.homing !== null`, and
 * `characterMovement.step` reads it before anything else, so a teleport that moves the capsule and
 * leaves `homing` set has the very next frame resume that dash from the checkpoint — flying at
 * `homingSpeed` 24 toward whichever crystal the lock still holds, with `elapsed` carried over so the
 * timeout that would have stopped it is already part spent. It is not a corner case in this level: the
 * tower's section 2 is a chain of crystals with `TOWER_FALL_MARGIN` 4 u below it, so a player who
 * misses a link and dashes at the crystals on the way down crosses the threshold mid-dash.
 *
 * The presentation-side lock goes with it. A lock is only *read* while `dashInFlight`, so clearing
 * `motion.homing` alone would have got away with it today — `stepHomingLock` would drop the stale lock
 * on the next frame with no press. That is a property of the order two machines happen to run in, not
 * of the respawn, and leaving a committed crystal behind a cut is the kind of thing that stops being
 * harmless when something else starts reading the lock.
 *
 * What is deliberately NOT reset: `GroundContactState`. A respawn lands the capsule in open air
 * `capsule.ts`'s `SPAWN_CLEARANCE` above its pad (design spec §13.1), so "airborne, falling" is the
 * truthful answer for the frame it arrives on, and the support probe answers the next one. The only
 * thing it carries is up to `JUMP_BUFFER_SECONDS` 0.15 s of a buffered press, which spends itself as
 * one jump on landing.
 */
export interface Respawned {
  /** `velocity` zeroed and `homing` cleared — the character arrives at rest and not dashing. */
  readonly motion: CharacterMotion;
  readonly lock: HomingLock;
}

/**
 * The character's state after a checkpoint respawn, given the state it was respawned out of.
 *
 * `facing` and `isGrounded` are carried through untouched: which way the knight is pointing is not
 * something a respawn has an opinion about, and `isGrounded` is overwritten from the support probe on
 * the next frame before the domain ever reads it.
 */
export const respawned = (motion: CharacterMotion): Respawned => ({
  // A new value rather than a mutation: `CharacterMotion` is a domain value, and `ZERO3` is the same
  // shared zero `IDLE` uses.
  motion: { ...motion, velocity: ZERO3, homing: null },
  lock: NO_HOMING_LOCK,
});
