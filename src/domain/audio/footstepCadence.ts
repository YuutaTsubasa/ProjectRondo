import { RUN_CONTACTS, WALK_CONTACTS } from './footContact';

export type Gait = 'idle' | 'walk' | 'run';

/** What the animation layer knows each frame, reduced to what the cadence needs. */
export interface CadenceSample {
  readonly gait: Gait;
  /** The dominant locomotion clip's playback position, normalised to [0, 1). */
  readonly phase: number;
  readonly airborne: boolean;
  /** Seconds since the previous sample. */
  readonly elapsed: number;
}

/** One footfall. The caller turns this into an armour layer plus a surface layer. */
export interface Footfall {
  readonly foot: 'left' | 'right';
  readonly playbackRate: number;
  readonly volume: number;
}

export interface FootstepCadence {
  /** The footfall that happened since the previous sample, or `null`. At most one per call. */
  step(sample: CadenceSample): Footfall | null;
}

/**
 * The shortest gap between two footsteps.
 *
 * Run's cycle is 0.633 s, and its two footfalls sit 0.42 of a cycle apart (`RUN_CONTACTS`, not the
 * 0.5 an evenly-spaced gait would give), so the real gap between them is 0.266 s — this sits
 * comfortably below that and so never suppresses a real step. What it does suppress is the walk↔run
 * handover: for the few hundred milliseconds where the blend crosses over, the machine re-seeds onto
 * the new clip at whatever phase that clip happens to be at, which can land just before one of its
 * contacts and produce a second step within a few frames of the last one.
 */
export const MIN_STEP_SECONDS = 0.2;

/** Playback-rate band for the jitter. ±8 % is audible as variation, not as a wrong pitch. */
const RATE_MIN = 0.92;
const RATE_MAX = 1.08;
/** Volume band. Only downward: the samples are peak-normalised, so 1 is the intended level. */
const VOLUME_MIN = 0.85;
const VOLUME_MAX = 1;

/**
 * Whether `contact` lies in the half-open interval (prev, next], going forwards and wrapping at 1.
 *
 * Exported for its own tests: the wrap is the one piece of arithmetic here that a test driving the
 * whole machine cannot pin down, because whether any given frame wraps past a contact depends on
 * where the measured contacts happen to sit in the clip.
 */
export const crossed = (prev: number, next: number, contact: number): boolean =>
  next >= prev
    ? contact > prev && contact <= next
    : contact > prev || contact <= next; // the phase wrapped past 1

/**
 * Turns the locomotion clip's playback phase into footfalls.
 *
 * Phase-locked rather than distance-accumulated — see {@link WALK_CONTACTS} for why the obvious
 * design does not work here.
 *
 * `random` is injected so the jitter is testable, and is deliberately **not** a seeded generator:
 * footstep variation has no reason to be reproducible the way terrain layout does, and taking a
 * dependency on `src/domain/math/rng.ts` would collide with the branch that is adding it.
 */
export function createFootstepCadence(random: () => number = Math.random): FootstepCadence {
  let lastPhase: number | null = null;
  let lastGait: Gait = 'idle';
  let sinceStep = Infinity;

  return {
    step({ gait, phase, airborne, elapsed }) {
      sinceStep += elapsed;

      // Airborne and idle both clear the phase rather than just skipping the check: keeping it would
      // let the crossing that happened mid-air (or mid-idle-sway) pay out on the frame the state
      // ends, which is a step sound with no step under it.
      if (airborne || gait === 'idle') {
        lastPhase = null;
        lastGait = gait;
        return null;
      }

      // The walk and run clips have unrelated phases, so a change of gait re-seeds instead of
      // comparing across them.
      if (gait !== lastGait) {
        lastGait = gait;
        lastPhase = phase;
        return null;
      }

      const prev = lastPhase;
      lastPhase = phase;
      if (prev === null) return null;

      const contacts = gait === 'run' ? RUN_CONTACTS : WALK_CONTACTS;
      // Left is checked first, so a frame long enough to span both contacts still yields one
      // footfall rather than a burst.
      const index = contacts.findIndex((c) => crossed(prev, phase, c));
      if (index < 0 || sinceStep < MIN_STEP_SECONDS) return null;

      sinceStep = 0;
      return {
        foot: index === 0 ? 'left' : 'right',
        playbackRate: RATE_MIN + random() * (RATE_MAX - RATE_MIN),
        volume: VOLUME_MIN + random() * (VOLUME_MAX - VOLUME_MIN),
      };
    },
  };
}
