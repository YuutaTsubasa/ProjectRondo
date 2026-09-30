import { describe, it, expect } from 'vitest';
import {
  stepHomingLock, NO_HOMING_LOCK,
  type HomingLock, type HomingLockConfig, type HomingLockInput,
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

// The lock is a union, so what a test wants to assert on — "which crystal, if any" — is a projection
// of it rather than a field. Read through these two so a case says what it is checking and not how the
// state happens to be shaped.
const committed = (lock: HomingLock): number | null => (lock.kind === 'locked' ? lock.crystal : null);
const entry = (lock: HomingLock): number | null => (lock.kind === 'locked' ? lock.entrySeconds : null);

const frame = (overrides: Partial<HomingLockInput> = {}): HomingLockInput => ({
  dashInFlight: false,
  attackPressed: false,
  pressWouldDash: true,
  from: ZERO3,
  cameraForward: FORWARD,
  candidates: [NEAR, FAR, BEHIND],
  ...overrides,
});

describe('stepHomingLock', () => {
  it('commits to the crystal a press would hit, and reports the live offset to it', () => {
    const { lock, target } = stepHomingLock(NO_HOMING_LOCK, frame({ attackPressed: true }), C);
    expect(committed(lock)).toBe(0);
    expect(target).toEqual(NEAR);
  });

  it('estimates the dash duration once, from the distance at the moment of the lock', () => {
    const { lock } = stepHomingLock(NO_HOMING_LOCK, frame({ attackPressed: true }), C);
    expect(entry(lock)).toBeCloseTo(6 / C.homingSpeed, 9);
  });

  it('locks nothing on a press with no candidate in the cone', () => {
    const { lock, target } = stepHomingLock(
      NO_HOMING_LOCK, frame({ attackPressed: true, candidates: [BEHIND] }), C,
    );
    expect(lock).toEqual(NO_HOMING_LOCK);
    expect(target).toBeNull();
  });

  it('locks nothing on the ground — the same press is an ordinary jump there', () => {
    const { lock, preview } = stepHomingLock(
      NO_HOMING_LOCK, frame({ attackPressed: true, pressWouldDash: false }), C,
    );
    expect(lock).toEqual(NO_HOMING_LOCK);
    // And the reticle stays hidden, rather than pointing at a crystal the press will not fly to.
    expect(preview).toBeNull();
  });

  it('holds the same crystal for the whole dash, even as a nearer one comes into the cone', () => {
    const locked = stepHomingLock(NO_HOMING_LOCK, frame({ attackPressed: true, candidates: [NEAR, FAR] }), C).lock;
    expect(committed(locked)).toBe(0);
    // A dash never retargets mid-flight (design spec §4), so index 1 — now much the nearer — must not
    // steal the lock, and a press landing mid-dash must not either.
    const held = stepHomingLock(locked, frame({
      dashInFlight: true, attackPressed: true, candidates: [NEAR, vec3(0, 0, -1)],
    }), C);
    expect(committed(held.lock)).toBe(0);
    expect(entry(held.lock)).toBe(entry(locked));
  });

  it('recomputes the offset to the held crystal every frame as the player closes on it', () => {
    const locked = stepHomingLock(NO_HOMING_LOCK, frame({ attackPressed: true }), C).lock;
    const closer = stepHomingLock(locked, frame({ dashInFlight: true, from: vec3(0, 0, -4) }), C);
    // The live offset, not the press-frame snapshot: `stepHoming` tells a dash still closing from one
    // a wall has stopped by watching this shrink.
    expect(closer.target).toEqual(vec3(0, 0, -2));
  });

  it('releases the lock the frame the dash ends, so the next press is free to pick anew', () => {
    const locked = stepHomingLock(NO_HOMING_LOCK, frame({ attackPressed: true }), C).lock;
    const released = stepHomingLock(locked, frame({ dashInFlight: false }), C);
    expect(released.lock).toEqual(NO_HOMING_LOCK);
    expect(released.target).toBeNull();
  });

  it('lets the next press re-lock the crystal just bounced off, which nothing excludes (spec §6)', () => {
    const locked = stepHomingLock(NO_HOMING_LOCK, frame({ attackPressed: true, candidates: [NEAR] }), C).lock;
    // Where the bounce leaves the player: the arrival puts them AT the crystal and sends them straight
    // up, so `homingBounceSpeed²/(2*gravity)` = 1.6875 u above it, looking back down. Pinned because the
    // spec's rule is that this is allowed and gains no height — the dash goes back down to the crystal —
    // so a later exclusion would be a behaviour change, not a tidy-up.
    const relocked = stepHomingLock(locked, frame({
      attackPressed: true, candidates: [NEAR], from: vec3(0, 1.6875, -6), cameraForward: vec3(0, -1, 0),
    }), C);
    expect(committed(relocked.lock)).toBe(0);
    expect(relocked.consumedPress).toBe(true);
  });

  it('previews what a press would hit on every off-the-ground frame, press or not', () => {
    expect(stepHomingLock(NO_HOMING_LOCK, frame(), C).preview).toBe(0);
  });

  it('previews nothing mid-dash — the lock is committed and the trail already says so', () => {
    const locked = stepHomingLock(NO_HOMING_LOCK, frame({ attackPressed: true }), C).lock;
    expect(stepHomingLock(locked, frame({ dashInFlight: true }), C).preview).toBeNull();
  });

  describe('reporting whether it took the press', () => {
    // `groundContact` buffers every press it declines and cannot tell which of them the lock went on
    // to spend, because it answers first. This is that answer.
    it('says so on the frame it commits a fresh dash', () => {
      expect(stepHomingLock(NO_HOMING_LOCK, frame({ attackPressed: true }), C).consumedPress).toBe(true);
    });

    it('says no when it declined the press for want of a crystal in the cone', () => {
      const input = frame({ attackPressed: true, candidates: [BEHIND] });
      expect(stepHomingLock(NO_HOMING_LOCK, input, C).consumedPress).toBe(false);
    });

    it('says no for a press made mid-dash, which it holds the lock through rather than spends', () => {
      const locked = stepHomingLock(NO_HOMING_LOCK, frame({ attackPressed: true }), C).lock;
      const held = stepHomingLock(locked, frame({ dashInFlight: true, attackPressed: true }), C);
      expect(committed(held.lock)).toBe(0); // still committed, so the crystal alone would read as a spend
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
      .toBe(committed(stepHomingLock(NO_HOMING_LOCK, { ...input, attackPressed: true }, C).lock));
  });
});
