import { type Vec3, sub, length } from '../../domain/math/vec3';
import { selectHomingTarget, type HomingSelectionConfig } from '../../domain/hub/character/homingTarget';

/**
 * Which crystal a homing dash is committed to, and how long that dash is expected to take.
 *
 * Pure and separate from `playerController`'s render observable for the reason `groundContact` and
 * `slopeMotion` are: a machine that can only be reached through a live Babylon scene can only be
 * checked by playing the game. This one has several edges — commit on a press, hold the same crystal
 * for the whole dash, release it the frame the dash ends, and answer a second, independent selection
 * for the reticle — and each of them decides something the player sees.
 */
export interface HomingLock {
  /** Index into the candidate list, or null while nothing is locked. */
  readonly crystal: number | null;
  /**
   * How long the locked dash is expected to take, in seconds: the straight-line distance at lock time
   * over `homingSpeed`. Fixed for the dash's whole flight rather than recomputed — a dash that
   * corrects course (design spec §4) keeps changing the live distance a recomputation would divide
   * by, and `knight.ts` reads this once, to retime the Flying Kick clip onto the dash's real screen
   * time.
   */
  readonly entrySeconds: number | null;
}

export const NO_HOMING_LOCK: HomingLock = { crystal: null, entrySeconds: null };

/** The three numbers a lock needs: the two selection reads, plus the speed the estimate divides by. */
export interface HomingLockConfig extends HomingSelectionConfig {
  readonly homingSpeed: number;
}

export interface HomingLockInput {
  /** `CharacterMotion.homing !== null` from last frame's result: a dash is already under way. */
  readonly dashInFlight: boolean;
  /** The jump key-press consumed this frame. Airborne it asks for a dash; grounded it is a jump. */
  readonly jumpPressed: boolean;
  /** `groundContact`'s verdict, not the raw support probe — the same one the visuals read. */
  readonly airborne: boolean;
  /** The player's world position this frame. */
  readonly from: Vec3;
  /**
   * The camera's TRUE 3D forward (`target - position`), deliberately not `planarBasis().forward`,
   * which is flattened to X/Z for locomotion: a climb is vertical, and a crystal directly overhead is
   * exactly the shot a flattened aim can never take.
   */
  readonly cameraForward: Vec3;
  /** World positions of the crystals, in the order the returned indices refer to. */
  readonly candidates: readonly Vec3[];
}

export interface HomingLockResult {
  readonly lock: HomingLock;
  /**
   * What `characterMovement.step` takes as `homingTarget`: the LIVE offset to the locked crystal,
   * recomputed every frame rather than dead-reckoned from the press-frame value, so `stepHoming` can
   * tell a dash still closing on its target from one a wall has stopped.
   */
  readonly target: Vec3 | null;
  /**
   * What a press right now would hit — the reticle's crystal. A selection in its own right, never the
   * committed {@link HomingLock.crystal}: the lock must not move mid-dash, while the reticle has to
   * answer on every frame, including frames with no press at all.
   */
  readonly preview: number | null;
}

/**
 * Advances the lock by one frame.
 *
 * The reticle's question and the lock's are the same question asked of different frames — "what would
 * a press hit from here?" — so they are answered by ONE call to `selectHomingTarget`. A press narrows
 * that answer to a commitment; no press leaves it as a preview.
 */
export const stepHomingLock = (
  lock: HomingLock,
  input: HomingLockInput,
  config: HomingLockConfig,
): HomingLockResult => {
  // Not asked while a dash is in flight: the lock is committed and the trail already says what is
  // happening, and grounded the same button is an ordinary jump, so pointing a reticle at a crystal
  // there would lie about what the press does.
  const candidate = input.airborne && !input.dashInFlight
    ? selectHomingTarget(input.from, input.cameraForward, input.candidates, config)
    : null;
  const crystal = input.dashInFlight ? lock.crystal : (input.jumpPressed ? candidate : null);
  const target = crystal === null ? null : sub(input.candidates[crystal], input.from);

  return {
    lock: {
      crystal,
      // Only ever computed on the frame a crystal is freshly committed; a dash in flight carries its
      // entry estimate forward untouched.
      entrySeconds: input.dashInFlight
        ? lock.entrySeconds
        : (target === null ? null : length(target) / config.homingSpeed),
    },
    target,
    preview: candidate,
  };
};
