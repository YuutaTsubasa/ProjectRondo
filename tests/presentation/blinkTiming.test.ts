import { describe, expect, it, vi } from 'vitest';
import { blinkInfluence, createBlinkClock } from '../../src/presentation/babylon/blinkTiming';

describe('automatic blink timing', () => {
  it('closes quickly, holds briefly, opens more slowly, and returns exactly to neutral', () => {
    expect(blinkInfluence(-1)).toBe(0);
    expect(blinkInfluence(0.04)).toBeCloseTo(0.5);
    expect(blinkInfluence(0.08)).toBe(1);
    expect(blinkInfluence(0.10)).toBe(1);
    expect(blinkInfluence(0.18)).toBeCloseTo(0.5);
    expect(blinkInfluence(0.25)).toBe(0);
    expect(blinkInfluence(1)).toBe(0);
  });
  it('waits a newly randomized 3-6 seconds between complete blinks', () => {
    const random = vi.fn().mockReturnValueOnce(0).mockReturnValue(1);
    const clock = createBlinkClock(random);
    expect(clock.advance(2.9)).toBe(0);
    expect(clock.advance(0.14)).toBeCloseTo(0.5);
    expect(clock.advance(0.04)).toBeCloseTo(1);
    expect(clock.advance(0.18)).toBe(0);
    expect(random).toHaveBeenCalledTimes(2);
    expect(clock.advance(5.9)).toBe(0);
    expect(clock.advance(0.14)).toBeCloseTo(0.5);
  });
  it('depends on elapsed time rather than display refresh rate', () => {
    const slow = createBlinkClock(() => 0), fast = createBlinkClock(() => 0);
    for (let i = 0; i < 304; i++) slow.advance(0.01);
    for (let i = 0; i < 608; i++) fast.advance(0.005);
    expect(slow.advance(0)).toBeCloseTo(fast.advance(0), 8);
  });
  it('ignores invalid deltas without corrupting the next blink', () => {
    const clock = createBlinkClock(() => 0);
    for (const delta of [-1, NaN, Infinity]) expect(clock.advance(delta)).toBe(0);
    expect(clock.advance(3.04)).toBeCloseTo(0.5);
  });
});
