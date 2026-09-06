import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * The IBL panorama is a shipped runtime asset with no committed generator, and this PR made losing
 * it quiet.
 *
 * `environment.ts` hands `/env/studio.hdr` to `HDRCubeTexture`. Before the `onError` fix a failed
 * fetch left every PBR material permanently not-ready and the knight simply never rendered — loud,
 * and impossible to miss. Now it degrades: a `console.warn` and armour that reads as dark, unlit
 * metal. That is the right runtime behaviour and it is also why a rename, a delete, a corrupt
 * replacement or a selectively-fetched LFS object would now ship green.
 *
 * So this pins what the code needs from the file, the way `dialogue/portraitAssets.test.ts` pins the
 * portrait binaries: the URL the source hands the browser resolves to a real RGBE panorama on disk.
 * It deliberately does not re-derive the radiance figures — `public/env/CREDITS.md` records those and
 * `tools/env/inspect_studio_hdr.mjs` recomputes them on demand.
 */
const SRC = fileURLToPath(new URL('../../src/presentation/babylon/environment.ts', import.meta.url));
const PUBLIC = fileURLToPath(new URL('../../public/', import.meta.url));

/** The URL read out of the module that owns it, so a rename fails here rather than at runtime. */
const url = () => readFileSync(SRC, 'utf8').match(/'(\/env\/[^']+)'/)?.[1];
const file = () => PUBLIC + url()!.slice(1);

describe('the studio IBL panorama', () => {
  it('is referenced by environment.ts under a /env/ URL', () => {
    expect(url(), 'no /env/ URL in environment.ts — was the IBL renamed or removed?').toBeDefined();
  });

  it('exists on disk at the URL the code serves', () => {
    expect(existsSync(file()), `${url()} is not in public/`).toBe(true);
  });

  it('is a real Radiance file, not an unfetched LFS pointer', () => {
    // LFS pointers begin "version https://git-lfs...", which is neither of the two legal signatures.
    const head = readFileSync(file()).toString('ascii', 0, 10);
    expect(head.startsWith('#?RADIANCE') || head.startsWith('#?RGBE')).toBe(true);
  });

  it('declares a resolution line and an RGBE format, so HDRCubeTexture can decode it', () => {
    const header = readFileSync(file()).toString('ascii', 0, 512);
    expect(header).toMatch(/FORMAT=32-bit_rle_rgbe/);
    // Radiance's scanline order for a standard panorama: -Y rows then +X columns.
    expect(header).toMatch(/-Y\s+\d+\s+\+X\s+\d+/);
  });

  it('carries enough bytes to be the panorama and not a stub', () => {
    // 512x256 RGBE is ~393 KB uncompressed; anything in the low kilobytes is a truncated fetch.
    expect(readFileSync(file()).byteLength).toBeGreaterThan(100_000);
  });
});
