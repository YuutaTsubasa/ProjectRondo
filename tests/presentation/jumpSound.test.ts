import { describe, it, expect } from 'vitest';
import {
  stepJumpSound, jumpSoundFrom, type JumpSoundState,
} from '../../src/presentation/audio/jumpSound';
import { type JumpPoseInput } from '../../src/presentation/babylon/jumpPose';
import {
  stepGroundContact, INITIAL_GROUND_CONTACT, type GroundContactInput, type GroundContactState,
} from '../../src/presentation/babylon/groundContact';

const DT = 1 / 60;

const frame = (overrides: Partial<JumpPoseInput> = {}): JumpPoseInput => ({
  airborne: false,
  homing: false,
  bounced: false,
  ...overrides,
});

/** Runs the frames in order, seeded from the first one the way `hubAudio` seeds from its first sample. */
const run = (inputs: readonly JumpPoseInput[]) => {
  let state: JumpSoundState = jumpSoundFrom(inputs[0]);
  return inputs.map((input) => {
    const result = stepJumpSound(state, input);
    state = result.state;
    return result;
  });
};

describe('stepJumpSound', () => {
  it('plays the take-off on the frame the knight leaves the ground, and the landing on touchdown', () => {
    const [, takeoff, , land] = run([
      frame(),
      frame({ airborne: true }),
      frame({ airborne: true }),
      frame(),
    ]);
    expect(takeoff.cue).toBe('jump.takeoff');
    expect(land.cue).toBe('jump.land');
  });

  it('plays nothing while a flight simply continues', () => {
    const [, , third] = run([frame(), frame({ airborne: true }), frame({ airborne: true })]);
    expect(third.cue).toBeNull();
  });

  it('says nothing on the first frame of a session that starts in the air', () => {
    const [first] = run([frame({ airborne: true })]);
    expect(first.cue).toBeNull();
  });

  it('stays silent through a probe frame that finds floor mid-dash', () => {
    // The skim `slopeMotion` records. On the bare `airborne` flag this is a landing sound followed by
    // a take-off, both in the middle of a flight.
    const [, skim, after] = run([
      frame({ airborne: true, homing: true }),
      frame({ airborne: false, homing: true }),
      frame({ airborne: true, homing: true }),
    ]);
    expect(skim.cue).toBeNull();
    expect(after.cue).toBeNull();
    expect(skim.state.offGround).toBe(true);
  });
});

/** Defaults for a frame of the real ground machine, so each case states only what it changes. */
const contactFrame = (overrides: Partial<GroundContactInput> = {}): GroundContactInput => ({
  supported: false,
  jumpPressed: false,
  dashInFlight: false,
  verticalSpeed: 0,
  bounced: false,
  delta: DT,
  ...overrides,
});

describe('stepJumpSound, against the ground machine on a low-crystal arrival', () => {
  /**
   * The same two frames `jumpPose.test.ts` pins: jump, rise, fall, then arrive at a crystal low
   * enough that the support probe finds floor beside it. Driven through the real `stepGroundContact`
   * rather than asserted, because the whole point is what that machine reports on those frames —
   * `airborne` false on the arrival, true again on the bounce.
   */
  const arrival = (): { onArrival: boolean; onBounce: boolean } => {
    let state: GroundContactState = INITIAL_GROUND_CONTACT;
    const step = (input: GroundContactInput) => {
      const result = stepGroundContact(state, input);
      state = result.state;
      return result;
    };
    step(contactFrame({ supported: true, jumpPressed: true }));
    step(contactFrame({ verticalSpeed: 9 }));
    step(contactFrame({ verticalSpeed: -1 }));
    const onArrival = step(contactFrame({ supported: true, dashInFlight: true, verticalSpeed: 24 }));
    const onBounce = step(contactFrame({ supported: true, bounced: true, verticalSpeed: 9 }));
    return { onArrival: onArrival.airborne, onBounce: onBounce.airborne };
  };

  it('plays no landing at the moment of the hit, and no take-off on the bounce frame', () => {
    const { onArrival, onBounce } = arrival();
    // `homing` is false on the arrival frame — presentation reads it after the domain step that ended
    // the dash — while `bounced` is true for exactly that frame.
    const [, arrivalCue, bounceCue] = run([
      frame({ airborne: true, homing: true }),
      frame({ airborne: onArrival, bounced: true }),
      frame({ airborne: onBounce }),
    ]);
    expect(arrivalCue.cue).toBeNull();
    expect(bounceCue.cue).toBeNull();
  });

  it('keeps the footstep gate closed across both frames', () => {
    const { onArrival, onBounce } = arrival();
    const [, arrivalCue, bounceCue] = run([
      frame({ airborne: true, homing: true }),
      frame({ airborne: onArrival, bounced: true }),
      frame({ airborne: onBounce }),
    ]);
    expect(arrivalCue.state.offGround).toBe(true);
    expect(bounceCue.state.offGround).toBe(true);
  });

  it('still lands when the bounce finally comes down', () => {
    const { onArrival, onBounce } = arrival();
    const [, , , touchdown] = run([
      frame({ airborne: true, homing: true }),
      frame({ airborne: onArrival, bounced: true }),
      frame({ airborne: onBounce }),
      frame(),
    ]);
    expect(touchdown.cue).toBe('jump.land');
  });
});
