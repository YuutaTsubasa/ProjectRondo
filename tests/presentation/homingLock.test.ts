import { describe, it, expect } from 'vitest';
import {
  stepHomingLock, NO_HOMING_LOCK, type HomingLockConfig, type HomingLockInput,
} from '../../src/presentation/babylon/homingLock';
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
  airborne: true,
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
      NO_HOMING_LOCK, frame({ jumpPressed: true, airborne: false }), C,
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

  it('previews what a press would hit on every airborne frame, press or not', () => {
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
