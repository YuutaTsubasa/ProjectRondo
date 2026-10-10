import { expect, it } from 'vitest';
import { regionMusicScene } from '../../src/domain/region/regionMusic';

it('selects town at spawn and meadow when loading outside', () => {
  expect(regionMusicScene(-35)).toBe('town');
  expect(regionMusicScene(-118)).toBe('meadow');
});
it('fades across the south gate without alternating on boundary jitter', () => {
  expect(regionMusicScene(-64, 'town')).toBe('town');
  expect(regionMusicScene(-66, 'town')).toBe('meadow');
  expect(regionMusicScene(-62, 'meadow')).toBe('meadow');
  expect(regionMusicScene(-60, 'meadow')).toBe('town');
});
