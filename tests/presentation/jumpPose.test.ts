import { describe, it, expect } from 'vitest';
import {
  stepJumpPose, INITIAL_JUMP_POSE, type JumpPoseInput, type JumpPoseState,
} from '../../src/presentation/babylon/jumpPose';
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

/** Runs the frames in order and returns each frame's result alongside the state it produced. */
const run = (inputs: readonly JumpPoseInput[], from: JumpPoseState = INITIAL_JUMP_POSE) => {
  let state = from;
  return inputs.map((input) => {
    const result = stepJumpPose(state, input);
    state = result.state;
    return result;
  });
};

describe('stepJumpPose', () => {
  it('starts the launch segment on the frame the knight leaves the ground', () => {
    const [standing, takeoff] = run([frame(), frame({ airborne: true })]);
    expect(standing.cue).toBeNull();
    expect(takeoff.cue).toBe('launch');
  });

  it('asks for nothing while a flight simply continues', () => {
    const [, , third] = run([frame(), frame({ airborne: true }), frame({ airborne: true })]);
    expect(third.cue).toBeNull();
  });

  it('restarts at the bounce seam when a dash arrives', () => {
    const [, arrival] = run([
      frame({ airborne: true, homing: true }),
      frame({ airborne: true, bounced: true }),
    ]);
    expect(arrival.cue).toBe('bounce');
  });

  it('plays nothing when a dash times out — the domain already zeroed the velocity', () => {
    const [, timeout] = run([frame({ airborne: true, homing: true }), frame({ airborne: true })]);
    expect(timeout.cue).toBeNull();
  });

  it('answers a bounce, not a launch, for a dash that arrives on its own entry frame', () => {
    // Such a dash never raises `homing`, so its arrival is also the first off-ground frame this
    // machine sees — the launch edge and the bounce both want it, and the bounce is the truth.
    const [, entryFrameArrival] = run([frame(), frame({ bounced: true })]);
    expect(entryFrameArrival.cue).toBe('bounce');
  });

  it('stays off the ground through a probe frame that finds floor mid-dash', () => {
    // The skim `slopeMotion` records. `airborne` drops for the single frame; the pose must not, or the
    // feet re-plant under a knight in flight and the frame after it reads as a fresh takeoff.
    const [, skim, after] = run([
      frame({ airborne: true, homing: true }),
      frame({ airborne: false, homing: true }),
      frame({ airborne: true, homing: true }),
    ]);
    expect(skim.state.offGround).toBe(true);
    expect(after.cue).toBeNull();
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

describe('stepJumpPose, against the ground machine on a low-crystal arrival', () => {
  /**
   * Jump, rise, fall — the state a dash starts from — then arrive at a crystal low enough that the
   * support probe finds floor beside it. Driven through the real `stepGroundContact` rather than
   * asserted, because the whole point is what that machine reports on those two frames.
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
    // The arrival: last frame's dash is still what `dashInFlight` reports, and the floor under the
    // crystal is within probe reach. The domain hands out the bounce at the end of this frame.
    const onArrival = step(contactFrame({ supported: true, dashInFlight: true, verticalSpeed: 24 }));
    // The frame after, where `GroundContactInput.bounced` finally protects the climb.
    const onBounce = step(contactFrame({ supported: true, bounced: true, verticalSpeed: 9 }));
    return { onArrival: onArrival.airborne, onBounce: onBounce.airborne };
  };

  it('is the case where `airborne` goes false in the middle of a flight', () => {
    const { onArrival, onBounce } = arrival();
    expect(onArrival).toBe(false);
    expect(onBounce).toBe(true);
  });

  it('does not let the airborne edge after a bounce discard the seam the bounce placed', () => {
    const { onArrival, onBounce } = arrival();
    // `homing` is false on the arrival frame — presentation reads it after the domain step that
    // ended the dash — while `bounced` is true for exactly that frame.
    const [arrivalPose, bouncePose] = run([
      frame({ airborne: onArrival, bounced: true }),
      frame({ airborne: onBounce }),
    ]);
    expect(arrivalPose.cue).toBe('bounce');
    expect(bouncePose.cue).toBeNull();
  });

  it('keeps the feet off the ground across both frames', () => {
    const { onArrival, onBounce } = arrival();
    const [arrivalPose, bouncePose] = run([
      frame({ airborne: onArrival, bounced: true }),
      frame({ airborne: onBounce }),
    ]);
    expect(arrivalPose.state.offGround).toBe(true);
    expect(bouncePose.state.offGround).toBe(true);
  });
});
