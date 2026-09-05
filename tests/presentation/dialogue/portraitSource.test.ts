// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';

/**
 * Which file the portrait asks the network for, in each of the three states of the alpha probe.
 *
 * The expensive mistake this pins is not a broken render -- every branch here paints a correct
 * portrait. It is that reaching for the animated WebP before the probe answers starts a 2.2MB
 * download that a positive answer immediately discards, on the machines that needed none of it.
 * Nothing in the rendered output looks wrong when that happens, which is why it is asserted here.
 */
let answer: (supported: boolean) => void;
vi.mock('../../../src/presentation/dialogue/vp9Alpha', () => ({
  supportsVp9Alpha: () => new Promise<boolean>((resolve) => { answer = resolve; }),
}));

const { default: Portrait } = await import('../../../src/presentation/dialogue/Portrait.svelte');
const STILL = '/portraits/knight_idle_still.webp';
const ANIMATED = '/portraits/knight_idle.webp';
const WEBM = '/portraits/knight_idle.webm';

let target: HTMLElement;
let component: Record<string, unknown>;

const render = () => {
  component = mount(Portrait, { target, props: { portrait: 'neutral' } });
  flushSync();
};
/** The source actually requested, read off the DOM rather than off the component's state. */
const shown = () => {
  const el = target.querySelector<HTMLImageElement | HTMLVideoElement>('.portrait')!;
  return { tag: el.tagName, src: el.getAttribute('src'), poster: el.getAttribute('poster') };
};
const settle = async (supported: boolean) => {
  answer(supported);
  await Promise.resolve();
  flushSync();
};

beforeEach(() => {
  target = document.createElement('div');
  document.body.append(target);
  // jsdom has no matchMedia, and the component follows prefers-reduced-motion through it.
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  }) as unknown as typeof window.matchMedia;
});
afterEach(() => {
  if (component) unmount(component);
  target.remove();
});

describe('Portrait source selection', () => {
  it('shows the still while the probe is unanswered, fetching neither animated file', () => {
    render();
    expect(shown()).toMatchObject({ tag: 'IMG', src: STILL });
  });

  it('upgrades to the WebM once the engine proves it honours VP9 alpha', async () => {
    render();
    await settle(true);
    // The poster is the file already on screen, so the upgrade costs one request, not two.
    expect(shown()).toEqual({ tag: 'VIDEO', src: WEBM, poster: STILL });
  });

  it('falls back to the animated WebP when the engine fails the probe', async () => {
    render();
    await settle(false);
    expect(shown()).toMatchObject({ tag: 'IMG', src: ANIMATED });
  });

  it('never reaches for the WebM when the answer is not a definite yes', async () => {
    render();
    await settle(false);
    expect(target.querySelector('video')).toBeNull();
    expect(shown().src).not.toBe(WEBM);
  });

  it('holds the still under prefers-reduced-motion, even on an engine that passes', async () => {
    window.matchMedia = vi.fn().mockReturnValue({
      matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn(),
    }) as unknown as typeof window.matchMedia;
    render();
    await settle(true);
    expect(shown()).toMatchObject({ tag: 'IMG', src: STILL });
  });
});
