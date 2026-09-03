import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// fileURLToPath, not URL.pathname — on Windows the latter yields "/C:/..." and breaks reads.
const TOKENS = fileURLToPath(new URL('../../src/app/tokens.css', import.meta.url));

const EXPECTED = [
  '--c-blue', '--c-lime', '--c-pale', '--c-white', '--c-yellow', '--c-ink',
  '--c-ink-rgb', '--c-white-rgb',
  '--font-headline', '--font-body', '--font-ui',
  '--surface-glass', '--surface-blur', '--surface-border',
];

describe('tokens.css', () => {
  const src = readFileSync(TOKENS, 'utf8');
  // Only declarations, i.e. "--name:" at the start of a line. A var(--name) reference has a
  // '(' in front of it and must not count as a definition.
  const declared = (src.match(/^\s*(--[a-z0-9-]+)\s*:/gm) ?? []).map((m) => m.trim().replace(/\s*:$/, ''));

  it('declares every expected token', () => {
    expect(declared.slice().sort()).toEqual(EXPECTED.slice().sort());
  });

  it('declares each token exactly once', () => {
    const seen = new Set<string>();
    const dupes = declared.filter((n) => (seen.has(n) ? true : (seen.add(n), false)));
    expect(dupes).toEqual([]);
  });

  // A -rgb companion that drifts from its hex is worse than no companion: every rgba() built
  // from it is quietly the wrong colour, and nothing else in the codebase would notice.
  const valueOf = (token: string) =>
    (src.split('\n').find((l) => l.trim().startsWith(`--c-${token}:`)) ?? '')
      .split(':')[1]?.trim().replace(';', '') ?? '';

  it.each(['ink', 'white'])('keeps --c-%s-rgb in sync with --c-%s', (name) => {
    const hex = valueOf(name).replace('#', '');
    const rgb = valueOf(`${name}-rgb`).split(',').map((n) => Number(n.trim()));
    expect(hex).toHaveLength(6);
    expect([0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16))).toEqual(rgb);
  });
});
