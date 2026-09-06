import { describe, it, expect } from 'vitest';
import {
  stepGroundContact,
  spendBufferedJump,
  INITIAL_GROUND_CONTACT,
  COYOTE_SECONDS,
  JUMP_BUFFER_SECONDS,
  FALL_GRACE_SECONDS,
  MAX_RISING_SECONDS,
  type GroundContactState,
} from '../../src/presentation/babylon/groundContact';

const DT = 1 / 60;
const frames = (seconds: number) => Math.ceil(seconds / DT) + 1;

/** One frame with everything quiet unless overridden. */
const frame = (state: GroundContactState, over: Partial<Parameters<typeof stepGroundContact>[1]> = {}) =>
  stepGroundContact(state, {
    supported: true, jumpPressed: false, dashInFlight: false, verticalSpeed: 0, bounced: false,
    delta: DT, ...over,
  });
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

    it('gives up after MAX_RISING_SECONDS even if it is somehow still being pushed upward', () => {
      // The exit condition reads a solver-provided velocity, so a surface that kept shoving the
      // capsule up would otherwise hold this state open — and never being grounded again is silent:
      // no jumping, and the feet never re-plant.
      let s = frame(INITIAL_GROUND_CONTACT, { jumpPressed: true }).state;
      s = settle(s, frames(MAX_RISING_SECONDS), { supported: true, verticalSpeed: 6 });
      const r = frame(s, { supported: true, verticalSpeed: 6 });
      expect(r.grounded).toBe(true);
      expect(r.airborne).toBe(false);
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

  describe('a homing bounce', () => {
    it('is not cancelled by ground the probe finds under the crystal', () => {
      // The bounce is a climb the domain owns, exactly like a jump — and the domain zeroes the
      // vertical speed of any motion it is handed as grounded, so grounding here would delete the
      // rise one frame after Havok was given it, while the crystal had already flashed for it.
      const r = frame(INITIAL_GROUND_CONTACT, { supported: true, bounced: true, verticalSpeed: 12 });
      expect(r.grounded).toBe(false);
      expect(r.airborne).toBe(true);
    });

    it('lands again as soon as the bounce stops rising', () => {
      const s = frame(INITIAL_GROUND_CONTACT, { supported: true, bounced: true, verticalSpeed: 12 }).state;
      expect(frame(s, { supported: true, verticalSpeed: -0.1 }).grounded).toBe(true);
    });

    it('does not turn a press on the bounce frame into an ordinary jump', () => {
      // The chain press: the probe found floor under the crystal, so without reading `bounced` first
      // this frame settles to `grounded`, answers the press as a jump, and reports grounded — which
      // is exactly what stops `stepHomingLock` being offered the press. The chain would degrade into
      // a hop. Composed against the real lock in homingLock.test.ts.
      const r = frame(INITIAL_GROUND_CONTACT, {
        supported: true, bounced: true, verticalSpeed: 12, jumpPressed: true,
      });
      expect(r.jumpRequested).toBe(false);
      expect(r.grounded).toBe(false);
    });
  });

  describe('a dash in flight', () => {
    // A dash frame is spent in the domain's homing branch, which never reads `jumpRequested`.
    const dashing = { dashInFlight: true, supported: true, verticalSpeed: 6 };

    it('does not spend a press on a jump the domain will not read', () => {
      // The skimming case: the probe reports support mid-dash, so this frame would otherwise settle
      // to `grounded` and answer the press with a jump that goes nowhere at all.
      const airborne = settle(INITIAL_GROUND_CONTACT, 2, { supported: false, verticalSpeed: -0.2 });
      expect(frame(airborne, { ...dashing, jumpPressed: true }).jumpRequested).toBe(false);
    });

    it('keeps that press in the buffer rather than swallowing it', () => {
      const airborne = settle(INITIAL_GROUND_CONTACT, 2, { supported: false, verticalSpeed: -0.2 });
      const pressed = frame(airborne, { ...dashing, jumpPressed: true });
      // The dash ends on the next frame without a bounce (a timeout onto ground); the press it
      // declined is still worth a jump, where before it had been consumed and thrown away.
      expect(frame(pressed.state, { supported: true, verticalSpeed: -0.1 }).jumpRequested).toBe(true);
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

    it('drops a press the homing lock spent, so it cannot come back as a second jump', () => {
      // The buffer holds every press this machine declines, including the one the lock is about to
      // commit as a dash — it cannot know which until the lock has answered, and the lock answers
      // second. `spendBufferedJump` is how the press leaves again. Driven end to end, against the
      // real lock and the arrival that reaches a legal jump frame, in homingLock.test.ts.
      const falling = settle(INITIAL_GROUND_CONTACT, frames(COYOTE_SECONDS), {
        supported: false, verticalSpeed: -5,
      });
      const pressed = frame(falling, { supported: false, verticalSpeed: -5, jumpPressed: true });
      expect(pressed.jumpRequested).toBe(false); // too far off the ground: this press is the lock's
      const landing = { supported: true, verticalSpeed: -5 } as const;
      expect(frame(spendBufferedJump(pressed.state), landing).jumpRequested).toBe(false);
      // Without the retraction that very same frame fires one, which is the double spend itself.
      expect(frame(pressed.state, landing).jumpRequested).toBe(true);
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
