/** Seconds: a quick lid close, a short closed pause, and a gentler reopening. */
export const BLINK_TIMING = { close: 0.08, hold: 0.03, open: 0.14, minWait: 3, maxWait: 6 } as const;
const duration = BLINK_TIMING.close + BLINK_TIMING.hold + BLINK_TIMING.open;
const smooth = (t: number) => t * t * (3 - 2 * t);

/** Normalized influence for one blink; negative time means the eyes are still waiting open. */
export function blinkInfluence(seconds: number): number {
  if (seconds <= 0 || seconds >= duration) return 0;
  if (seconds < BLINK_TIMING.close) return smooth(seconds / BLINK_TIMING.close);
  const opening = seconds - BLINK_TIMING.close - BLINK_TIMING.hold;
  return opening <= 0 ? 1 : 1 - smooth(opening / BLINK_TIMING.open);
}

/** Independent of the skeletal animation clock and reproducible with an injected random source. */
export function createBlinkClock(random: () => number = Math.random) {
  const delay = () => BLINK_TIMING.minWait + random() * (BLINK_TIMING.maxWait - BLINK_TIMING.minWait);
  let elapsed = -delay();
  return {
    advance(seconds: number): number {
      if (!Number.isFinite(seconds) || seconds < 0) return blinkInfluence(elapsed);
      elapsed += seconds;
      // The scene adapter bounds frame deltas. Discard excess time instead of replaying stale blinks.
      if (elapsed >= duration) elapsed = -delay();
      return blinkInfluence(elapsed);
    },
  };
}
