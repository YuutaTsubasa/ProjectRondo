import { describe, it, expect } from 'vitest';
import { DEFAULT_CONFIG } from '../../../../src/domain/hub/character/movementConfig';
import { NONE_INPUT } from '../../../../src/domain/hub/character/movementInput';
import { IDLE } from '../../../../src/domain/hub/character/characterMotion';
import { isZero } from '../../../../src/domain/kernel/normalizedPlanarDirection';

describe('character value types', () => {
  it('DEFAULT_CONFIG matches MovementConstants', () => {
    expect(DEFAULT_CONFIG).toEqual({
      maxSpeed: 4, acceleration: 13, deceleration: 17, gravity: 24, jumpSpeed: 9,
    });
  });
  it('NONE_INPUT has no direction and no jump', () => {
    expect(isZero(NONE_INPUT.direction)).toBe(true);
    expect(NONE_INPUT.jumpRequested).toBe(false);
  });
  it('IDLE is grounded, motionless, facing -Y', () => {
    expect(IDLE.velocity).toEqual({ x: 0, y: 0, z: 0 });
    expect(IDLE.facing).toEqual({ x: 0, y: -1 });
    expect(IDLE.isGrounded).toBe(true);
  });
});
