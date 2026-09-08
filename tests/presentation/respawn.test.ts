import { describe, it, expect } from 'vitest';
import { respawned } from '../../src/presentation/babylon/respawn';
import {
  stepHomingLock, NO_HOMING_LOCK, type HomingLock, type HomingLockConfig,
} from '../../src/presentation/babylon/homingLock';
import { isHomingFrame } from '../../src/domain/hub/character/characterMovement';
import { IDLE, type CharacterMotion } from '../../src/domain/hub/character/characterMotion';
import { NONE_INPUT } from '../../src/domain/hub/character/movementInput';
import { vec3, ZERO3 } from '../../src/domain/math/vec3';
import { vec2 } from '../../src/domain/math/vec2';

/** The shipped homing tuning, as `homingLock.test.ts` states it. */
const CONFIG: HomingLockConfig = { homingRange: 12, homingConeHalfAngle: 0.6109, homingSpeed: 24 };

/** One crystal, six units overhead — a tower chain link. */
const CRYSTALS = [vec3(0, 6, 0)];
const COMMITTED: HomingLock = { kind: 'locked', crystal: 0, entrySeconds: 0.25 };

/**
 * Falling fast and mid-dash: the state a respawn fires from when a player misses a link in the
 * tower's section 2 and dashes at the crystals on the way down past `TOWER_FALL_MARGIN`.
 */
const DASHING: CharacterMotion = {
  velocity: vec3(0, -19.87, 0),
  facing: vec2(1, 0),
  isGrounded: false,
  homing: { elapsed: 0.3 },
};

/**
 * One frame of the two machines `playerController` runs, with no key pressed: what the lock offers
 * the domain as `homingTarget`, and whether the domain then spends the frame dashing.
 */
const nextFrameDashes = (motion: CharacterMotion, lock: HomingLock): boolean => {
  const result = stepHomingLock(lock, {
    dashInFlight: motion.homing !== null,
    jumpPressed: false,
    pressWouldDash: true,
    from: ZERO3,
    cameraForward: vec3(0, 1, 0),
    candidates: CRYSTALS,
  }, CONFIG);
  return isHomingFrame(motion, { ...NONE_INPUT, homingTarget: result.target });
};

describe('respawned', () => {
  it('lands the character at rest', () => {
    expect(respawned(DASHING).motion.velocity).toEqual(ZERO3);
  });

  it('ends a dash that was in flight', () => {
    expect(respawned(DASHING).motion.homing).toBeNull();
  });

  it('drops the crystal the dash was committed to', () => {
    expect(respawned(DASHING).lock).toEqual(NO_HOMING_LOCK);
  });

  it('leaves nothing for the next frame to resume the dash from', () => {
    // The counterfactual first, or the assertion below proves nothing: without the respawn these two
    // machines carry the dash straight into the next frame, from wherever the teleport just put the
    // capsule.
    expect(nextFrameDashes(DASHING, COMMITTED)).toBe(true);

    const cut = respawned(DASHING);
    expect(nextFrameDashes(cut.motion, cut.lock)).toBe(false);
  });

  it('leaves facing alone — a respawn has no opinion about which way the knight points', () => {
    expect(respawned(DASHING).motion.facing).toEqual(DASHING.facing);
  });

  it('changes nothing about a character that was already standing still', () => {
    expect(respawned(IDLE).motion).toEqual(IDLE);
    expect(respawned(IDLE).lock).toEqual(NO_HOMING_LOCK);
  });
});
