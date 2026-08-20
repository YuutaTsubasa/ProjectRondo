import { describe, it, expect } from 'vitest';
import {
  stepGroundContact,
  INITIAL_GROUND_CONTACT,
  COYOTE_SECONDS,
  JUMP_BUFFER_SECONDS,
  FALL_GRACE_SECONDS,
  type GroundContactState,
} from '../../src/presentation/babylon/groundContact';

const DT = 1 / 60;
const frames = (seconds: number) => Math.ceil(seconds / DT) + 1;

/** One frame with everything quiet unless overridden. */
const frame = (state: GroundContactState, over: Partial<Parameters<typeof stepGroundContact>[1]> = {}) =>
  stepGroundContact(state, { supported: true, jumpPressed: false, verticalSpeed: 0, delta: DT, ...over });
const settle = (state: GroundContactState, n: number, over = {}) => {
  let s = state;
  for (let i = 0; i < n; i += 1) s = frame(s, over).state;
  return s;
};
/** Standing, jumping, then climbing for `n` frames with the probe already clear. */
const climbing = (n = 3) => {
  let s = frame(INITIAL_GROUND_CONTACT, { jumpPressed: true }).state;
  for (let i = 0; i < n; i += 1) s = frame(s, { supported: false, verticalSpeed: 8 }).state;
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

  describe('a jump that is still climbing', () => {
    it('does not re-ground while the probe still reports the floor it has not cleared', () => {
      const afterTakeoff = frame(INITIAL_GROUND_CONTACT, { jumpPressed: true }).state;
      expect(frame(afterTakeoff, { supported: true, verticalSpeed: 8.7 }).grounded).toBe(false);
    });

    it('does not re-ground when rising ground comes back into probe reach mid-climb', () => {
      // Jumping while running uphill: the capsule clears the floor, then the slope ahead rises into
      // the probe again while the character is still going up. Grounding there makes the domain zero
      // the climb and the knight sticks to the hillside.
      const r = frame(climbing(), { supported: true, verticalSpeed: 6 });
      expect(r.grounded).toBe(false);
      expect(r.airborne).toBe(true);
    });

    it('lets go the moment the climb is over, so a jump into a low ceiling cannot latch', () => {
      // The probe never releases in this scenario; only "stopped rising" can end it.
      let s = frame(INITIAL_GROUND_CONTACT, { jumpPressed: true }).state;
      s = frame(s, { supported: true, verticalSpeed: 4 }).state;
      const stopped = frame(s, { supported: true, verticalSpeed: -0.1 });
      expect(stopped.grounded).toBe(true);
      expect(stopped.airborne).toBe(false);
    });
  });

  describe('what the animation layer sees', () => {
    it('is airborne for the whole of a jump, including after the apex', () => {
      const rising = frame(climbing(), { supported: false, verticalSpeed: 2 });
      expect(rising.airborne).toBe(true);
      // Past the apex the fall has only just started, but it began as a jump so it needs no grace.
      const justPastApex = frame(rising.state, { supported: false, verticalSpeed: -0.2 });
      expect(justPastApex.airborne).toBe(true);
    });

    it('ignores the probe dropping out for a few frames while running', () => {
      let s = INITIAL_GROUND_CONTACT;
      for (let i = 0; i < 8; i += 1) {
        const r = frame(s, { supported: false, verticalSpeed: -0.1 });
        expect(r.airborne).toBe(false);
        s = r.state;
      }
    });

    it('counts an uncommanded fall once it outlasts the grace', () => {
      const falling = settle(INITIAL_GROUND_CONTACT, frames(FALL_GRACE_SECONDS), {
        supported: false, verticalSpeed: -5,
      });
      expect(frame(falling, { supported: false, verticalSpeed: -5 }).airborne).toBe(true);
    });

    it('is back on the ground as soon as the probe says so', () => {
      const falling = settle(INITIAL_GROUND_CONTACT, frames(FALL_GRACE_SECONDS), {
        supported: false, verticalSpeed: -5,
      });
      expect(frame(falling, { supported: true, verticalSpeed: -5 }).airborne).toBe(false);
    });
  });

  describe('coyote time', () => {
    it('still takes a jump just after the probe drops out', () => {
      const airborne = settle(INITIAL_GROUND_CONTACT, 2, { supported: false, verticalSpeed: -0.2 });
      const r = frame(airborne, { supported: false, verticalSpeed: -0.3, jumpPressed: true });
      expect(r.jumpRequested).toBe(true);
      expect(r.grounded).toBe(true); // the domain only accepts a jump from a grounded motion
    });

    it('refuses a jump once the coyote window has passed', () => {
      const falling = settle(INITIAL_GROUND_CONTACT, frames(COYOTE_SECONDS), {
        supported: false, verticalSpeed: -3,
      });
      expect(frame(falling, { supported: false, verticalSpeed: -3, jumpPressed: true }).jumpRequested).toBe(false);
    });

    it('does not allow a second jump in the air', () => {
      // Past the apex the coyote clock restarts from zero; without the spent-jump flag a mashed key
      // would double-jump there.
      const pastApex = frame(climbing(), { supported: false, verticalSpeed: -0.1 }).state;
      expect(frame(pastApex, { supported: false, verticalSpeed: -1, jumpPressed: true }).jumpRequested).toBe(false);
    });

    it('allows jumping again after landing', () => {
      let s = climbing();
      s = settle(s, 20, { supported: false, verticalSpeed: -4 });
      s = frame(s, { supported: true, verticalSpeed: -4 }).state;
      expect(frame(s, { jumpPressed: true }).jumpRequested).toBe(true);
    });
  });

  describe('jump buffering', () => {
    it('fires a jump pressed during a brief loss of support', () => {
      // The measured failure: walking sideways drops support for 1-8 frame bursts, and a press
      // landing inside one used to be swallowed entirely.
      const r = frame(INITIAL_GROUND_CONTACT, { supported: false, verticalSpeed: -0.1, jumpPressed: true });
      expect(r.jumpRequested).toBe(true);
    });

    it('holds a press made while genuinely falling until the character lands', () => {
      let s = settle(INITIAL_GROUND_CONTACT, frames(COYOTE_SECONDS), {
        supported: false, verticalSpeed: -5,
      });
      const pressed = frame(s, { supported: false, verticalSpeed: -5, jumpPressed: true });
      expect(pressed.jumpRequested).toBe(false); // too far off the ground to jump yet
      s = frame(pressed.state, { supported: false, verticalSpeed: -5 }).state;
      expect(frame(s, { supported: true, verticalSpeed: -5 }).jumpRequested).toBe(true);
    });

    it('forgets a press that goes unused for longer than the buffer', () => {
      let s = settle(INITIAL_GROUND_CONTACT, frames(COYOTE_SECONDS), {
        supported: false, verticalSpeed: -5,
      });
      s = frame(s, { supported: false, verticalSpeed: -5, jumpPressed: true }).state;
      s = settle(s, frames(JUMP_BUFFER_SECONDS), { supported: false, verticalSpeed: -5 });
      expect(frame(s, { supported: true, verticalSpeed: -5 }).jumpRequested).toBe(false);
    });
  });
});
