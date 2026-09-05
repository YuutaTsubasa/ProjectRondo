// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';

/**
 * The probe's whole value is that a wrong answer is cheap: the caller upgrades to VP9 only on
 * `true`, so every other outcome must arrive as `false` rather than as a rejection or a hang. A
 * rejection would be cached, and the portrait would then wait forever for an answer that cannot
 * come.
 *
 * jsdom is a real instance of the awkward case rather than a stand-in for one: its `play()` returns
 * undefined, exactly as WebKit's did before the method returned a promise.
 *
 * Timers are faked throughout so that a case cannot pass by quietly falling through to the 2s
 * timeout -- which returns `false` too, and would make three of these four assertions vacuous.
 */
const load = async () => {
  vi.resetModules(); // the module caches its answer for the session
  return (await import('../../../src/presentation/dialogue/vp9Alpha')).supportsVp9Alpha;
};

/** The <video> the probe builds, so a test can drive the element under test rather than a copy. */
const captureVideo = () => {
  const real = document.createElement.bind(document);
  const spy = vi.spyOn(document, 'createElement');
  let video: HTMLVideoElement | undefined;
  spy.mockImplementation((tag: string) => {
    const el = real(tag);
    if (tag === 'video') video = el as HTMLVideoElement;
    return el;
  });
  return () => video;
};

describe('supportsVp9Alpha', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('answers false, not a rejection, when play() returns undefined instead of a promise', async () => {
    vi.useFakeTimers();
    const supports = await load();
    const result = supports();
    // Nothing decodes under jsdom, so the timeout is the only way out -- the point of the case is
    // that the answer is still an answer. Before `play()` was wrapped, this rejected synchronously.
    await vi.advanceTimersByTimeAsync(2000);
    await expect(result).resolves.toBe(false);
  });

  it('answers false when building the probe throws outright', async () => {
    vi.useFakeTimers();
    vi.spyOn(document, 'createElement').mockImplementation(() => {
      throw new Error('no DOM here');
    });
    const supports = await load();
    // No timers advanced: a throw has to be caught, not waited out.
    await expect(supports()).resolves.toBe(false);
  });

  it('answers false as soon as the clip errors, without waiting out the timeout', async () => {
    vi.useFakeTimers();
    const video = captureVideo();
    const supports = await load();
    const result = supports();
    expect(video()).toBeDefined();
    video()!.dispatchEvent(new Event('error'));
    await expect(result).resolves.toBe(false);
  });

  it('probes once and reuses the answer', async () => {
    vi.useFakeTimers();
    const supports = await load();
    expect(supports()).toBe(supports());
  });
});
