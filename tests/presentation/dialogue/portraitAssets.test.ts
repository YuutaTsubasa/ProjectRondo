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
  try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); return true; } catch { return false; }
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
  const isAnimated = (url: string) => readFileSync(fileFor(url)).includes(Buffer.from('ANMF'));

  it('the animated WebP is actually animated', () => {
    expect(isAnimated(resolvePortraitAnimated('neutral'))).toBe(true);
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
