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
