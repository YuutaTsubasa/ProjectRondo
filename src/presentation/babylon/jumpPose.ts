/**
 * Whether the knight is off the ground *as far as its pose is concerned*, and which segment of the
 * jump clip a frame asks to start.
 *
 * Pure, and kept out of `driveKnightAnimation`'s render observable for the reason `groundContact`,
 * `homingLock` and `slopeMotion` are kept out of `playerController`'s: a rule reachable only through
 * a live Babylon scene can only be checked by playing the game, and this one is an edge machine
 * whose whole failure mode is one frame long.
 *
 * It exists because `GroundContactResult.airborne` is not this signal, though the animation layer
 * used to assume it was. `airborne` answers for the *capsule*, and the support probe finds floor
 * during a homing dash: the skim `slopeMotion` records mid-dash, and the floor under a crystal low
 * enough to stand beside. A dash frame is neither `jumpRequested` nor `bounced`, so
 * `stepGroundContact` lets a single `supported: true` probe frame settle the contact to `grounded` —
 * which on the arrival frame over a low crystal leaves `airborne` false while the knight is visibly
 * in flight. Two things went wrong there, both only in the low-crystal chain the bounce path exists
 * for: the jump clip was started twice (`bounced` restarted it at the bounce seam, then the next
 * frame — where `GroundContactInput.bounced` forces `rising` and `airborne` flips back on — the
 * airborne rising edge restarted the same group from the launch seam, discarding the bounce start
 * one frame after making it), and the feet eased back toward planted under a knight that had not
 * landed.
 *
 * So the pose asks a question the probe cannot answer wrongly. A dash and the bounce that ends it
 * are off the ground by construction, whatever the probe found underneath, and the signal that
 * results has no gap for an edge to fire in.
 */

export interface JumpPoseInput {
  /** `GroundContactResult.airborne` — the debounced capsule verdict, true for a whole jump. */
  readonly airborne: boolean;
  /** A homing dash is in flight this frame (`KnightMotionSample.homing`). */
  readonly homing: boolean;
  /**
   * The dash arrived and the domain handed out its bounce this frame (`KnightMotionSample.bounced`).
   *
   * The bounce is read from this and never from {@link homing}'s falling edge: `homing` clears on a
   * timeout too, and a timeout is the case that must play nothing — the domain has already zeroed the
   * velocity, so the knight just resumes falling. And a dash short enough to arrive on its own entry
   * frame never raises `homing` at all, yet still bounces.
   */
  readonly bounced: boolean;
}

/** Which segment of the jump clip this frame asks to (re)start, or null to leave the clip alone. */
export type JumpClipCue = 'launch' | 'bounce' | null;

export interface JumpPoseState {
  /**
   * Off the ground for the pose: airborne, or dashing, or bouncing. Also what the caller reads each
   * frame — the state and the answer are the same boolean, so they cannot disagree.
   */
  readonly offGround: boolean;
}

export const INITIAL_JUMP_POSE: JumpPoseState = { offGround: false };

export interface JumpPoseResult {
  readonly state: JumpPoseState;
  readonly cue: JumpClipCue;
}

export const stepJumpPose = (state: JumpPoseState, input: JumpPoseInput): JumpPoseResult => {
  const offGround = input.airborne || input.homing || input.bounced;
  return {
    state: { offGround },
    // A bounce outranks the rising edge on any frame that raises both — a dash short enough to
    // arrive on its own entry frame never sets `homing`, so its bounce frame is the first off-ground
    // frame as well as the arrival, and the bounce seam is the one that describes what is happening.
    cue: input.bounced ? 'bounce' : (offGround && !state.offGround ? 'launch' : null),
  };
};
