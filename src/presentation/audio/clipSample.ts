/**
 * The two readings the footstep layer takes off the knight's animation rig.
 *
 * They live here rather than inside `hubAudio.ts` because they are the whole conversion between the
 * babylon rig and the tested domain: `cadenceSample` decides *which* clip to believe and where in the
 * cycle a foot lands, but it only ever sees the four numbers these functions produce. A wrong
 * `from`/`to` span, a sign lost in the phase normalisation, or a weight read off the group instead of
 * the animatable driving it would leave every domain test green and put every footfall at the wrong
 * point in the cycle — the one failure §7 of the audio design spec marks as needing a rendering scene
 * and a pair of ears. Nothing here needs either: both are pure functions of four plain properties, so
 * a plain object pins them (`tests/presentation/clipSample.test.ts`).
 *
 * `AnimationClip` is the shape of those four properties, not a second model of an `AnimationGroup`:
 * a real group satisfies it structurally, which is what the call in `hubAudio.ts` checks at compile
 * time, and it is what lets the test hand these functions an object literal.
 */
export interface AnimationClip {
  readonly isPlaying: boolean;
  readonly from: number;
  readonly to: number;
  readonly animatables: readonly { readonly masterFrame: number; readonly weight: number }[];
}

/**
 * A clip's playback position in [0, 1), or `null` when it is not playing.
 *
 * `null` rather than 0: a stopped clip has no phase at all, and 0 is a real position in the cycle
 * that the cadence would happily fire a step on. The final normalisation is `((p % 1) + 1) % 1` and
 * not a bare `p % 1` because `masterFrame` can sit below `from` — babylon reports the frame of a group
 * that has been restarted or seeded backwards — and `%` in JavaScript keeps the sign of its left
 * operand, so the bare form returns a negative phase that reads as a point the foot never reaches.
 */
export const phaseOf = (clip: AnimationClip): number | null => {
  if (!clip.isPlaying || clip.animatables.length === 0) return null;
  const span = clip.to - clip.from;
  if (span <= 0) return null;
  const p = (clip.animatables[0].masterFrame - clip.from) / span;
  return ((p % 1) + 1) % 1;
};

/**
 * How much of the pose this clip is contributing right now. Zero when it is not playing at all.
 *
 * The weight lives on the *animatable* the group started, not on the group: `driveKnightAnimation`
 * blends the gaits with `setWeightForAllAnimatables`, so the animatable is where the number that
 * actually drives the skeleton ends up.
 */
export const weightOf = (clip: AnimationClip): number =>
  clip.isPlaying && clip.animatables.length > 0 ? clip.animatables[0].weight : 0;
