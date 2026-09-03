import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// fileURLToPath, not URL.pathname — on Windows the latter yields "/C:/..." and breaks reads.
const DIR = fileURLToPath(new URL('../../src/presentation/dialogue/', import.meta.url));

/**
 * Every hex colour literal in one component. Colours belong in src/app/tokens.css; a hex here
 * means a value that nothing names and nothing else can share.
 *
 * Svelte control blocks are not matched: {#if} and {#each} have a letter after the '#', and the
 * pattern requires a hex digit. rgba() values are not matched either and are allowed on purpose —
 * box-shadows and the two modal scrims stay rgba (see the design doc, 4e).
 */
export function hexLiteralsIn(file: string): string[] {
  return readFileSync(DIR + file, 'utf8').match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
}

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
