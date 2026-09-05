import type { CadenceSample } from './footstepCadence';

/**
 * What the animation layer can read off a locomotion rig each frame, before any of it has been
 * interpreted.
 *
 * Weights and phases arrive per clip because the two clips are unrelated: their phases do not line
 * up, so deciding *which* to read is the whole problem this module exists to solve. A phase is
 * `null` when its clip is not playing.
 */
export interface LocomotionReading {
  /** Planar speed, in world units per second. */
  readonly speed: number;
  /** At or below this speed the character is standing, whatever the clips are doing. */
  readonly walkThreshold: number;
  readonly walkWeight: number;
  readonly runWeight: number;
  readonly walkPhase: number | null;
  readonly runPhase: number | null;
  readonly airborne: boolean;
  /** Seconds since the previous reading. */
  readonly elapsed: number;
}

/**
 * Reduces a frame of the locomotion rig to the sample {@link createFootstepCadence} consumes.
 *
 * Three decisions live here, and all three are wrong in ways that are inaudible in a unit test of
 * the cadence itself but very audible in the game:
 *
 * - **Which clip is driving the pose**, by blend weight. "Run is playing at all" is not the same
 *   question: the cross-fade starts the run clip the moment speed passes walking, so for the whole
 *   handover it is playing while the walk pose is still what is on screen — and the two clips'
 *   phases are unrelated, so reading the wrong one puts the sound anywhere in the cycle. The tie
 *   goes to walk, because at equal weight the run clip has not taken over yet.
 * - **Standing still wins over both.** Below `walkThreshold` the rig may still be blending a
 *   locomotion clip down to nothing; footfalls from it are steps with no step under them.
 * - **A clip with no phase is idle**, not a footfall at phase 0 — phase 0 is a real position in the
 *   cycle and one of the walk contacts sits near it.
 */
export const cadenceSample = (reading: LocomotionReading): CadenceSample => {
  const { speed, walkThreshold, walkWeight, runWeight, airborne, elapsed } = reading;
  const running = runWeight > walkWeight;
  const phase = running ? reading.runPhase : reading.walkPhase;
  if (speed <= walkThreshold || phase === null) return { gait: 'idle', phase: 0, airborne, elapsed };
  return { gait: running ? 'run' : 'walk', phase, airborne, elapsed };
};
