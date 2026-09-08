import { describe, expect, it } from 'vitest';

import {
  DESCENT_ENGAGE_SPEED,
  DESCENT_SMOOTHING,
  verticalFollowRate,
} from '../../src/presentation/babylon/followCamera';
import { DEFAULT_CONFIG } from '../../src/domain/hub/character/movementConfig';

/** The tuned vertical rate every level starts from — `FollowCameraConfig.verticalSmoothing`'s
 *  default. Named for the hub because the hub is where it was tuned. */
const HUB_RATE = 9;

/**
 * The fastest descent measured out of ordinary movement, in world units per second: scripted
 * walk/run/jump runs across the hub's height field peak here (design spec §13.2). The rendered root,
 * which is what the camera actually measures, peaked lower still, at 14.28.
 */
const HUB_MEASURED_PEAK_DESCENT = 15.8;

/**
 * A ballistic sweep of every walkable launch point bounds a running jump here — an over-estimate,
 * since it flies a free parabola through ground the capsule would have landed on (spec §13.2).
 */
const HUB_RUNNING_JUMP_BOUND = 16.6;

/**
 * The rate this function returns, given a descent speed — and only that. Whether a level's camera
 * calls it at all is `FollowCameraConfig.descentFollow`'s question and the observer's, which
 * `followCameraObserver.test.ts` holds; the hub does not, so for the hub these are properties of
 * code that never runs rather than of the camera it ships.
 */
describe('verticalFollowRate', () => {
  it('is the tuned camera untouched at every descent speed ordinary movement reaches', () => {
    // Identity, not tolerance: `Object.is` is the whole point. The camera's smoothing is
    // `1 - exp(-rate * dt)`, so a rate that is 9 to within a rounding error is not 9, and the hub's
    // tuned camera would drift from the one it was tuned as.
    for (const descent of [0, 1, HUB_RATE, 12, 14.28, HUB_MEASURED_PEAK_DESCENT, HUB_RUNNING_JUMP_BOUND, DESCENT_ENGAGE_SPEED]) {
      expect(Object.is(verticalFollowRate(HUB_RATE, descent), HUB_RATE)).toBe(true);
    }
  });

  it('leaves a margin between what walking and jumping reach and the engage speed', () => {
    expect(DESCENT_ENGAGE_SPEED).toBeGreaterThan(HUB_RUNNING_JUMP_BOUND);
    expect(DESCENT_ENGAGE_SPEED).toBeGreaterThan(HUB_MEASURED_PEAK_DESCENT);
  });

  it('engages before the framing is lost', () => {
    // Unaided, the knight's root crosses the bottom edge of the frame at 19.6 u/s of descent
    // (spec §13.2). A threshold at or above that would engage too late to keep the player in frame.
    expect(DESCENT_ENGAGE_SPEED).toBeLessThan(19.6);
  });

  it('ramps rather than stepping, so brushing the threshold is not a jolt', () => {
    const justOver = verticalFollowRate(HUB_RATE, DESCENT_ENGAGE_SPEED + 0.05);
    expect(justOver).toBeGreaterThan(HUB_RATE);
    expect(justOver).toBeLessThan(HUB_RATE + 3);
  });

  it('reaches the descent rate and stops there, however fast the fall', () => {
    // 36.7 u/s is the fastest fall the tower's checkpoint spacing allows before a respawn fires —
    // section 2's 28 u drop. Nothing in the tower asks for more than the ceiling.
    for (const descent of [20, 30.98, 33.6, 36.7, 1000]) {
      expect(verticalFollowRate(HUB_RATE, descent)).toBe(DESCENT_SMOOTHING);
    }
  });

  it('never decreases as the fall speeds up', () => {
    let previous = -Infinity;
    for (let descent = 0; descent <= 40; descent += 0.25) {
      const rate = verticalFollowRate(HUB_RATE, descent);
      expect(rate).toBeGreaterThanOrEqual(previous);
      previous = rate;
    }
  });

  it('engages only above a speed gravity needs real height to reach', () => {
    // Sanity on the units, in the domain's own terms: reaching the engage speed takes a free fall of
    // `v²/(2·gravity)`, and that has to be a drop the level's own geometry makes rare rather than one
    // an ordinary jump produces on landing. The apex a jump reaches — `jumpSpeed²/(2·gravity)`, the
    // height the character is built around — is the yardstick, and the margin is what carries the
    // meaning here. How far the fall works out to in units is a consequence of the threshold rather
    // than a requirement on it, so it is not restated: `DESCENT_ENGAGE_SPEED` is the number this
    // suite pins, and pinning its arithmetic twice would only mean two edits instead of one.
    const { gravity, jumpSpeed } = DEFAULT_CONFIG;
    const fallToEngage = (DESCENT_ENGAGE_SPEED * DESCENT_ENGAGE_SPEED) / (2 * gravity);
    const jumpApex = (jumpSpeed * jumpSpeed) / (2 * gravity);
    expect(fallToEngage).toBeGreaterThan(jumpApex * 3);
  });
});
