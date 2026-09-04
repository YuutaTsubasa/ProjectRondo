import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const CSS = fileURLToPath(new URL('../../src/app/fonts.css', import.meta.url));
const TOKENS = fileURLToPath(new URL('../../src/app/tokens.css', import.meta.url));
const DIR = fileURLToPath(new URL('../../public/fonts/', import.meta.url));

const css = readFileSync(CSS, 'utf8');
const referenced = [...css.matchAll(/url\('\/fonts\/([^']+)'\)/g)].map((m) => m[1]);
const families = [...new Set([...css.matchAll(/font-family:\s*'([^']+)'/g)].map((m) => m[1]))];

describe('fonts.css', () => {
  it('declares exactly the expected families', () => {
    expect(families.slice().sort()).toEqual(['Archivo Black', 'Chakra Petch', 'Noto Sans TC']);
  });

  // The list above is a literal, so on its own it cannot catch a --font-* token that names a family
  // nothing declares: the token would resolve, no hex would appear, and the face would fall back to
  // system-ui in silence. This reads the tokens and closes that direction.
  it('every family a --font-* token asks for is declared here', () => {
    const tokens = readFileSync(TOKENS, 'utf8');
    const wanted = [...tokens.matchAll(/--font-[a-z-]+:[ ]*'([^']+)'/g)].map((m) => m[1]);
    expect(wanted.length).toBeGreaterThan(0);
    expect(wanted.filter((f) => !families.includes(f))).toEqual([]);
  });

  it('every referenced file exists on disk', () => {
    const missing = referenced.filter((f) => !existsSync(DIR + f));
    expect(missing).toEqual([]);
  });

  // A font file nothing references is dead weight shipped to every visitor. Chakra Petch and
  // Archivo were exactly that once their components stopped naming them.
  it('ships no font file that fonts.css does not reference', () => {
    const orphans = readdirSync(DIR).filter((f) => f.endsWith('.woff2') && !referenced.includes(f));
    expect(orphans).toEqual([]);
  });

  // Losing unicode-range on the two Noto Sans TC Latin faces is a megabyte-scale regression:
  // ASCII would resolve to the ~1 MB Traditional-Chinese file instead of the 13 KB Latin one.
  it('keeps unicode-range on both Noto Sans TC Latin faces', () => {
    const latinBlocks = [...css.matchAll(/@font-face\s*\{[^}]*noto-sans-tc-latin-[^}]*\}/g)].map((m) => m[0]);
    expect(latinBlocks).toHaveLength(2);
    for (const block of latinBlocks) {
      expect(block).toMatch(/unicode-range\s*:/);
    }
  });
});
