import { isOffGround, type JumpPoseInput } from '../babylon/jumpPose';

/**
 * Which jump cue a frame asks the sound bank to play, and the off-ground signal the footstep gate
 * reads — the audio half of the question {@link isOffGround} answers for the pose.
 *
 * Kept out of `hubAudio`'s render observable for the reason `jumpPose` is kept out of
 * `driveKnightAnimation`'s: this is an edge machine whose whole failure mode is one frame long, and a
 * rule reachable only through a live `Scene` plus a decoded sound bank can only be checked by playing
 * the game and listening.
 *
 * It reads {@link isOffGround} rather than `airborne` because `airborne` answers for the *capsule*,
 * and the support probe finds floor mid-dash and beside a crystal low enough to stand at — see
 * `jumpPose.ts` for the machine that decides it and for the two frames it goes false in the middle of
 * a flight. Both of those frames are audible if this layer trusts it: the true→false flip plays
 * `jump.land` at the moment of a homing hit, the false→true flip on the frame after plays
 * `jump.takeoff` mid-bounce, and the same frames un-gate the run cadence at `homingSpeed` in between.
 */
export type JumpSoundCue = 'jump.takeoff' | 'jump.land' | null;

export interface JumpSoundState {
  /**
   * Off the ground as of this frame. Also what the caller gates the footstep cadence on — the state
   * and the answer are the same boolean, so the cue and the gate cannot disagree about the frame.
   */
  readonly offGround: boolean;
}

export interface JumpSoundResult {
  readonly state: JumpSoundState;
  readonly cue: JumpSoundCue;
}

/**
 * The state a frame's reading amounts to on its own, with no edge in it.
 *
 * Exported so the caller can seed from its first sample instead of from a standing pose: starting at
 * `offGround: false` would fire `jump.takeoff` on the first frame of any session that begins in the
 * air.
 */
export const jumpSoundFrom = (input: JumpPoseInput): JumpSoundState => ({
  offGround: isOffGround(input),
});

export const stepJumpSound = (state: JumpSoundState, input: JumpPoseInput): JumpSoundResult => {
  const next = jumpSoundFrom(input);
  return {
    state: next,
    cue:
      next.offGround === state.offGround ? null : next.offGround ? 'jump.takeoff' : 'jump.land',
  };
};
