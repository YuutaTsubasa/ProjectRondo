import type { AudioBusId } from './soundCue';

/**
 * The mix, as plain data. There is no settings UI yet (spec §9) — this exists so that when there is
 * one, the rules it binds to are already tested, and so the presentation layer has exactly one place
 * to read a bus gain from.
 */
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

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * The gain to apply to one bus. Clamps rather than trusting its input: these values will come from a
 * slider and, later, from storage, and a level outside [0, 1] would be a distortion bug rather than
 * an obviously wrong number.
 */
export const busGain = (levels: MixerLevels, bus: AudioBusId): number =>
  levels.muted ? 0 : clamp01(levels.master) * clamp01(levels[bus]);
