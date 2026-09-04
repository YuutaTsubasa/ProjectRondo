import { describe, it, expect } from 'vitest';
import { WIND_DIRECTION_X, WIND_DIRECTION_Z } from '../../../src/domain/hub/windDirection';

describe('the hub wind direction', () => {
  // Not a tautology about arithmetic: `wind.ts` binds this pair as `windPhase.xy` and uses it twice in
  // one shader — as the phase direction, where the length rescales what SPATIAL_FREQ means, and as the
  // displacement direction, where it rescales the amplitude every call site was tuned against. An edit
  // to a direction that merely looks reasonable, (1, 1) say, changes the wind's strength by 41% while
  // reading as a change of bearing. Exact equality, not a tolerance: the shipped pair is exact, and a
  // successor that is only approximately unit has already given up the property this pins.
  it('is exactly unit length', () => {
    expect(WIND_DIRECTION_X * WIND_DIRECTION_X + WIND_DIRECTION_Z * WIND_DIRECTION_Z).toBe(1);
  });

  it('actually points somewhere — neither component is zero', () => {
    expect(WIND_DIRECTION_X).not.toBe(0);
    expect(WIND_DIRECTION_Z).not.toBe(0);
  });
});
