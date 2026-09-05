import { describe, it, expect } from 'vitest';

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
 * The check is `import.meta.glob` rather than `node:fs` only because this repo has no `@types/node`:
 * the glob is resolved by vite against the same directory the dev server and the build serve
 * `public/` from, which is the path the browser will actually request. Lazy — nothing here decodes
 * three megabytes of music; only the keys are read.
 */
const SHIPPED = new Set(Object.keys(import.meta.glob('../../public/audio/**/*')));

const under = (file: string) => `../../public${file}`;

describe('the audio manifest', () => {
  const entries = Object.entries(MANIFEST).flatMap(([cue, spec]) =>
    spec.files.map((file) => [cue, file] as const),
  );

  it('names a file that exists for every cue', () => {
    const missing = entries.filter(([, file]) => !SHIPPED.has(under(file)));
    expect(missing).toEqual([]);
  });

  it('serves every file from the public root', () => {
    // The paths are URLs the browser fetches, not module specifiers: a relative one would resolve
    // against whatever route the page happens to be on.
    for (const [, file] of entries) expect(file.startsWith('/audio/')).toBe(true);
  });
});
