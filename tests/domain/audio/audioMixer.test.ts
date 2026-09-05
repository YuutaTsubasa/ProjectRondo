import { describe, it, expect } from 'vitest';
import { busGain, DEFAULT_LEVELS, type MixerLevels } from '../../../src/domain/audio/audioMixer';

const levels = (over: Partial<MixerLevels> = {}): MixerLevels => ({ ...DEFAULT_LEVELS, ...over });

describe('busGain', () => {
  it('multiplies the bus level by master', () => {
    expect(busGain(levels({ master: 0.5, sfx: 0.4 }), 'sfx')).toBeCloseTo(0.2);
  });

  it('reads each bus independently', () => {
    const l = levels({ music: 0.2, sfx: 0.4, ambience: 0.6 });
    expect(busGain(l, 'music')).toBeCloseTo(0.2);
    expect(busGain(l, 'sfx')).toBeCloseTo(0.4);
    expect(busGain(l, 'ambience')).toBeCloseTo(0.6);
  });

  it('mute overrides every level', () => {
    expect(busGain(levels({ master: 1, music: 1, muted: true }), 'music')).toBe(0);
  });

  it('clamps levels into [0, 1] rather than trusting the caller', () => {
    expect(busGain(levels({ master: 4, sfx: 4 }), 'sfx')).toBe(1);
    expect(busGain(levels({ sfx: -1 }), 'sfx')).toBe(0);
    expect(busGain(levels({ sfx: Number.POSITIVE_INFINITY }), 'sfx')).toBe(1);
    expect(busGain(levels({ sfx: Number.NEGATIVE_INFINITY }), 'sfx')).toBe(0);
  });

  // The clamp's comparisons are all false for NaN, so it is the one out-of-range value that can reach
  // `AudioBus.volume` unaltered — where a non-finite number is rejected by the AudioParam and takes
  // the bus out. It is also the value a stored mix produces first: `JSON.parse` of a truncated or
  // hand-edited settings blob types cleanly as `number`.
  it('reads a non-finite level as silence rather than passing NaN on to a bus', () => {
    expect(busGain(levels({ master: Number.NaN }), 'music')).toBe(0);
    expect(busGain(levels({ music: Number.NaN }), 'music')).toBe(0);
  });

  it('defaults to unity on every bus', () => {
    expect(busGain(DEFAULT_LEVELS, 'music')).toBe(1);
    expect(busGain(DEFAULT_LEVELS, 'sfx')).toBe(1);
    expect(busGain(DEFAULT_LEVELS, 'ambience')).toBe(1);
  });
});
