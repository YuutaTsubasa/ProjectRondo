import type { AudioBusId } from './soundCue';

/** The persisted mix as plain data; busGain remains the sole rule for converting it to bus volumes. */
export interface MixerLevels {
  readonly master: number;
  readonly music: number;
  readonly sfx: number;
  readonly ambience: number;
  readonly muted: boolean;
}

export const DEFAULT_LEVELS: MixerLevels = {
  master: 1,
  music: 1,
  sfx: 1,
  ambience: 1,
  muted: false,
};

/**
 * Bounds a level into [0, 1], `NaN` included.
 *
 * Written as "is it above 0, and is it below 1" rather than as two rejections of the out-of-range
 * cases, because `NaN` fails *every* comparison: `NaN < 0` and `NaN > 1` are both false, so a
 * reject-the-extremes clamp falls through to the identity branch and hands `NaN` on. That is the one
 * bad input that does not merely mis-set a bus — a non-finite value is rejected by the underlying
 * `AudioParam`, so it takes the bus out entirely.
 *
 * It maps to 0 rather than to the default of 1: bounding a level is this function's job, inventing
 * one is not. The preference store rejects nonfinite inputs; this remains a final defensive boundary
 * for any other caller. Silence is an output that can neither distort nor throw.
 */
const clamp01 = (v: number): number => (v > 0 ? (v < 1 ? v : 1) : 0);

/**
 * The gain to apply to one bus. Clamps rather than trusting its input: these values come from a
 * slider and validated storage, and a level outside [0, 1] would be a distortion bug rather than
 * an obviously wrong number.
 */
export const busGain = (levels: MixerLevels, bus: AudioBusId): number =>
  levels.muted ? 0 : clamp01(levels.master) * clamp01(levels[bus]);
