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
  readonly dashInFlight: boolean;
  /** Independent attack-key edge. Jump never commits a lock. */
  readonly attackPressed: boolean;
  /** Attack is allowed to become a shield dash (off the ground). */
  readonly pressWouldDash: boolean;
  readonly from: Vec3;
  readonly cameraForward: Vec3;
  readonly candidates: readonly Vec3[];
}
export interface HomingLockResult {
  readonly lock: HomingLock;
  /** Live offset to the committed crystal, recomputed every dash frame. */
  readonly target: Vec3 | null;
  /** What an attack would hit now, independent of the committed lock. */
  readonly preview: number | null;
  /** A fresh attack was committed, so do not also start a sword swing. */
  readonly consumedPress: boolean;
}

/**
 * Advances the lock by one frame.
 *
 * The reticle's question and the lock's are the same question asked of different frames — "what would
 * a press hit from here?" — so they are answered by ONE call to `selectHomingTarget`. A press promotes
 * that answer to a commitment as well as previewing it; no press leaves it a preview only.
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

  // On the ground the attack is a sword swing, so no shield target should be previewed.
  const candidate = input.pressWouldDash
    ? selectHomingTarget(input.from, input.cameraForward, input.candidates, config)
    : null;
  const crystal = input.attackPressed ? candidate : null;
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
