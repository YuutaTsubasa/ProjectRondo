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
 *
 * A union rather than a crystal and a duration that are each independently nullable, for the reason
 * `GroundContact` gives in `groundContact.ts`: the two are never independent — the estimate is derived
 * from the very offset that picks the crystal — so a lock carrying one without the other means
 * nothing, and must not be constructible. `knight.ts` still guards its own arrival of these two, and
 * has to: they reach it through `KnightMotionSample` as separate fields, which this type cannot narrow
 * across.
 */
export type HomingLock =
  /** Nothing is locked: no dash is committed, and there is no duration to estimate. */
  | { readonly kind: 'idle' }
  | {
    readonly kind: 'locked';
    /** Index into the candidate list the lock was built from. */
    readonly crystal: number;
    /**
     * How long the locked dash is expected to take, in seconds: the straight-line distance at lock
     * time over `homingSpeed`. Fixed for the dash's whole flight rather than recomputed — a dash that
     * corrects course (design spec §4) keeps changing the live distance a recomputation would divide
     * by, and `knight.ts` reads this once, to retime the Flying Kick clip onto the dash's real screen
     * time.
     */
    readonly entrySeconds: number;
  };

export const NO_HOMING_LOCK: HomingLock = { kind: 'idle' };

/** The three numbers a lock needs: the two selection reads, plus the speed the estimate divides by. */
export interface HomingLockConfig extends HomingSelectionConfig {
  readonly homingSpeed: number;
}

export interface HomingLockInput {
  /** `CharacterMotion.homing !== null` from last frame's result: a dash is already under way. */
  readonly dashInFlight: boolean;
  /**
   * The jump key-press consumed this frame. It asks for a dash only where the ground machine has
   * already declined it as a jump — see {@link pressWouldDash}.
   */
  readonly jumpPressed: boolean;
  /**
   * Would a press right now become a dash rather than an ordinary jump —
   * `!GroundContactResult.jumpAvailable`, which already folds coyote time, the jump buffer's takeoff
   * guard and the dash's own frames in.
   *
   * Deliberately NOT `GroundContactResult.airborne`: that is the *animation* debounce, held false
   * for `FALL_GRACE_SECONDS` 0.2 s so a two-frame hop does not throw a fall pose, while a jump stops
   * being legal at `COYOTE_SECONDS` 0.15 s. Gating on the debounce therefore left the 0.15–0.2 s of
   * an uncommanded fall refusing both — the press was consumed, became no jump, and never reached
   * this machine either.
   *
   * And deliberately not `!grounded`, which closes that gap for a press but not for the reticle,
   * which answers on frames with no press: `grounded` folds this frame's `jumpRequested` in, so
   * through the coyote window of an uncommanded fall it is false with no press and true with one —
   * the ring would light on a crystal that the very next frame's press jumps past instead of flying
   * to. Asking whether a jump is *available* answers the press frame and the frames before it the
   * same way: exactly one of a jump and a dash takes any press, never neither.
   */
  readonly pressWouldDash: boolean;
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
   * crystal a {@link HomingLock} is committed to: the lock must not move mid-dash, while the reticle
   * has to answer on every frame, including frames with no press at all.
   */
  readonly preview: number | null;
  /**
   * This frame's press was spent HERE, as the start of a fresh dash. The ground machine has to be told,
   * because it runs first — it is the one that answers {@link HomingLockInput.pressWouldDash} — and so
   * it has already buffered the press by the time this is known. See `groundContact`'s
   * `spendBufferedJump`, which retracts it; without that the press the lock took also stayed live for
   * a further `JUMP_BUFFER_SECONDS` and came back as a second, unrequested jump.
   *
   * False for every press the lock *declines* — mid-dash, or with no crystal in the cone — which is
   * exactly the set `groundContact`'s problem 5 keeps buffered.
   */
  readonly consumedPress: boolean;
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
  // A dash in flight neither re-selects nor re-estimates: the lock is carried through whole, which is
  // also what keeps its entry estimate the press-frame one. No reticle either — the lock is committed
  // and the trail already says what is happening — and no press is spent, since a crystal held from an
  // earlier frame is not a press being taken.
  if (input.dashInFlight) {
    return {
      lock,
      target: lock.kind === 'locked' ? sub(input.candidates[lock.crystal], input.from) : null,
      preview: null,
      consumedPress: false,
    };
  }

  // Wherever the press would still be taken as a jump — grounded, or anywhere the coyote window is
  // open — pointing a reticle at a crystal would lie about what the press does.
  const candidate = input.pressWouldDash
    ? selectHomingTarget(input.from, input.cameraForward, input.candidates, config)
    : null;
  const crystal = input.jumpPressed ? candidate : null;
  if (crystal === null) {
    return { lock: NO_HOMING_LOCK, target: null, preview: candidate, consumedPress: false };
  }

  const target = sub(input.candidates[crystal], input.from);
  return {
    lock: { kind: 'locked', crystal, entrySeconds: length(target) / config.homingSpeed },
    target,
    preview: candidate,
    consumedPress: true,
  };
};
