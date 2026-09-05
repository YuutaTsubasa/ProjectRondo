import { describe, it, expect } from 'vitest';
import { step } from '../../../../src/domain/hub/character/characterMovement';
import { DEFAULT_CONFIG as C } from '../../../../src/domain/hub/character/movementConfig';
import { NONE_INPUT, type MovementInput } from '../../../../src/domain/hub/character/movementInput';
import { IDLE, type CharacterMotion } from '../../../../src/domain/hub/character/characterMotion';
import { vec3 } from '../../../../src/domain/math/vec3';
import { fromRaw } from '../../../../src/domain/kernel/normalizedPlanarDirection';
import { vec2 } from '../../../../src/domain/math/vec2';

const P = 6;
const AIRBORNE: CharacterMotion = { ...IDLE, isGrounded: false, velocity: vec3(0, -2, 0) };
const pressTowards = (offset: ReturnType<typeof vec3>): MovementInput => ({ ...NONE_INPUT, homingTarget: offset });

describe('homing dash', () => {
  it('does not start from the ground — the same press is an ordinary jump there', () => {
    const r = step(IDLE, pressTowards(vec3(0, 0, -6)), C, 1 / 60);
    expect(r.homing).toBeNull();
  });

  it('starts when airborne and a target offset is supplied', () => {
    const r = step(AIRBORNE, pressTowards(vec3(0, 0, -6)), C, 1 / 60);
    expect(r.homing).not.toBeNull();
    expect(r.homing!.remaining).toBeLessThan(6);
  });

  it('travels at homingSpeed along the offset direction', () => {
    const r = step(AIRBORNE, pressTowards(vec3(0, 0, -6)), C, 1 / 60);
    expect(r.velocity.z).toBeCloseTo(-C.homingSpeed, P);
    expect(r.velocity.x).toBeCloseTo(0, P);
    expect(r.velocity.y).toBeCloseTo(0, P);
  });

  it('suspends gravity while dashing', () => {
    const dashing = step(AIRBORNE, pressTowards(vec3(0, 0, -6)), C, 1 / 60);
    const next = step(dashing, NONE_INPUT, C, 1 / 60);
    // A plain airborne frame would subtract gravity*dt from velocity.y; a dash must not.
    expect(next.velocity.y).toBeCloseTo(0, P);
  });

  it('ignores steering input while dashing', () => {
    const dashing = step(AIRBORNE, pressTowards(vec3(0, 0, -6)), C, 1 / 60);
    const steered = step(dashing, { ...NONE_INPUT, direction: fromRaw(vec2(1, 0)) }, C, 1 / 60);
    expect(steered.velocity.x).toBeCloseTo(0, P);
    expect(steered.velocity.z).toBeCloseTo(-C.homingSpeed, P);
  });

  it('bounces straight up on arrival and clears the dash', () => {
    // One frame long enough to cover the whole 6-unit offset, short enough to stay under
    // homingMaxDuration (0.6s) so the timeout does not also fire on this frame — see the
    // pre-flight correction to this brief.
    const r = step(AIRBORNE, pressTowards(vec3(0, 0, -6)), C, 0.3);
    expect(r.homing).toBeNull();
    expect(r.velocity.y).toBeCloseTo(C.homingBounceSpeed, P);
    expect(r.velocity.x).toBeCloseTo(0, P);
    expect(r.velocity.z).toBeCloseTo(0, P);
    expect(r.isGrounded).toBe(false);
  });

  it('aborts at homingMaxDuration and lets gravity resume', () => {
    let m = step(AIRBORNE, pressTowards(vec3(0, 0, -1000)), C, 1 / 60);
    for (let i = 0; i < 200 && m.homing; i++) m = step(m, NONE_INPUT, C, 1 / 60);
    expect(m.homing).toBeNull();
    const falling = step(m, NONE_INPUT, C, 1 / 60);
    expect(falling.velocity.y).toBeLessThan(0);
  });

  it('cannot restart while already dashing', () => {
    const dashing = step(AIRBORNE, pressTowards(vec3(0, 0, -6)), C, 1 / 60);
    const again = step(dashing, pressTowards(vec3(6, 0, 0)), C, 1 / 60);
    expect(again.velocity.x).toBeCloseTo(0, P);
    expect(again.velocity.z).toBeCloseTo(-C.homingSpeed, P);
  });

  it('can chain: after a bounce a new press starts a new dash', () => {
    const bounced = step(AIRBORNE, pressTowards(vec3(0, 0, -6)), C, 0.3);
    const again = step(bounced, pressTowards(vec3(0, 6, 0)), C, 1 / 60);
    expect(again.homing).not.toBeNull();
    expect(again.velocity.y).toBeCloseTo(C.homingSpeed, P);
  });

  it('does nothing when the press comes with no target', () => {
    const r = step(AIRBORNE, NONE_INPUT, C, 1 / 60);
    expect(r.homing).toBeNull();
    expect(r.velocity.y).toBeLessThan(0); // still just falling
  });

  it('turns facing to the planar projection of a sideways dash direction', () => {
    const r = step(AIRBORNE, pressTowards(vec3(6, 0, 0)), C, 1 / 60);
    expect(r.facing.x).toBeCloseTo(1, P);
    expect(r.facing.y).toBeCloseTo(0, P);
  });

  it('leaves facing unchanged for a straight-up dash, whose planar projection is zero', () => {
    const r = step(AIRBORNE, pressTowards(vec3(0, 6, 0)), C, 1 / 60);
    expect(r.facing).toEqual(AIRBORNE.facing);
  });
});
