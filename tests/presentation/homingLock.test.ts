import { describe, it, expect } from 'vitest';
import {
  stepHomingLock, NO_HOMING_LOCK, type HomingLockConfig, type HomingLockInput,
} from '../../src/presentation/babylon/homingLock';
import {
  stepGroundContact, spendBufferedJump, INITIAL_GROUND_CONTACT, COYOTE_SECONDS, FALL_GRACE_SECONDS,
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
  pressWouldDash: true,
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
      NO_HOMING_LOCK, frame({ jumpPressed: true, pressWouldDash: false }), C,
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

  describe('reporting whether it took the press', () => {
    // `groundContact` buffers every press it declines and cannot tell which of them the lock went on
    // to spend, because it answers first. This is that answer.
    it('says so on the frame it commits a fresh dash', () => {
      expect(stepHomingLock(NO_HOMING_LOCK, frame({ jumpPressed: true }), C).consumedPress).toBe(true);
    });

    it('says no when it declined the press for want of a crystal in the cone', () => {
      const input = frame({ jumpPressed: true, candidates: [BEHIND] });
      expect(stepHomingLock(NO_HOMING_LOCK, input, C).consumedPress).toBe(false);
    });

    it('says no for a press made mid-dash, which it holds the lock through rather than spends', () => {
      const locked = stepHomingLock(NO_HOMING_LOCK, frame({ jumpPressed: true }), C).lock;
      const held = stepHomingLock(locked, frame({ dashInFlight: true, jumpPressed: true }), C);
      expect(held.lock.crystal).toBe(0); // still committed, so `crystal` alone would read as a spend
      expect(held.consumedPress).toBe(false);
    });

    it('says no on a frame with no press at all, however the reticle is pointing', () => {
      const previewing = stepHomingLock(NO_HOMING_LOCK, frame(), C);
      expect(previewing.preview).toBe(0);
      expect(previewing.consumedPress).toBe(false);
    });
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
      NO_HOMING_LOCK, frame({ jumpPressed: true, pressWouldDash: !ground.jumpAvailable }), C,
    );
    if (ground.jumpRequested && lock.crystal !== null) return 'both';
    if (ground.jumpRequested) return 'jump';
    return lock.crystal === null ? 'nothing' : 'dash';
  };

  /** The same fall, with the button never touched: what the ring shows on the frame after `seconds`. */
  const previewAfterFalling = (seconds: number) => {
    let contact = INITIAL_GROUND_CONTACT;
    for (let t = 0; t < seconds; t += DT) contact = stepGroundContact(contact, FALLING).state;

    const ground = stepGroundContact(contact, FALLING);
    return stepHomingLock(NO_HOMING_LOCK, frame({ pressWouldDash: !ground.jumpAvailable }), C).preview;
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

  it('rings a crystal on exactly the frames whose press is a dash, and on no other', () => {
    // The ring promises "what a press right now would hit", so on every frame of the fall it has to
    // give the same answer the press does. The coyote window is where that used to break: gating the
    // ring on `!grounded` lit it from the first frame off the ledge, while `canJump` kept answering
    // the press with an ordinary jump for a further COYOTE_SECONDS.
    for (const t of FALL) {
      expect(previewAfterFalling(t) === null).toBe(pressAfterFalling(t) === 'jump');
    }
    // Both ends pinned outright as well, so a change that made ring and press uniformly wrong — dark
    // for the whole fall, or lit for the whole of it — could not pass the agreement check above.
    expect(previewAfterFalling(0)).toBeNull();
    expect(previewAfterFalling(COYOTE_SECONDS)).toBe(0);
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
      const dash = stepHomingLock(lock, frame({
        jumpPressed: true, pressWouldDash: !ground.jumpAvailable, dashInFlight: over.dashInFlight,
      }), C);
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

  /**
   * "Exactly one of the two" has a second half: a press the lock spends must also stop being a jump
   * the buffer is still holding. The ground machine cannot decide that alone — it buffers the press
   * before the lock has said whether it wants it — so the retraction is a step of the composition,
   * and only driving both machines shows whether it happened.
   */
  describe('the press that started a dash', () => {
    /**
     * Runs the frame both machines see, in the order `playerController` runs them, and hands back the
     * ground state the next frame starts from — the retraction included.
     */
    const bothMachines = (
      contact: Parameters<typeof stepGroundContact>[0],
      ground: Parameters<typeof stepGroundContact>[1],
      candidates = [NEAR, FAR, BEHIND],
    ) => {
      const contactResult = stepGroundContact(contact, ground);
      const lockResult = stepHomingLock(NO_HOMING_LOCK, frame({
        jumpPressed: ground.jumpPressed,
        pressWouldDash: !contactResult.jumpAvailable,
        dashInFlight: ground.dashInFlight,
        candidates,
      }), C);
      return {
        ...contactResult,
        consumedPress: lockResult.consumedPress,
        state: lockResult.consumedPress ? spendBufferedJump(contactResult.state) : contactResult.state,
      };
    };

    /** Off a ledge, past the coyote window, so the press is the lock's rather than the jump's. */
    const fallenPastCoyote = () => {
      let contact = INITIAL_GROUND_CONTACT;
      for (let t = 0; t <= COYOTE_SECONDS; t += DT) contact = stepGroundContact(contact, FALLING).state;
      return contact;
    };

    it('is not still in the jump buffer when the dash arrives under a ceiling', () => {
      // The reviewer's drive, frame for frame: press into a dash, two frames of flight, then an
      // arrival whose bounce the ceiling cancels (`verticalSpeed` 0). `bounced` forces `rising`, the
      // climb that is not climbing ends on the very next frame, and the probe has floor under the
      // crystal — so that frame is a legal jump frame, roughly four after the press and well inside
      // JUMP_BUFFER_SECONDS. A press left in the buffer fires there, unrequested.
      const pressed = bothMachines(fallenPastCoyote(), { ...FALLING, jumpPressed: true });
      expect(pressed.jumpRequested).toBe(false);
      expect(pressed.consumedPress).toBe(true);

      let contact = pressed.state;
      const skimming = { ...FALLING, supported: true, verticalSpeed: 0, dashInFlight: true };
      for (let i = 0; i < 2; i += 1) contact = bothMachines(contact, skimming).state;
      contact = bothMachines(contact, { ...skimming, dashInFlight: false, bounced: true }).state;

      const landed = bothMachines(contact, { ...FALLING, supported: true, verticalSpeed: 0 });
      expect(landed.jumpRequested).toBe(false);
    });

    it('still buffers a press the lock declined, so a dash-less press is not swallowed', () => {
      // The other half of `groundContact`'s problem 5: with the camera pointed at nothing the lock
      // takes no press, and that one has to keep the buffer that carries it to the landing.
      const pressed = bothMachines(fallenPastCoyote(), { ...FALLING, jumpPressed: true }, [BEHIND]);
      expect(pressed.consumedPress).toBe(false);
      expect(bothMachines(pressed.state, { ...FALLING, supported: true }).jumpRequested).toBe(true);
    });
  });
});
