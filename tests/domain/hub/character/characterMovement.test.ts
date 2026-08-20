import { describe, it, expect } from 'vitest';
import { step } from '../../../../src/domain/hub/character/characterMovement';
import { DEFAULT_CONFIG as C } from '../../../../src/domain/hub/character/movementConfig';
import { NONE_INPUT, type MovementInput } from '../../../../src/domain/hub/character/movementInput';
import { IDLE, type CharacterMotion } from '../../../../src/domain/hub/character/characterMotion';
import { fromRaw } from '../../../../src/domain/kernel/normalizedPlanarDirection';
import { vec2, length } from '../../../../src/domain/math/vec2';
import { vec3 } from '../../../../src/domain/math/vec3';

const P = 3;
const inputToward = (rawX: number, rawY: number, jump = false, run = false): MovementInput =>
  ({ direction: fromRaw(vec2(rawX, rawY)), jumpRequested: jump, runRequested: run });
const planarSpeed = (m: CharacterMotion) => length(vec2(m.velocity.x, m.velocity.z));

describe('CharacterMovement.step', () => {
  it('full input accelerates to max speed along input direction', () => {
    const r = step(IDLE, inputToward(1, 0), C, 1);
    expect(r.velocity.x).toBeCloseTo(C.maxSpeed, P);
    expect(r.velocity.z).toBeCloseTo(0, P);
    expect(r.facing.x).toBeCloseTo(1, P);
  });
  it('no input decelerates planar velocity to rest', () => {
    const moving: CharacterMotion = { ...IDLE, velocity: vec3(C.maxSpeed, 0, 0) };
    const r = step(moving, NONE_INPUT, C, 1);
    expect(r.velocity.x).toBeCloseTo(0, P);
    expect(r.velocity.z).toBeCloseTo(0, P);
  });
  it('diagonal input never exceeds max speed', () => {
    const r = step(IDLE, inputToward(1, 1), C, 1);
    expect(planarSpeed(r)).toBeCloseTo(C.maxSpeed, P);
    expect(r.velocity.x).toBeCloseTo(r.velocity.z, P);
  });
  it('grounded jump imparts upward velocity and leaves ground', () => {
    const r = step(IDLE, inputToward(0, 0, true), C, 1 / 60);
    expect(r.velocity.y).toBeCloseTo(C.jumpSpeed, P);
    expect(r.isGrounded).toBe(false);
  });
  it('airborne jump is ignored', () => {
    const airborne: CharacterMotion = { ...IDLE, isGrounded: false };
    const r = step(airborne, inputToward(0, 0, true), C, 0.5);
    expect(r.velocity.y).toBeCloseTo(-C.gravity * 0.5, P);
    expect(r.isGrounded).toBe(false);
  });
  it('airborne applies gravity over time', () => {
    const airborne: CharacterMotion = { ...IDLE, isGrounded: false };
    const r = step(airborne, NONE_INPUT, C, 0.5);
    expect(r.velocity.y).toBeCloseTo(-C.gravity * 0.5, P);
  });
  it('grounded without jump rests with zero vertical velocity', () => {
    const settling: CharacterMotion = { ...IDLE, velocity: vec3(0, -5, 0) };
    const r = step(settling, NONE_INPUT, C, 0.5);
    expect(r.velocity.y).toBeCloseTo(0, P);
    expect(r.isGrounded).toBe(true);
  });
  it('no input preserves previous facing', () => {
    const facingRight: CharacterMotion = { ...IDLE, facing: vec2(1, 0) };
    const r = step(facingRight, NONE_INPUT, C, 0.5);
    expect(r.facing.x).toBeCloseTo(1, P);
    expect(r.facing.y).toBeCloseTo(0, P);
  });
  it('partial input accelerates toward scaled target speed', () => {
    const r = step(IDLE, inputToward(0.5, 0), C, 1);
    expect(r.velocity.x).toBeCloseTo(C.maxSpeed * 0.5, P);
  });
  // A sub-target frame (delta=0.1) so the step doesn't snap to the target — pins the distinct
  // acceleration and deceleration rates (swapping them would fail these).
  it('a partial frame accelerates by acceleration * delta', () => {
    const r = step(IDLE, inputToward(1, 0), C, 0.1);
    expect(r.velocity.x).toBeCloseTo(C.acceleration * 0.1, P);
  });
  it('a partial frame decelerates by deceleration * delta', () => {
    const moving: CharacterMotion = { ...IDLE, velocity: vec3(C.maxSpeed, 0, 0) };
    const r = step(moving, NONE_INPUT, C, 0.1);
    expect(r.velocity.x).toBeCloseTo(C.maxSpeed - C.deceleration * 0.1, P);
  });
  it('run input accelerates to run speed, not walk speed', () => {
    const r = step(IDLE, inputToward(1, 0, false, true), C, 1);
    expect(r.velocity.x).toBeCloseTo(C.runSpeed, P);
  });
  it('run speed is faster than walk speed', () => {
    expect(C.runSpeed).toBeGreaterThan(C.maxSpeed);
  });
  it('diagonal run never exceeds run speed', () => {
    const r = step(IDLE, inputToward(1, 1, false, true), C, 1);
    expect(planarSpeed(r)).toBeCloseTo(C.runSpeed, P);
  });
  it('run with no direction stays at rest — there is no in-place sprint', () => {
    const r = step(IDLE, inputToward(0, 0, false, true), C, 1);
    expect(planarSpeed(r)).toBeCloseTo(0, P);
  });
  it('releasing run while at run speed eases back toward walk speed', () => {
    const sprinting: CharacterMotion = { ...IDLE, velocity: vec3(C.runSpeed, 0, 0) };
    const r = step(sprinting, inputToward(1, 0), C, 1);
    expect(r.velocity.x).toBeCloseTo(C.maxSpeed, P);
  });
  it('run leaves the jump path untouched', () => {
    const r = step(IDLE, inputToward(1, 0, true, true), C, 1 / 60);
    expect(r.velocity.y).toBeCloseTo(C.jumpSpeed, P);
    expect(r.isGrounded).toBe(false);
  });

  describe('turning', () => {
    const heading = (m: CharacterMotion) => Math.atan2(m.velocity.z, m.velocity.x);
    const runningAlongX: CharacterMotion = {
      ...IDLE, velocity: vec3(C.runSpeed, 0, 0), facing: vec2(1, 0),
    };

    it('turns the heading at the configured rate, not at the mercy of speed', () => {
      const r = step(runningAlongX, inputToward(0, 1, false, true), C, 0.1);
      expect(heading(r)).toBeCloseTo(C.turnRate * 0.1, P);
    });

    it('turns a sprint and a walk through the same angle in the same time', () => {
      const walkingAlongX: CharacterMotion = { ...IDLE, velocity: vec3(C.maxSpeed, 0, 0), facing: vec2(1, 0) };
      const sprint = step(runningAlongX, inputToward(0, 1, false, true), C, 0.05);
      const walk = step(walkingAlongX, inputToward(0, 1), C, 0.05);
      expect(heading(sprint)).toBeCloseTo(heading(walk), P);
    });

    it('keeps the velocity pointing where the character faces', () => {
      const r = step(runningAlongX, inputToward(0, 1, false, true), C, 0.05);
      expect(Math.atan2(r.facing.y, r.facing.x)).toBeCloseTo(heading(r), P);
    });

    it('holds speed through a turn instead of stalling mid-corner', () => {
      const r = step(runningAlongX, inputToward(0, 1, false, true), C, 0.05);
      expect(planarSpeed(r)).toBeCloseTo(C.runSpeed, P);
    });

    it('snaps the heading when starting from rest, so setting off does not pivot on the spot', () => {
      const r = step(IDLE, inputToward(1, 0), C, 1 / 60);
      expect(r.facing.x).toBeCloseTo(1, P);
    });
  });
});
