import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { MANIFEST } from '../../src/presentation/audio/manifest';

/**
 * `satisfies Record<SoundCue, CueSpec>` gets the manifest as far as "every cue has files, and each is
 * a string". It cannot get any further: whether `/audio/sfx/ui_move.ogg` names a file that is actually
 * on disk is not something a type can see, so a typo, a rename, or a `to:` changed in
 * `tools/audio/preprocess.mjs` type-checks cleanly and then reaches a player as one
 * `[audio] cue "…" unavailable` line in a console nobody is reading — the sound bank's missing-asset
 * policy is deliberately not fatal (soundBank.ts's `load`), which is exactly what makes a broken path
 * quiet. The paths are the one part of this table that can be checked against reality, so they are.
 *
 * Read off disk with `node:fs`, as `tests/app/fonts.test.ts` and `tests/app/tokens.test.ts` do:
 * `public/` is served at the site root by both the dev server and the build, so a manifest path
 * resolved against `public/` is the path the browser will actually request. `existsSync` rather than
 * a directory listing because that is the whole question — nothing here opens a file, let alone
 * decodes three megabytes of music.
 *
 * `fileURLToPath`, not `URL.pathname` — on Windows the latter yields "/C:/..." and breaks reads.
 */
const under = (file: string) => fileURLToPath(new URL(`../../public${file}`, import.meta.url));

describe('the audio manifest', () => {
  const entries = Object.entries(MANIFEST).flatMap(([cue, spec]) =>
    spec.files.map((file) => [cue, file] as const),
  );

  it('names a file that exists for every cue', () => {
    const missing = entries.filter(([, file]) => !existsSync(under(file)));
    expect(missing).toEqual([]);
  });

  it('serves every file from the public root', () => {
    // The paths are URLs the browser fetches, not module specifiers: a relative one would resolve
    // against whatever route the page happens to be on.
    for (const [, file] of entries) expect(file.startsWith('/audio/')).toBe(true);
  });
});
