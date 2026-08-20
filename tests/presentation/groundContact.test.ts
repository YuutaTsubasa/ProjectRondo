import { describe, it, expect } from 'vitest';
import {
  stepGroundContact,
  INITIAL_GROUND_CONTACT,
  COYOTE_SECONDS,
  JUMP_BUFFER_SECONDS,
  type GroundContactState,
} from '../../src/presentation/babylon/groundContact';

const DT = 1 / 60;
/** One frame with everything quiet unless overridden. */
const frame = (state: GroundContactState, over: Partial<Parameters<typeof stepGroundContact>[1]> = {}) =>
  stepGroundContact(state, { supported: true, jumpPressed: false, verticalSpeed: 0, delta: DT, ...over });
/** Runs `n` quiet frames and returns the resulting state. */
const settle = (state: GroundContactState, n: number, over = {}) => {
  let s = state;
  for (let i = 0; i < n; i += 1) s = frame(s, over).state;
  return s;
};

describe('stepGroundContact', () => {
  it('reports grounded while the probe has support', () => {
    expect(frame(INITIAL_GROUND_CONTACT).grounded).toBe(true);
  });

  it('takes a jump pressed while standing', () => {
    const r = frame(INITIAL_GROUND_CONTACT, { jumpPressed: true });
    expect(r.jumpRequested).toBe(true);
    expect(r.grounded).toBe(true);
  });

  it('keeps the character grounded while walking, however the post-solve velocity points', () => {
    // Riding rolling terrain pushes the capsule up the whole time (measured +0.33..+0.42 u/s). The
    // old rule treated any upward velocity as airborne, which made jumping while walking impossible.
    const r = frame(INITIAL_GROUND_CONTACT, { verticalSpeed: 0.42, jumpPressed: true });
    expect(r.grounded).toBe(true);
    expect(r.jumpRequested).toBe(true);
  });

  it('does not re-ground a jump that has not cleared the floor yet', () => {
    // For the first frames of a jump the probe still reports SUPPORTED; re-grounding there would
    // zero the jump's upward velocity before the capsule ever leaves.
    const afterTakeoff = frame(INITIAL_GROUND_CONTACT, { jumpPressed: true }).state;
    const next = frame(afterTakeoff, { supported: true, verticalSpeed: 8.7 });
    expect(next.grounded).toBe(false);
  });

  it('releases the takeoff guard once the character is falling, even if the probe never let go', () => {
    // A jump straight into a low ceiling; without this the guard would latch forever.
    const afterTakeoff = frame(INITIAL_GROUND_CONTACT, { jumpPressed: true }).state;
    const next = frame(afterTakeoff, { supported: true, verticalSpeed: -0.5 });
    expect(next.grounded).toBe(true);
  });

  describe('coyote time', () => {
    it('still takes a jump just after the probe drops out', () => {
      const airborne = settle(INITIAL_GROUND_CONTACT, 2, { supported: false, verticalSpeed: -0.2 });
      const r = frame(airborne, { supported: false, verticalSpeed: -0.3, jumpPressed: true });
      expect(r.jumpRequested).toBe(true);
      expect(r.grounded).toBe(true); // the domain only accepts a jump from a grounded motion
    });

    it('refuses a jump once the coyote window has passed', () => {
      const falling = settle(INITIAL_GROUND_CONTACT, Math.ceil(COYOTE_SECONDS / DT) + 2, {
        supported: false, verticalSpeed: -3,
      });
      expect(frame(falling, { supported: false, verticalSpeed: -3, jumpPressed: true }).jumpRequested).toBe(false);
    });

    it('does not allow a second jump in the air', () => {
      let s = frame(INITIAL_GROUND_CONTACT, { jumpPressed: true }).state;
      // The probe lets go a couple of frames later, which restarts the airborne clock — without a
      // spent-jump flag the coyote window would open again and mashing the key would double-jump.
      s = frame(s, { supported: false, verticalSpeed: 8 }).state;
      expect(frame(s, { supported: false, verticalSpeed: 7, jumpPressed: true }).jumpRequested).toBe(false);
    });

    it('allows jumping again after landing', () => {
      let s = frame(INITIAL_GROUND_CONTACT, { jumpPressed: true }).state;
      s = settle(s, 20, { supported: false, verticalSpeed: -4 });
      s = frame(s, { supported: true, verticalSpeed: -4 }).state; // touchdown
      expect(frame(s, { jumpPressed: true }).jumpRequested).toBe(true);
    });
  });

  describe('jump buffering', () => {
    it('fires a jump pressed during a brief loss of support', () => {
      // The measured failure: walking sideways drops support for 1-8 frame bursts, and a press
      // landing inside one used to be swallowed entirely.
      const s = frame(INITIAL_GROUND_CONTACT, { supported: false, verticalSpeed: -0.1, jumpPressed: true });
      expect(s.jumpRequested).toBe(true); // coyote covers this one outright
    });

    it('holds a press made while genuinely falling until the character lands', () => {
      let s = settle(INITIAL_GROUND_CONTACT, Math.ceil(COYOTE_SECONDS / DT) + 2, {
        supported: false, verticalSpeed: -5,
      });
      const pressed = frame(s, { supported: false, verticalSpeed: -5, jumpPressed: true });
      expect(pressed.jumpRequested).toBe(false); // too far off the ground to jump yet
      s = pressed.state;
      s = frame(s, { supported: false, verticalSpeed: -5 }).state; // still falling, press remembered
      expect(frame(s, { supported: true, verticalSpeed: -5 }).jumpRequested).toBe(true);
    });

    it('forgets a press that goes unused for longer than the buffer', () => {
      let s = settle(INITIAL_GROUND_CONTACT, Math.ceil(COYOTE_SECONDS / DT) + 2, {
        supported: false, verticalSpeed: -5,
      });
      s = frame(s, { supported: false, verticalSpeed: -5, jumpPressed: true }).state;
      s = settle(s, Math.ceil(JUMP_BUFFER_SECONDS / DT) + 2, { supported: false, verticalSpeed: -5 });
      expect(frame(s, { supported: true, verticalSpeed: -5 }).jumpRequested).toBe(false);
    });
  });
});
