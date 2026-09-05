import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolvePortrait, resolvePortraitMotion } from '../../../src/presentation/dialogue/portraitLibrary';

const DIR = fileURLToPath(new URL('../../../public/portraits/', import.meta.url));
const LIB = fileURLToPath(new URL('../../../src/presentation/dialogue/portraitLibrary.ts', import.meta.url));

/** Every URL the library can hand back, including the fallbacks. */
const urls = () => {
  const keys = ['neutral', 'anything-unmapped'];
  return [...new Set(keys.flatMap((k) => [resolvePortrait(k), resolvePortraitMotion(k)]))]
    .filter((u): u is string => typeof u === 'string');
};

const fileFor = (url: string) => DIR + url.replace('/portraits/', '');

/**
 * Whether a WebP carries an alpha channel.
 *
 * A lossy WebP declares it in the VP8X flags (bit 0x10); an animated one also carries a per-frame
 * ALPH chunk; a lossless one is VP8L, which has alpha natively. Checking any single one of those is
 * not enough, and the obvious checks are worse than useless: ffprobe reports the *decoder's* output
 * format, and decoding a frame to RGBA pads alpha to 255, so both report "alpha" for a file that
 * has none. Producing these assets lost the alpha twice before this test existed, and neither of
 * those checks noticed.
 */
function hasAlpha(file: string): boolean {
  const bytes = readFileSync(file);
  const has = (tag: string) => bytes.indexOf(Buffer.from(tag)) !== -1;
  const vp8x = bytes.indexOf(Buffer.from('VP8X'));
  return has('ALPH') || has('VP8L') || (vp8x !== -1 && (bytes[vp8x + 8] & 0x10) !== 0);
}

/**
 * The alpha of the frame's top-left pixel, read out of the decoded image.
 *
 * Shelling out to ffmpeg keeps this honest: decoding the WebP in-process would mean trusting the
 * same library that produced it. The corner of a cut-out portrait is background by construction.
 *
 * Node cannot decode WebP on its own, so this one case needs ffmpeg on PATH and is skipped without
 * it -- the structural check above still runs everywhere. The skip is named in the test title so an
 * absent ffmpeg shows up in the output rather than looking like a pass.
 */
const HAVE_FFMPEG = (() => {
  try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); return true; } catch { return false; }
})();

function cornerAlpha(file: string): number {
  const raw = execFileSync(
    'ffmpeg',
    ['-v', 'error', '-i', file, '-frames:v', '1', '-vf', 'crop=8:8:0:0,scale=1:1', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'],
    { maxBuffer: 1 << 20 },
  );
  return raw[3];
}

describe('portrait assets', () => {
  it('every URL the library returns exists on disk', () => {
    expect(urls().filter((u) => !existsSync(fileFor(u)))).toEqual([]);
  });

  it('ships no portrait file the library never returns', () => {
    const referenced = new Set(urls().map((u) => u.replace('/portraits/', '')));
    expect(readdirSync(DIR).filter((f) => !referenced.has(f))).toEqual([]);
  });

  // The portrait stands over the live 3D scene. Without alpha the removed background returns as an
  // opaque rectangle in front of the hub -- a total visual failure that no other check here sees.
  it('every portrait carries an alpha channel', () => {
    expect(urls().filter((u) => !hasAlpha(fileFor(u)))).toEqual([]);
  });

  // Carrying an alpha channel is not the same as using it, and the difference is the whole defect.
  // ffmpeg's native vp9 decoder silently drops this source's alpha, and re-encoding the result
  // produced files with a full set of ALPH chunks that were uniformly opaque -- passing the check
  // above while rendering a black rectangle over the scene. The corner of the frame is background,
  // so it must be transparent.
  it.skipIf(!HAVE_FFMPEG)('the alpha is actually transparent, not a fully opaque channel (needs ffmpeg)', () => {
    expect(urls().filter((u) => cornerAlpha(fileFor(u)) !== 0)).toEqual([]);
  });

  it('the animated portrait is actually animated', () => {
    const motion = resolvePortraitMotion('neutral');
    expect(motion).toBeDefined();
    expect(readFileSync(fileFor(motion!)).indexOf(Buffer.from('ANMF'))).toBeGreaterThan(-1);
  });

  // The library documents why these are WebP rather than a <video>: WKWebView has no VP9 alpha.
  // A future edit that reaches for .webm would silently break the macOS and iOS bundles.
  it('references no format WKWebView cannot show with alpha', () => {
    expect(urls().filter((u) => /\.(webm|mp4|mov)$/i.test(u))).toEqual([]);
    expect(readFileSync(LIB, 'utf8')).toContain('WKWebView');
  });
});
