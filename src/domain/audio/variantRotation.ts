import { type SoundCue } from './soundCue';

export interface VariantRotation {
  /**
   * The variant index for this play of `cue`, then advances that cue's counter.
   *
   * Unbounded and never reduced here: how many recordings a cue actually has is the sound bank's
   * business, and `pick` takes the index modulo the file count — so a cue with one file is
   * unaffected and a cue that gains a fourth recording starts using it without a change here.
   */
  next(cue: SoundCue): number;
}

/**
 * Rotates each cue through its recordings, one counter per cue.
 *
 * Its own module for the reason `musicCrossfade` is one: the caller is `hubAudio`, which cannot be
 * constructed without a babylon `Scene`, a loaded knight and a real `AudioContext`, so anything left
 * inside it is reachable only by ear. What that costs is not hypothetical — a counter shared across
 * cues, reset on every call, or handed to `pick` one out of step all sound like a cue that repeats
 * more than it should, which is exactly the kind of thing nobody files a bug about. `soundBank`'s
 * own tests pin that `pick` wraps; nothing pinned that anything advances the index.
 *
 * In the domain rather than beside `hubAudio`, unlike `musicCrossfade`: this needs no collaborator,
 * no engine type and no IO, which is the line `src/domain` is drawn on — `footstepCadence` is the
 * same shape.
 */
export function createVariantRotation(): VariantRotation {
  const counts = new Map<SoundCue, number>();
  return {
    next(cue) {
      const n = counts.get(cue) ?? 0;
      counts.set(cue, n + 1);
      return n;
    },
  };
}
