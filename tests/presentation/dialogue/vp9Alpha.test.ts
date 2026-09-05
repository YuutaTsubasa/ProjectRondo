// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';

/**
 * The probe's whole value is that a wrong answer is cheap: the caller upgrades to VP9 only on
 * `true`, so every other outcome must arrive as `false` rather than as a rejection or a hang.
 *
 * jsdom never loads media and has no canvas, so the decision itself — the `loadeddata` handler —
 * only runs against stand-ins. They are built to be able to fail in the same direction the real
 * thing did: `drawImage` can be a no-op, and compositing is modelled rather than assumed, so a
 * probe that forgot either would fail here rather than pass for the wrong reason.
 *
 * Timers are faked throughout so that a case cannot pass by quietly falling through to the 2s
 * timeout, which also answers `false`.
 */
const load = async () => {
  vi.resetModules(); // the module caches its answer for the session
  return (await import('../../../src/presentation/dialogue/vp9Alpha')).supportsVp9Alpha;
};

type Frame = {
  /** Alpha of the decoded frame, 0-255. The real probe clip is fully transparent. */
  frameAlpha?: number;
  /** `drawImage` returns silently when there is no frame to draw. This is the round-1 defect. */
  drawIsNoop?: boolean;
  width?: number;
  height?: number;
  readyState?: number;
  noContext?: boolean;
  readThrows?: boolean;
};

/**
 * A one-pixel canvas that composites the way a real one does.
 *
 * `source-over` onto an opaque destination stays opaque whatever the source's alpha — which is why
 * the probe has to ask for `copy`, and why modelling this beats recording calls: a probe that
 * dropped `copy` reads here as "no engine supports alpha", which is a failing test rather than a
 * passing one.
 */
const canvasFor = ({
  frameAlpha = 0,
  drawIsNoop = false,
  noContext = false,
  readThrows = false,
}: Frame) => {
  let pixel = 0; // a fresh canvas is transparent black
  const context = {
    globalCompositeOperation: 'source-over',
    fillStyle: '',
    fillRect: () => {
      pixel = 255;
    },
    drawImage: () => {
      if (drawIsNoop) return;
      pixel =
        context.globalCompositeOperation === 'copy'
          ? frameAlpha
          : 255 - Math.round(((255 - frameAlpha) * (255 - pixel)) / 255);
    },
    getImageData: () => {
      if (readThrows) throw new Error('tainted canvas');
      return { data: [0, 0, 0, pixel] };
    },
  };
  return { width: 0, height: 0, getContext: () => (noContext ? null : context) };
};

/** `MediaError` codes. jsdom defines neither the interface nor the constants. */
const MEDIA_ERR_NETWORK = 2;
const MEDIA_ERR_DECODE = 3;
const MEDIA_ERR_SRC_NOT_SUPPORTED = 4;

/** Stands the DOM up so the probe meets a video that has decoded `frame`, and returns its triggers. */
const stubDom = (frame: Frame) => {
  const real = document.createElement.bind(document);
  const videos: HTMLVideoElement[] = [];
  let mediaError: { code: number } | null = null;
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    if (tag === 'canvas') return canvasFor(frame) as unknown as HTMLCanvasElement;
    const element = real(tag);
    if (tag === 'video') {
      Object.defineProperties(element, {
        videoWidth: { value: frame.width ?? 2 },
        videoHeight: { value: frame.height ?? 2 },
        readyState: { value: frame.readyState ?? HTMLMediaElement.HAVE_CURRENT_DATA },
        error: { get: () => mediaError },
      });
      videos.push(element as HTMLVideoElement);
    }
    return element;
  });
  const latest = () => videos[videos.length - 1];
  return {
    decode: () => latest().dispatchEvent(new Event('loadeddata')),
    /** `code` omitted means the element reports no MediaError at all, which browsers do allow. */
    fail: (code?: number) => {
      mediaError = code === undefined ? null : { code };
      latest().dispatchEvent(new Event('error'));
    },
    probes: () => videos.length,
  };
};

describe('supportsVp9Alpha decides from the decoded frame', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('says yes when the frame really is transparent', async () => {
    vi.useFakeTimers();
    const dom = stubDom({ frameAlpha: 0 });
    const supports = await load();
    const result = supports();
    dom.decode();
    await expect(result).resolves.toBe(true);
  });

  it('says no when the engine paints the transparent frame opaque', async () => {
    vi.useFakeTimers();
    const dom = stubDom({ frameAlpha: 255 });
    const supports = await load();
    const result = supports();
    dom.decode();
    await expect(result).resolves.toBe(false);
  });

  // The round-1 defect: a canvas cleared to transparent and never drawn on reads exactly like a
  // decoded transparent frame, and answering `true` there enables VP9 on an engine that decoded
  // nothing at all — the one population the probe exists to exclude.
  it('says no when the draw silently does nothing', async () => {
    vi.useFakeTimers();
    const dom = stubDom({ frameAlpha: 0, drawIsNoop: true });
    const supports = await load();
    const result = supports();
    dom.decode();
    await expect(result).resolves.toBe(false);
  });

  it('says no when the frame has no intrinsic size', async () => {
    vi.useFakeTimers();
    const dom = stubDom({ width: 0, height: 0 });
    const supports = await load();
    const result = supports();
    dom.decode();
    await expect(result).resolves.toBe(false);
  });

  it('says no when loadeddata fires before there is a current frame', async () => {
    vi.useFakeTimers();
    const dom = stubDom({ readyState: HTMLMediaElement.HAVE_METADATA });
    const supports = await load();
    const result = supports();
    dom.decode();
    await expect(result).resolves.toBe(false);
  });

  it('says no when there is no 2D context to draw into', async () => {
    vi.useFakeTimers();
    const dom = stubDom({ noContext: true });
    const supports = await load();
    const result = supports();
    dom.decode();
    await expect(result).resolves.toBe(false);
  });

  it('says no when reading the pixel back throws', async () => {
    vi.useFakeTimers();
    const dom = stubDom({ readThrows: true });
    const supports = await load();
    const result = supports();
    dom.decode();
    await expect(result).resolves.toBe(false);
  });
});

describe('supportsVp9Alpha remembers only what it settled', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('probes once when the frame answered the question', async () => {
    vi.useFakeTimers();
    const dom = stubDom({ frameAlpha: 0 });
    const supports = await load();
    const first = supports();
    dom.decode();
    await expect(first).resolves.toBe(true);
    await expect(supports()).resolves.toBe(true);
    expect(dom.probes()).toBe(1);
  });

  it('does not probe again once an engine has been ruled out', async () => {
    vi.useFakeTimers();
    const dom = stubDom({ frameAlpha: 255 });
    const supports = await load();
    const first = supports();
    dom.decode();
    await expect(first).resolves.toBe(false);
    await expect(supports()).resolves.toBe(false);
    expect(dom.probes()).toBe(1);
  });

  // A 591-byte fetch losing a race against the hub's GLB and the Havok wasm says nothing about the
  // decoder, so it must not become the session's answer. The one caller today mounts once, so what
  // this pins is the exported contract rather than a path the running app takes.
  it('probes again after a timeout, which was never an answer about the engine', async () => {
    vi.useFakeTimers();
    const dom = stubDom({ frameAlpha: 0 });
    const supports = await load();
    const first = supports();
    await vi.advanceTimersByTimeAsync(2000);
    await expect(first).resolves.toBe(false);

    const second = supports();
    dom.decode();
    await expect(second).resolves.toBe(true);
    expect(dom.probes()).toBe(2);
  });

  it('probes again after the fetch failed on the network', async () => {
    vi.useFakeTimers();
    const dom = stubDom({ frameAlpha: 0 });
    const supports = await load();
    const first = supports();
    dom.fail(MEDIA_ERR_NETWORK);
    await expect(first).resolves.toBe(false);

    const second = supports();
    dom.decode();
    await expect(second).resolves.toBe(true);
    expect(dom.probes()).toBe(2);
  });

  it('probes again when the element reports no error code at all', async () => {
    vi.useFakeTimers();
    const dom = stubDom({ frameAlpha: 0 });
    const supports = await load();
    const first = supports();
    dom.fail();
    await expect(first).resolves.toBe(false);

    const second = supports();
    dom.decode();
    await expect(second).resolves.toBe(true);
    expect(dom.probes()).toBe(2);
  });

  // An engine with no VP9 never reaches `loadeddata`; it errors. That is the cheapest certain "no"
  // the probe can obtain, so treating it as inconclusive would discard the clearest answer of all
  // and re-fetch on every later mount to be told the same thing again.
  it.each([
    ['the source outright', MEDIA_ERR_SRC_NOT_SUPPORTED],
    ['the decode', MEDIA_ERR_DECODE],
  ])('remembers the answer when the engine rejected %s', async (_label, code) => {
    vi.useFakeTimers();
    const dom = stubDom({ frameAlpha: 0 });
    const supports = await load();
    const first = supports();
    dom.fail(code);
    await expect(first).resolves.toBe(false);
    await expect(supports()).resolves.toBe(false);
    expect(dom.probes()).toBe(1);
  });
});

describe('supportsVp9Alpha never rejects', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // jsdom is a real instance of the awkward case rather than a stand-in for one: its `play()`
  // returns undefined, exactly as WebKit's did before the method returned a promise.
  it('answers false, not a rejection, when play() returns undefined instead of a promise', async () => {
    vi.useFakeTimers();
    const supports = await load();
    const result = supports();
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
});
