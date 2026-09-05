import { describe, it, expect } from 'vitest';
import { DEFAULT_CONFIG } from '../../../../src/domain/hub/character/movementConfig';
import { NONE_INPUT } from '../../../../src/domain/hub/character/movementInput';
import { IDLE } from '../../../../src/domain/hub/character/characterMotion';
import { isZero } from '../../../../src/domain/kernel/normalizedPlanarDirection';

describe('character value types', () => {
  it('DEFAULT_CONFIG matches MovementConstants', () => {
    expect(DEFAULT_CONFIG).toEqual({
      maxSpeed: 4, runSpeed: 8, turnRate: 10, acceleration: 13, deceleration: 17, gravity: 24, jumpSpeed: 9,
      homingRange: 12, homingConeHalfAngle: 0.6109, homingSpeed: 24, homingBounceSpeed: 9, homingMaxDuration: 0.6,
    });
  });
  it('NONE_INPUT has no direction, no jump and no run', () => {
    expect(isZero(NONE_INPUT.direction)).toBe(true);
    expect(NONE_INPUT.jumpRequested).toBe(false);
    expect(NONE_INPUT.runRequested).toBe(false);
  });
  it('IDLE is grounded, motionless, facing -Y', () => {
    expect(IDLE.velocity).toEqual({ x: 0, y: 0, z: 0 });
    expect(IDLE.facing).toEqual({ x: 0, y: -1 });
    expect(IDLE.isGrounded).toBe(true);
  });
});
