import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

// fileURLToPath, not URL.pathname — on Windows the latter yields "/C:/..." and breaks reads.
const TOKENS = fileURLToPath(new URL('../../src/app/tokens.css', import.meta.url));
const SRC_DIR = fileURLToPath(new URL('../../src/', import.meta.url));

const EXPECTED = [
  '--c-blue', '--c-blue-deep', '--c-blue-soft', '--c-pale', '--c-white', '--c-ink',
  '--c-ink-rgb', '--c-white-rgb', '--c-blue-soft-rgb',
  '--font-headline', '--font-body', '--font-display',
  '--surface-glass', '--surface-blur',
];

// Recursively collect .svelte and .css files under a directory.
const collectFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return collectFiles(full);
    if (entry.name.endsWith('.svelte') || entry.name.endsWith('.css')) return [full];
    return [];
  });

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

  it.each(['ink', 'white', 'blue-soft'])('keeps --c-%s-rgb in sync with --c-%s', (name) => {
    const hex = valueOf(name).replace('#', '');
    const rgb = valueOf(`${name}-rgb`).split(',').map((n) => Number(n.trim()));
    expect(hex).toHaveLength(6);
    expect([0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16))).toEqual(rgb);
  });

  // The two checks above catch a typo'd or missing declaration in tokens.css itself. Neither
  // catches the more common mistake: a component that writes var(--c-blueee) and silently
  // renders nothing, because the browser treats an unresolved custom property as its initial
  // value. Walk every .svelte and .css file under src/ and assert each var(--name) it uses
  // resolves to a token this file actually declares.
  it('every var(--name) used in src/ resolves to a token declared in tokens.css', () => {
    const declaredSet = new Set(declared);
    const files = collectFiles(SRC_DIR);
    const unresolved: string[] = [];

    for (const file of files) {
      // Strip block comments first — tokens.css documents the var(--...) syntax itself in prose,
      // and that placeholder is not a real reference.
      const text = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      // Capture the inside of var(...) so a fallback, var(--x, fallback), doesn't get folded
      // into the name — the name is whatever precedes the first ',' or the closing ')'.
      for (const match of text.matchAll(/var\(([^)]*)\)/g)) {
        const name = match[1].split(',')[0].trim();
        if (!declaredSet.has(name)) {
          const rel = file.slice(SRC_DIR.length).split('\\').join('/');
          unresolved.push(`${rel}: ${name}`);
        }
      }
    }

    expect(unresolved).toEqual([]);
  });
});
