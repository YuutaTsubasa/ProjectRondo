import { describe, it, expect } from 'vitest';
import { musicChange, CROSSFADE_SECONDS } from '../../../src/domain/audio/musicDirector';

describe('musicChange', () => {
  it('starts the AVG theme when nothing is playing during the intro', () => {
    expect(musicChange(null, 'intro')).toEqual({ track: 'music.avg', fadeSeconds: CROSSFADE_SECONDS });
  });

  it('starts the hub theme when nothing is playing during gameplay', () => {
    expect(musicChange(null, 'playing')).toEqual({ track: 'music.hub', fadeSeconds: CROSSFADE_SECONDS });
  });

  it('crosses from the AVG theme to the hub theme when the intro ends', () => {
    expect(musicChange('music.avg', 'playing')).toEqual({
      track: 'music.hub',
      fadeSeconds: CROSSFADE_SECONDS,
    });
  });

  it('asks for nothing while the right track is already playing', () => {
    expect(musicChange('music.avg', 'intro')).toBeNull();
    expect(musicChange('music.hub', 'playing')).toBeNull();
  });
});

// The town loop must not replace the meadow or expedition music.
it('uses a dedicated town cue and keeps it running on repeated requests', () => {
  expect(musicChange(null, 'town')).toEqual({ track: 'music.town', fadeSeconds: CROSSFADE_SECONDS });
  expect(musicChange('music.town', 'town')).toBeNull();
  expect(musicChange('music.town', 'playing')?.track).toBe('music.hub');
});

it('uses the meadow cue for exploration without replacing expedition music', () => {
  expect(musicChange('music.town', 'meadow')?.track).toBe('music.meadow');
  expect(musicChange('music.meadow', 'meadow')).toBeNull();
  expect(musicChange('music.meadow', 'town')?.track).toBe('music.town');
  expect(musicChange('music.meadow', 'playing')?.track).toBe('music.hub');
});

for (const scene of ['palace', 'course'] as const) {
  it(`uses a dedicated ${scene} cue and does not restart it`, () => {
    expect(musicChange(null, scene)?.track).toBe(`music.${scene}`);
    expect(musicChange(`music.${scene}`, scene)).toBeNull();
    expect(musicChange(`music.${scene}`, 'town')?.track).toBe('music.town');
  });
}
