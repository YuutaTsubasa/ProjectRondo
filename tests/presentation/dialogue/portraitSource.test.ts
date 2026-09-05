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

type Listener = (event: MediaQueryListEvent) => void;

/**
 * A prefers-reduced-motion stub that can change its mind afterwards.
 *
 * `legacy` is Safari before 14, where `MediaQueryList` is not an `EventTarget`: `addEventListener`
 * is absent rather than inert, so a component that reaches for it throws. That is WKWebView, which
 * is the whole reason the VP9 probe next door exists, so both shapes are worth having here.
 */
const stubMatchMedia = (initial: boolean, { legacy = false } = {}) => {
  const listeners = new Set<Listener>();
  const modern = {
    addEventListener: (_: string, fn: Listener) => { listeners.add(fn); },
    removeEventListener: (_: string, fn: Listener) => { listeners.delete(fn); },
  };
  const old = {
    addListener: (fn: Listener) => { listeners.add(fn); },
    removeListener: (fn: Listener) => { listeners.delete(fn); },
  };
  const query = {
    matches: initial,
    media: '(prefers-reduced-motion: reduce)',
    onchange: null,
    dispatchEvent: () => false,
    ...(legacy ? old : modern),
  };
  window.matchMedia = (() => query) as unknown as typeof window.matchMedia;
  return {
    change(matches: boolean) {
      query.matches = matches;
      listeners.forEach((fn) => fn({ matches } as MediaQueryListEvent));
      flushSync();
    },
    listening: () => listeners.size,
  };
};

let target: HTMLElement;
let component: Record<string, unknown> | undefined;

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
  stubMatchMedia(false); // jsdom has no matchMedia, and the component reads it on mount
});
afterEach(() => {
  if (component) unmount(component);
  component = undefined;
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

  // What makes this element a portrait rather than a video player, and each one fails silently:
  // without `muted` autoplay is blocked and the poster sits frozen; without `playsinline` iOS and
  // WKWebView hand the clip to the fullscreen player, on the very engine this feature is built
  // around; without `loop` the idle stops after 5.166s; without `autoplay` it never starts.
  it('plays the idle unattended and in place', async () => {
    render();
    await settle(true);
    const video = target.querySelector('video')!;
    // Properties, not attributes: Svelte compiles `muted` on a media element to a property
    // assignment, and the content attribute would set `defaultMuted` anyway. The autoplay policy
    // reads the property, so that is the one worth asserting -- confirmed against Chromium, where
    // the element carries no muted attribute and plays regardless.
    expect({
      autoplay: video.autoplay,
      loop: video.loop,
      muted: video.muted,
      playsInline: video.playsInline,
      controls: video.controls,
    }).toEqual({ autoplay: true, loop: true, muted: true, playsInline: true, controls: false });
  });

  it('keeps the decorative video out of the accessibility tree, as the <img> already is', async () => {
    render();
    await settle(true);
    const video = target.querySelector('video')!;
    expect(video.getAttribute('aria-hidden')).toBe('true');
    expect(video.tabIndex).toBe(-1);
  });
});

describe('Portrait and prefers-reduced-motion', () => {
  it('holds the still when the setting is already on at mount', async () => {
    stubMatchMedia(true);
    render();
    await settle(true);
    expect(shown()).toMatchObject({ tag: 'IMG', src: STILL });
  });

  it('drops the animation when the setting is turned on mid-session', async () => {
    const media = stubMatchMedia(false);
    render();
    await settle(true);
    expect(shown().tag).toBe('VIDEO');
    media.change(true);
    expect(shown()).toMatchObject({ tag: 'IMG', src: STILL });
  });

  it('picks the animation back up when the setting is turned off again', async () => {
    const media = stubMatchMedia(true);
    render();
    await settle(true);
    media.change(false);
    expect(shown()).toMatchObject({ tag: 'VIDEO', src: WEBM });
  });

  it('subscribes through the pre-14 WebKit API when addEventListener is absent', async () => {
    const media = stubMatchMedia(false, { legacy: true });
    render();
    await settle(true);
    expect(media.listening()).toBe(1);
    media.change(true);
    expect(shown()).toMatchObject({ tag: 'IMG', src: STILL });
  });

  it('unsubscribes on teardown, through whichever API it subscribed with', async () => {
    for (const legacy of [false, true]) {
      const media = stubMatchMedia(false, { legacy });
      render();
      await settle(true);
      expect(media.listening()).toBe(1);
      unmount(component!);
      component = undefined;
      expect(media.listening()).toBe(0);
    }
  });
});
