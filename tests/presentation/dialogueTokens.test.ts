import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// fileURLToPath, not URL.pathname — on Windows the latter yields "/C:/..." and breaks reads.
const DIR = fileURLToPath(new URL('../../src/presentation/dialogue/', import.meta.url));

/**
 * Every hex colour literal in one component. Colours belong in src/app/tokens.css; a hex here
 * means a value that nothing names and nothing else can share.
 *
 * Svelte control blocks are not matched, though not for the reason it first looks like: {#each}
 * does open with hex digits, since e, a and c all are. What rejects it is the trailing word
 * boundary. The pattern consumes "#eac", then needs a boundary, and the next character "h" is a
 * word character, so there is none. The {3,8} bound and that boundary hold the guard together;
 * neither is incidental.
 *
 * rgba() is not matched either, and is allowed on purpose: it is how a token's own colour is given an
 * alpha, which is a thing no token can hold for it. Three sites use it — Backlog's entry rule and
 * Choices' scrim each tint --c-blue-soft-rgb, and Portrait's drop-shadow is plain black. Two of the
 * three take their colour from a token and decide only the alpha; the scrim's 0.42 is the one place
 * a number here is a decision rather than a shade of something named, and the comment on that rule
 * says so. Everything else that once needed rgba became a token.
 */
function hexLiteralsIn(file: string): string[] {
  return readFileSync(DIR + file, 'utf8').match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
}

/**
 * The `@media (forced-colors: active)` block of one component, or `null`.
 *
 * Braces are matched rather than pattern-matched: the block holds a rule inside itself, so the
 * `[^}]*` the assertions below use for a flat rule body would stop at the inner `}` and read as
 * though the block declared nothing. Comments go first, so prose ABOUT forced colors -- and this
 * file's subject is a component whose style block argues about that mode at length -- cannot be
 * what satisfies the guard.
 */
function forcedColorsBlockIn(file: string): string | null {
  const src = readFileSync(DIR + file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const at = src.search(/@media\s*\(\s*forced-colors\s*:\s*active\s*\)\s*\{/);
  if (at < 0) return null;
  let depth = 0;
  for (let i = src.indexOf('{', at); i < src.length; i++) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}' && (depth -= 1) === 0) return src.slice(at, i + 1);
  }
  return null;
}

/**
 * The one place in this tree where a token has to be spent on a SECOND selector to reach anyone.
 *
 * Choices marks the selected option with a fill, and forced-colors mode overrides every colour that
 * fill is made of -- `.inner`'s background, the `--c-blue-deep` frame, the white text -- on every
 * row alike; the clip-path corner then cuts one system colour out of the same one. `--focus-ring`
 * is what is left, and in that mode it cannot stay on `:focus-visible`, because the pointer is what
 * moves the selection here: neither a click on an option nor the programmatic `focus()` that
 * `moveSelectionTo` goes through matches `:focus-visible`, so a ring gated on it marks nothing for
 * a mouse user in precisely the mode the ring exists for.
 *
 * A source guard rather than a mounted one: jsdom evaluates no media query and applies no scoped
 * style, so nothing in `tests/presentation/dialogue/` can see this rule at all.
 */
describe('the choices keep a selection mark in forced-colors mode', () => {
  const block = forcedColorsBlockIn('Choices.svelte') ?? '';

  it('rings the focused option with --focus-ring there', () => {
    expect(block).toMatch(/\.choice:focus(?![\w-])[^{]*\{[^}]*\boutline\s*:\s*var\(--focus-ring\)/);
  });

  it('does not gate that ring behind :focus-visible, which a pointer never matches', () => {
    expect(block).not.toMatch(/:focus-visible/);
  });
});

describe('dialogue components use tokens, not hex literals', () => {
  const files = readdirSync(DIR).filter((f) => f.endsWith('.svelte'));

  // A glob that matches nothing passes every assertion below while guarding nothing.
  it('actually scans the components', () => {
    expect(files.length).toBeGreaterThanOrEqual(7);
  });

  it('finds no hex literal in any of them', () => {
    const offenders = files.flatMap((f) => hexLiteralsIn(f).map((hex) => `${f}: ${hex}`));
    expect(offenders).toEqual([]);
  });
});
