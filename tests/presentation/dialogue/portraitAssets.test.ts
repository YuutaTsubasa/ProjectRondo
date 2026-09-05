import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  resolvePortrait,
  resolvePortraitAnimated,
  resolvePortraitWebm,
} from '../../../src/presentation/dialogue/portraitLibrary';

const DIR = fileURLToPath(new URL('../../../public/portraits/', import.meta.url));
const src = (name: string) =>
  fileURLToPath(new URL(`../../../src/presentation/dialogue/${name}`, import.meta.url));

const KEYS = ['neutral', 'anything-unmapped'];
const urls = () =>
  [...new Set(KEYS.flatMap((k) => [resolvePortrait(k), resolvePortraitAnimated(k), resolvePortraitWebm(k)]))];

const fileFor = (url: string) => DIR + url.replace('/portraits/', '');

/** The probe URL, read out of the module that owns it so a rename fails rather than slips past. */
const probeUrl = () => readFileSync(src('vp9Alpha.ts'), 'utf8').match(/'([^']*\/portraits\/[^']+)'/)?.[1];

const HAVE_FFMPEG = (() => {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    execFileSync('ffprobe', ['-version'], { stdio: 'ignore' }); // the frame count needs both
    return true;
  } catch { return false; }
})();

/**
 * The alpha of the top-left pixel of a decoded frame — background, in a cut-out portrait.
 *
 * This is the only check that means anything, and it is worth saying why the obvious ones do not.
 * `ffprobe` reports the *decoder's* output format, and extracting a frame to RGBA pads alpha to
 * 255: both call a file "alpha" that renders as a black rectangle. Worse, ffmpeg's **native** vp9
 * decoder silently drops this source's alpha, so an encode made without `-c:v libvpx-vp9` produces
 * a complete set of alpha chunks that are uniformly opaque. That shipped once, and looked fine to
 * every structural check.
 *
 * Node cannot decode WebP or VP9 alone, so this needs ffmpeg on PATH and names the skip in its
 * title when absent.
 */
function cornerAlpha(file: string): number {
  const args = ['-v', 'error'];
  if (file.endsWith('.webm')) args.push('-c:v', 'libvpx-vp9'); // the native decoder drops alpha
  args.push('-i', file, '-frames:v', '1', '-vf', 'format=rgba,crop=1:1:0:0', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-');
  return execFileSync('ffmpeg', args, { maxBuffer: 1 << 20 })[3];
}

describe('portrait assets', () => {
  it('every URL the library returns exists on disk', () => {
    expect(urls().filter((u) => !existsSync(fileFor(u)))).toEqual([]);
  });

  it('the probe the library does not own also exists', () => {
    expect(probeUrl()).toBeDefined();
    expect(existsSync(fileFor(probeUrl()!))).toBe(true);
  });

  it('ships no portrait file nothing references', () => {
    const referenced = new Set([...urls(), probeUrl()!].map((u) => u.replace('/portraits/', '')));
    expect(readdirSync(DIR).filter((f) => !referenced.has(f))).toEqual([]);
  });

  /** An animated WebP carries one ANMF chunk per frame; a single-image one carries none. */
  const webpFrames = (url: string) => {
    const bytes = readFileSync(fileFor(url));
    let frames = 0;
    for (let at = bytes.indexOf('ANMF'); at !== -1; at = bytes.indexOf('ANMF', at + 4)) frames += 1;
    return frames;
  };
  const isAnimated = (url: string) => webpFrames(url) > 0;

  /** Every frame's duration in ms, read from the ANMF chunk headers (24-bit LE at payload +12). */
  const webpFrameDurations = (url: string) => {
    const bytes = readFileSync(fileFor(url));
    const durations: number[] = [];
    for (let at = bytes.indexOf('ANMF'); at !== -1; at = bytes.indexOf('ANMF', at + 4)) {
      const payload = at + 8; // chunk id (4) + chunk size (4)
      durations.push(bytes.readUIntLE(payload + 12, 3));
    }
    return durations;
  };

  /** Frames actually decoded, not the count the container claims. */
  const videoFrames = (url: string) =>
    Number(
      execFileSync('ffprobe', [
        ...['-v', 'error', '-c:v', 'libvpx-vp9', '-count_frames'],
        ...['-select_streams', 'v:0', '-show_entries', 'stream=nb_read_frames'],
        ...['-of', 'default=nw=1:nokey=1', fileFor(url)],
      ]).toString().trim(),
    );

  const videoDurationMs = (url: string) =>
    Number(
      execFileSync('ffprobe', [
        ...['-v', 'error', '-show_entries', 'format=duration'],
        ...['-of', 'default=nw=1:nokey=1', fileFor(url)],
      ]).toString().trim(),
    ) * 1000;

  it('the animated WebP is actually animated', () => {
    expect(isAnimated(resolvePortraitAnimated('neutral'))).toBe(true);
  });

  // The WebM is what the probe, the three-state gate and the whole upgrade path exist to deliver,
  // and a single-frame one satisfies every other case here: it exists, it is referenced, its corner
  // decodes transparent, it ends in .webm. What it buys is a frozen idle on the engines that pass
  // the probe — the smaller population, so the regression would be the harder one to notice.
  it.skipIf(!HAVE_FFMPEG)('the WebM animates (needs ffmpeg)', () => {
    expect(videoFrames(resolvePortraitWebm('neutral'))).toBeGreaterThan(1);
  });

  // Length is time, not frames. The two files store their rate in different places — the WebM in
  // its stream, the WebP in per-frame durations — so equal frame counts at unequal rates is a loop
  // running at half or double speed against the one it stands in for, seen only by whichever
  // engines took the other branch. Both are 5166ms today.
  it.skipIf(!HAVE_FFMPEG)('the WebM runs for as long as the WebP it stands in for (needs ffmpeg)', () => {
    const durations = webpFrameDurations(resolvePortraitAnimated('neutral'));
    const webp = durations.reduce((total, frame) => total + frame, 0);
    const webm = videoDurationMs(resolvePortraitWebm('neutral'));
    // Tolerance is one frame of the WebP, taken from the file rather than guessed: the containers
    // round their totals differently, and a drift that small cannot be seen.
    expect(Math.abs(webm - webp)).toBeLessThanOrEqual(Math.max(...durations));
  });

  // The still is the frame shown under prefers-reduced-motion, where an <img> could not be stopped
  // if it did move, and it is also the video's poster. The two files sit in one directory and
  // differ by a "_still" suffix, so swapping an animated encode into it is an easy accident -- and
  // one every other check here survives: it still exists, is still referenced, and its first
  // frame's corner is still transparent.
  it('the still is a single frame, since nothing downstream could stop it moving', () => {
    expect(isAnimated(resolvePortrait('neutral'))).toBe(false);
  });

  // The portrait stands over the live 3D scene. Without a usable alpha the removed background comes
  // back as an opaque rectangle in front of the hub, which nothing else here can see.
  it.skipIf(!HAVE_FFMPEG)('every portrait is genuinely transparent, not merely alpha-capable (needs ffmpeg)', () => {
    expect(urls().filter((u) => cornerAlpha(fileFor(u)) !== 0)).toEqual([]);
  });

  it.skipIf(!HAVE_FFMPEG)('the VP9 probe is fully transparent, or it proves nothing (needs ffmpeg)', () => {
    expect(cornerAlpha(fileFor(probeUrl()!))).toBe(0);
  });

  // The WebM is the upgrade, never the baseline: WKWebView plays VP9 and ignores its alpha, so an
  // engine that cannot answer the probe must still be handed something safe. Whether the gate is
  // wired correctly is a rendering question, pinned in portraitSource.test.ts against the DOM; what
  // belongs here is that the files the ungated paths point at are safe everywhere.
  it('keeps every ungated path on a format that carries alpha universally', () => {
    const ungated = KEYS.flatMap((k) => [resolvePortrait(k), resolvePortraitAnimated(k)]);
    expect(ungated.filter((u) => !u.endsWith('.webp'))).toEqual([]);
  });

  it('offers VP9 only through the gated accessor', () => {
    const webms = urls().filter((u) => u.endsWith('.webm'));
    expect(webms).toEqual(KEYS.map((k) => resolvePortraitWebm(k)).filter((u, i, a) => a.indexOf(u) === i));
  });
});
