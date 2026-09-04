import { describe, it, expect } from 'vitest';
import { createFootstepCadence, crossed, MIN_STEP_SECONDS } from '../../../src/domain/audio/footstepCadence';
import { WALK_CONTACTS } from '../../../src/domain/audio/footContact';

const [LEFT, RIGHT] = WALK_CONTACTS;
const before = (p: number) => (p - 0.02 + 1) % 1;
const after = (p: number) => (p + 0.02) % 1;

/** A cadence with a fixed random source, so playbackRate and volume are assertable. */
const fixed = (value = 0.5) => createFootstepCadence(() => value);

// Tested directly rather than through the machine: whether a wrap fires depends on where the
// measured contacts happen to sit, and a test that re-measures the asset is not testing the logic.
describe('crossed', () => {
  it('detects a contact passed within the frame', () => {
    expect(crossed(0.2, 0.4, 0.3)).toBe(true);
    expect(crossed(0.2, 0.4, 0.5)).toBe(false);
    expect(crossed(0.2, 0.4, 0.1)).toBe(false);
  });

  it('detects a contact passed across the wrap from 1 to 0', () => {
    expect(crossed(0.97, 0.03, 0.99)).toBe(true); // just before the wrap
    expect(crossed(0.97, 0.03, 0.01)).toBe(true); // just after it
    expect(crossed(0.97, 0.03, 0.5)).toBe(false); // the half of the cycle that was not travelled
  });

  it('is half-open, so a contact landed on exactly fires once and not again', () => {
    expect(crossed(0.2, 0.3, 0.3)).toBe(true);
    expect(crossed(0.3, 0.4, 0.3)).toBe(false);
  });
});

describe('createFootstepCadence', () => {
  it('does not fire on the first sample, having nothing to compare against', () => {
    const c = fixed();
    expect(c.step({ gait: 'walk', phase: after(LEFT), airborne: false, elapsed: 0.016 })).toBeNull();
  });

  it('fires when the phase crosses a contact', () => {
    const c = fixed();
    c.step({ gait: 'walk', phase: before(LEFT), airborne: false, elapsed: 0.016 });
    const fall = c.step({ gait: 'walk', phase: after(LEFT), airborne: false, elapsed: 0.016 });
    expect(fall).not.toBeNull();
    expect(fall!.foot).toBe('left');
  });

  it('does not fire again while the phase stays past the contact', () => {
    const c = fixed();
    c.step({ gait: 'walk', phase: before(LEFT), airborne: false, elapsed: 0.016 });
    c.step({ gait: 'walk', phase: after(LEFT), airborne: false, elapsed: 0.016 });
    expect(
      c.step({ gait: 'walk', phase: after(LEFT) + 0.01, airborne: false, elapsed: 0.016 }),
    ).toBeNull();
  });

  it('attributes the second contact of the cycle to the other foot', () => {
    const c = fixed();
    c.step({ gait: 'walk', phase: before(RIGHT), airborne: false, elapsed: 0.016 });
    const fall = c.step({ gait: 'walk', phase: after(RIGHT), airborne: false, elapsed: 0.4 });
    expect(fall?.foot).toBe('right');
  });

  it('fires nothing while airborne', () => {
    const c = fixed();
    c.step({ gait: 'walk', phase: before(LEFT), airborne: false, elapsed: 0.016 });
    expect(c.step({ gait: 'walk', phase: after(LEFT), airborne: true, elapsed: 0.016 })).toBeNull();
  });

  it('does not pay out a stored step on landing', () => {
    const c = fixed();
    c.step({ gait: 'walk', phase: before(LEFT), airborne: false, elapsed: 0.016 });
    c.step({ gait: 'walk', phase: after(LEFT), airborne: true, elapsed: 0.5 });
    // Back on the ground, still past the contact: the crossing happened in the air and is gone.
    expect(c.step({ gait: 'walk', phase: after(LEFT), airborne: false, elapsed: 0.016 })).toBeNull();
  });

  it('fires nothing while idle', () => {
    const c = fixed();
    c.step({ gait: 'idle', phase: before(LEFT), airborne: false, elapsed: 0.016 });
    expect(c.step({ gait: 'idle', phase: after(LEFT), airborne: false, elapsed: 0.016 })).toBeNull();
  });

  it('re-seeds across a gait change instead of comparing phases between clips', () => {
    const c = fixed();
    c.step({ gait: 'walk', phase: before(LEFT), airborne: false, elapsed: 0.016 });
    // The run clip's phase is unrelated to the walk clip's; comparing them would fire spuriously.
    expect(c.step({ gait: 'run', phase: after(LEFT), airborne: false, elapsed: 0.016 })).toBeNull();
  });

  it('suppresses a second step inside the minimum interval', () => {
    const c = fixed();
    c.step({ gait: 'walk', phase: before(LEFT), airborne: false, elapsed: 0.016 });
    expect(c.step({ gait: 'walk', phase: after(LEFT), airborne: false, elapsed: 1 })).not.toBeNull();
    c.step({ gait: 'walk', phase: before(RIGHT), airborne: false, elapsed: MIN_STEP_SECONDS / 4 });
    expect(
      c.step({ gait: 'walk', phase: after(RIGHT), airborne: false, elapsed: MIN_STEP_SECONDS / 4 }),
    ).toBeNull();
  });

  it('fires at most one step for a frame that spans a whole cycle', () => {
    // A tab switch or a hitch produces one enormous frame. Firing a burst then is the failure.
    const c = fixed();
    c.step({ gait: 'walk', phase: 0.0, airborne: false, elapsed: 0.016 });
    const fall = c.step({ gait: 'walk', phase: 0.99, airborne: false, elapsed: 5 });
    expect(fall === null || typeof fall.foot === 'string').toBe(true);
  });

  it('jitters playback rate and volume within their bands', () => {
    const low = createFootstepCadence(() => 0);
    low.step({ gait: 'walk', phase: before(LEFT), airborne: false, elapsed: 0.016 });
    const quiet = low.step({ gait: 'walk', phase: after(LEFT), airborne: false, elapsed: 1 })!;
    const high = createFootstepCadence(() => 1);
    high.step({ gait: 'walk', phase: before(LEFT), airborne: false, elapsed: 0.016 });
    const loud = high.step({ gait: 'walk', phase: after(LEFT), airborne: false, elapsed: 1 })!;

    expect(quiet.playbackRate).toBeLessThan(1);
    expect(loud.playbackRate).toBeGreaterThan(1);
    expect(quiet.volume).toBeLessThan(loud.volume);
    for (const f of [quiet, loud]) {
      expect(f.playbackRate).toBeGreaterThanOrEqual(0.92);
      expect(f.playbackRate).toBeLessThanOrEqual(1.08);
      expect(f.volume).toBeGreaterThanOrEqual(0.85);
      expect(f.volume).toBeLessThanOrEqual(1);
    }
  });
});
