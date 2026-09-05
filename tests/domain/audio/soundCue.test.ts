import { describe, it, expect } from 'vitest';
import { surfaceCue, type SoundCue } from '../../../src/domain/audio/soundCue';

describe('surfaceCue', () => {
  it("returns the correct cue for 'grass'", () => {
    expect(surfaceCue('grass')).toBe('footstep.grass');
  });

  it('returns a value assignable to SoundCue', () => {
    const cue: SoundCue = surfaceCue('grass');
    expect(cue).toBe('footstep.grass');
  });
});
