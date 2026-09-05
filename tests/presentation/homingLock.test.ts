import { describe, it, expect } from 'vitest';
import {
  stepHomingLock, NO_HOMING_LOCK, type HomingLockConfig, type HomingLockInput,
} from '../../src/presentation/babylon/homingLock';
import {
  stepGroundContact, INITIAL_GROUND_CONTACT, COYOTE_SECONDS, FALL_GRACE_SECONDS,
} from '../../src/presentation/babylon/groundContact';
import { vec3, ZERO3 } from '../../src/domain/math/vec3';

// The shipped homing tuning; `homingSpeed` is what the entry estimate divides by.
const C: HomingLockConfig = { homingRange: 12, homingConeHalfAngle: 0.6109, homingSpeed: 24 };

// The scene is right-handed and the knight's default facing is -Z, so this is "looking ahead".
const FORWARD = vec3(0, 0, -1);
const NEAR = vec3(0, 0, -6);
const FAR = vec3(0, 0, -9);
const BEHIND = vec3(0, 0, 8);

const frame = (overrides: Partial<HomingLockInput> = {}): HomingLockInput => ({
  dashInFlight: false,
  jumpPressed: false,
  offGround: true,
  from: ZERO3,
  cameraForward: FORWARD,
  candidates: [NEAR, FAR, BEHIND],
  ...overrides,
});

describe('stepHomingLock', () => {
  it('commits to the crystal a press would hit, and reports the live offset to it', () => {
    const { lock, target } = stepHomingLock(NO_HOMING_LOCK, frame({ jumpPressed: true }), C);
    expect(lock.crystal).toBe(0);
    expect(target).toEqual(NEAR);
  });

  it('estimates the dash duration once, from the distance at the moment of the lock', () => {
    const { lock } = stepHomingLock(NO_HOMING_LOCK, frame({ jumpPressed: true }), C);
    expect(lock.entrySeconds).toBeCloseTo(6 / C.homingSpeed, 9);
  });

  it('locks nothing on a press with no candidate in the cone', () => {
    const { lock, target } = stepHomingLock(
      NO_HOMING_LOCK, frame({ jumpPressed: true, candidates: [BEHIND] }), C,
    );
    expect(lock.crystal).toBeNull();
    expect(lock.entrySeconds).toBeNull();
    expect(target).toBeNull();
  });

  it('locks nothing on the ground — the same press is an ordinary jump there', () => {
    const { lock, preview } = stepHomingLock(
      NO_HOMING_LOCK, frame({ jumpPressed: true, offGround: false }), C,
    );
    expect(lock.crystal).toBeNull();
    // And the reticle stays hidden, rather than pointing at a crystal the press will not fly to.
    expect(preview).toBeNull();
  });

  it('holds the same crystal for the whole dash, even as a nearer one comes into the cone', () => {
    const locked = stepHomingLock(NO_HOMING_LOCK, frame({ jumpPressed: true, candidates: [NEAR, FAR] }), C).lock;
    expect(locked.crystal).toBe(0);
    // A dash never retargets mid-flight (design spec §4), so index 1 — now much the nearer — must not
    // steal the lock, and a press landing mid-dash must not either.
    const held = stepHomingLock(locked, frame({
      dashInFlight: true, jumpPressed: true, candidates: [NEAR, vec3(0, 0, -1)],
    }), C);
    expect(held.lock.crystal).toBe(0);
    expect(held.lock.entrySeconds).toBe(locked.entrySeconds);
  });

  it('recomputes the offset to the held crystal every frame as the player closes on it', () => {
    const locked = stepHomingLock(NO_HOMING_LOCK, frame({ jumpPressed: true }), C).lock;
    const closer = stepHomingLock(locked, frame({ dashInFlight: true, from: vec3(0, 0, -4) }), C);
    // The live offset, not the press-frame snapshot: `stepHoming` tells a dash still closing from one
    // a wall has stopped by watching this shrink.
    expect(closer.target).toEqual(vec3(0, 0, -2));
  });

  it('releases the lock the frame the dash ends, so the next press is free to pick anew', () => {
    const locked = stepHomingLock(NO_HOMING_LOCK, frame({ jumpPressed: true }), C).lock;
    const released = stepHomingLock(locked, frame({ dashInFlight: false }), C);
    expect(released.lock.crystal).toBeNull();
    expect(released.lock.entrySeconds).toBeNull();
    expect(released.target).toBeNull();
  });

  it('previews what a press would hit on every off-the-ground frame, press or not', () => {
    expect(stepHomingLock(NO_HOMING_LOCK, frame(), C).preview).toBe(0);
  });

  it('previews nothing mid-dash — the lock is committed and the trail already says so', () => {
    const locked = stepHomingLock(NO_HOMING_LOCK, frame({ jumpPressed: true }), C).lock;
    expect(stepHomingLock(locked, frame({ dashInFlight: true }), C).preview).toBeNull();
  });

  it('previews the crystal a press would commit to, so the ring never points somewhere else', () => {
    const input = frame({ candidates: [FAR, NEAR] }); // nearest is index 1, so this is not index luck
    expect(stepHomingLock(NO_HOMING_LOCK, input, C).preview)
      .toBe(stepHomingLock(NO_HOMING_LOCK, { ...input, jumpPressed: true }, C).lock.crystal);
  });
});

/**
 * `stepGroundContact` and `stepHomingLock` share one edge-triggered press, and the two gates the
 * press is offered to have to cover every frame between them: a press that becomes neither a jump
 * nor a dash is a frame in which the button does nothing at all.
 *
 * They did not always. The lock used to read `GroundContactResult.airborne` — the animation debounce,
 * false until an *uncommanded* fall outlasts FALL_GRACE_SECONDS — while a jump stops being legal at
 * the shorter COYOTE_SECONDS, so the 0.05 s between them refused both. This drives the two shipped
 * machines against each other, which is the only place that gap is visible.
 */
describe('stepHomingLock composed with stepGroundContact', () => {
  const DT = 1 / 60;
  const FALLING = {
    supported: false, jumpPressed: false, dashInFlight: false, verticalSpeed: -5, bounced: false,
    delta: DT,
  };

  /** Walks off a ledge (no jump, so `jumpSpent` is false), falls for `seconds`, then presses. */
  const pressAfterFalling = (seconds: number) => {
    let contact = INITIAL_GROUND_CONTACT;
    for (let t = 0; t < seconds; t += DT) contact = stepGroundContact(contact, FALLING).state;

    const ground = stepGroundContact(contact, { ...FALLING, jumpPressed: true });
    const { lock } = stepHomingLock(
      NO_HOMING_LOCK, frame({ jumpPressed: true, offGround: !ground.grounded }), C,
    );
    if (ground.jumpRequested && lock.crystal !== null) return 'both';
    if (ground.jumpRequested) return 'jump';
    return lock.crystal === null ? 'nothing' : 'dash';
  };

  // Well past FALL_GRACE_SECONDS, so the sweep covers the whole of both gates and the gap between.
  const FALL = Array.from({ length: 30 }, (_, i) => i * DT);

  it('gives every press of an uncommanded fall to exactly one of the two', () => {
    const answered = FALL.map((t) => ({ t, answer: pressAfterFalling(t) }));
    expect(answered.filter(({ answer }) => answer === 'nothing' || answer === 'both')).toEqual([]);
  });

  it('turns the press into a dash across the window that used to swallow it', () => {
    // The measured failure: 0.150 / 0.167 / 0.183 s all produced neither a jump nor a dash.
    for (let t = COYOTE_SECONDS; t <= FALL_GRACE_SECONDS; t += DT) {
      expect(pressAfterFalling(t)).toBe('dash');
    }
  });

  it('still spends the press on a jump while coyote time is open', () => {
    expect(pressAfterFalling(0)).toBe('jump');
    expect(pressAfterFalling(COYOTE_SECONDS / 2)).toBe('jump');
  });

  /**
   * The dash's own frames are the other half of the partition, and the probe reports support on them:
   * mid-dash it skims the ground (`slopeMotion`), and a crystal low enough puts floor under the
   * arrival. Answering such a frame from the probe alone gave the press to the jump — to a jump the
   * domain then ignored mid-dash, and to a real hop on the frame after an arrival, where reporting
   * `grounded` for it is what kept the lock from ever seeing it. Chaining off a low crystal is the
   * whole move, so it is driven here against both shipped machines rather than either alone.
   */
  describe('a press on a frame a dash owns', () => {
    /** One frame of both machines, from a standing-on-the-crystal probe. `lock` is what is committed. */
    const pressWith = (over: { dashInFlight: boolean; bounced: boolean }, lock = NO_HOMING_LOCK) => {
      const ground = stepGroundContact(INITIAL_GROUND_CONTACT, {
        supported: true, jumpPressed: true, verticalSpeed: 9, delta: DT, ...over,
      });
      const dash = stepHomingLock(
        lock, frame({ jumpPressed: true, offGround: !ground.grounded, dashInFlight: over.dashInFlight }), C,
      );
      if (ground.jumpRequested) return 'jump';
      return dash.lock.crystal !== null && dash.lock.crystal !== lock.crystal ? 'dash' : 'held';
    };

    it('turns an early chain press after a bounce into the next dash, not a hop', () => {
      expect(pressWith({ dashInFlight: false, bounced: true })).toBe('dash');
    });

    it('leaves a press made mid-dash to the buffer, rather than spending it on either', () => {
      // Nothing may act on it: the domain's homing branch does not read `jumpRequested`, and the lock
      // must not retarget mid-flight. `groundContact` keeps it buffered — pinned there.
      expect(pressWith({ dashInFlight: true, bounced: false }, { crystal: 1, entrySeconds: 0.4 }))
        .toBe('held');
    });
  });
});
