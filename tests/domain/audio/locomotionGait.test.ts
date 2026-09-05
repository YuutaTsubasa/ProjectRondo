import { describe, it, expect } from 'vitest';
import { cadenceSample, type LocomotionReading } from '../../../src/domain/audio/locomotionGait';

/** A rig running flat out on the run clip, which each test then perturbs. */
const reading = (over: Partial<LocomotionReading> = {}): LocomotionReading => ({
  speed: 8,
  walkThreshold: 0.6,
  walkWeight: 0,
  runWeight: 1,
  walkPhase: 0.25,
  runPhase: 0.75,
  airborne: false,
  elapsed: 0.016,
  ...over,
});

describe('cadenceSample', () => {
  it('reads the phase of whichever clip carries the most weight', () => {
    expect(cadenceSample(reading({ walkWeight: 0.2, runWeight: 0.8 }))).toMatchObject({
      gait: 'run',
      phase: 0.75,
    });
    expect(cadenceSample(reading({ walkWeight: 0.8, runWeight: 0.2 }))).toMatchObject({
      gait: 'walk',
      phase: 0.25,
    });
  });

  // The failure this pins: during the cross-fade the run clip is playing from the moment speed
  // passes walking, so "is run playing" would pick run — and its phase is unrelated to the walk
  // pose still on screen, which puts the footfall anywhere in the cycle.
  it('stays on walk while the run clip is playing but not yet driving the pose', () => {
    expect(cadenceSample(reading({ walkWeight: 0.9, runWeight: 0.1 })).gait).toBe('walk');
  });

  it('gives an exact weight tie to walk, the clip that has not been handed over from', () => {
    expect(cadenceSample(reading({ walkWeight: 0.5, runWeight: 0.5 })).gait).toBe('walk');
  });

  it('is idle at or below the walk threshold however the clips are blended', () => {
    expect(cadenceSample(reading({ speed: 0.6 }))).toMatchObject({ gait: 'idle', phase: 0 });
    expect(cadenceSample(reading({ speed: 0.61 })).gait).toBe('run');
  });

  // Phase 0 is a real position in the cycle, and a walk contact sits near it — so a missing phase
  // has to become idle rather than a footfall at 0.
  it('is idle when the dominant clip has no phase to read', () => {
    expect(cadenceSample(reading({ runPhase: null }))).toMatchObject({ gait: 'idle', phase: 0 });
  });

  it('does not fall back to the other clip when the dominant one has no phase', () => {
    expect(cadenceSample(reading({ runPhase: null, walkPhase: 0.25 })).phase).toBe(0);
  });

  it('passes airborne and elapsed through untouched', () => {
    expect(cadenceSample(reading({ airborne: true, elapsed: 0.033 }))).toMatchObject({
      airborne: true,
      elapsed: 0.033,
    });
  });
});
