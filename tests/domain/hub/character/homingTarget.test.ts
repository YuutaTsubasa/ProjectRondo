import { describe, it, expect } from 'vitest';
import { selectHomingTarget, type HomingSelectionConfig } from '../../../../src/domain/hub/character/homingTarget';
import { vec3, ZERO3 } from '../../../../src/domain/math/vec3';

// 35 degrees, the starting cone half-angle.
const C: HomingSelectionConfig = { homingRange: 12, homingConeHalfAngle: 0.6109 };
const AT_ORIGIN = ZERO3;
const FORWARD = vec3(0, 0, -1); // the scene is right-handed; the knight's default facing is -Z

describe('selectHomingTarget', () => {
  it('selects a candidate inside both the cone and the range', () => {
    expect(selectHomingTarget(AT_ORIGIN, FORWARD, [vec3(0, 0, -5)], C)).toBe(0);
  });

  it('rejects a candidate outside the cone', () => {
    // 90 degrees off the forward axis
    expect(selectHomingTarget(AT_ORIGIN, FORWARD, [vec3(5, 0, 0)], C)).toBeNull();
  });

  it('rejects a candidate beyond the range', () => {
    expect(selectHomingTarget(AT_ORIGIN, FORWARD, [vec3(0, 0, -20)], C)).toBeNull();
  });

  it('picks the nearest of several qualifying candidates', () => {
    const candidates = [vec3(0, 0, -9), vec3(0, 0, -3), vec3(0, 0, -6)];
    expect(selectHomingTarget(AT_ORIGIN, FORWARD, candidates, C)).toBe(1);
  });

  it('breaks an exact distance tie by lower index, so it is deterministic', () => {
    const candidates = [vec3(1, 0, -5), vec3(-1, 0, -5)];
    const first = selectHomingTarget(AT_ORIGIN, FORWARD, candidates, C);
    const second = selectHomingTarget(AT_ORIGIN, FORWARD, candidates, C);
    expect(first).toBe(0);
    expect(second).toBe(0);
  });

  it('returns null for an empty candidate list', () => {
    expect(selectHomingTarget(AT_ORIGIN, FORWARD, [], C)).toBeNull();
  });

  // A crystal can sit exactly where the player stands. The direction to it is zero-length, and
  // normalizing that is a divide by zero; the result must be a decision, never NaN.
  it('does not select a candidate coincident with the player, and returns no NaN', () => {
    const result = selectHomingTarget(AT_ORIGIN, FORWARD, [AT_ORIGIN], C);
    expect(result).toBeNull();
  });

  // A non-unit `cameraForward` must not widen the cone. This candidate is 60 degrees off axis at
  // distance 6, so normalized it dots to 0.5 — below cos(35 deg) = 0.819, correctly rejected. Left
  // un-normalized against a length-100 forward it would dot to 50, clearing any threshold and being
  // wrongly selected, which is the bug this pins.
  it('normalizes cameraForward rather than assuming it is unit length', () => {
    const sixtyDegreesOff = vec3(5.196, 0, -3); // (sin60, 0, -cos60) * 6
    expect(selectHomingTarget(AT_ORIGIN, vec3(0, 0, -100), [sixtyDegreesOff], C)).toBeNull();
    expect(selectHomingTarget(AT_ORIGIN, vec3(0, 0, -1), [sixtyDegreesOff], C)).toBeNull();
    expect(selectHomingTarget(AT_ORIGIN, vec3(0, 0, -100), [vec3(0, 0, -5)], C)).toBe(0);
  });

  // Vertical aim is the whole point for a climb: a crystal straight above must be selectable when
  // the camera looks up at it.
  it('selects a candidate above the player when the camera looks up', () => {
    expect(selectHomingTarget(AT_ORIGIN, vec3(0, 1, 0), [vec3(0, 6, 0)], C)).toBe(0);
  });
});
