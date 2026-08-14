import { describe, it, expect } from 'vitest';
import { step } from '../../../../src/domain/hub/character/characterMovement';
import { DEFAULT_CONFIG as C } from '../../../../src/domain/hub/character/movementConfig';
import { NONE_INPUT, type MovementInput } from '../../../../src/domain/hub/character/movementInput';
import { IDLE, type CharacterMotion } from '../../../../src/domain/hub/character/characterMotion';
import { fromRaw } from '../../../../src/domain/kernel/normalizedPlanarDirection';
import { vec2, length } from '../../../../src/domain/math/vec2';
import { vec3 } from '../../../../src/domain/math/vec3';

const P = 3;
const inputToward = (rawX: number, rawY: number, jump = false): MovementInput =>
  ({ direction: fromRaw(vec2(rawX, rawY)), jumpRequested: jump });
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
});
