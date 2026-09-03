# UI Token System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give ProjectRondo's UI one named source of truth for colour, type, and surface treatment, and re-skin the AVG dialogue components onto it.

**Architecture:** A single `src/app/tokens.css` defines CSS custom properties on `:root`, imported once from `src/app/main.ts`. The eight components under `src/presentation/dialogue/` consume them as `var(--...)` inside their existing scoped `<style>` blocks. A vitest guard reads the component sources off disk and fails if a hex literal reappears.

**Tech Stack:** Svelte 5, TypeScript, Vite 8, vitest 4 (`environment: 'node'`), self-hosted woff2 fonts from Fontsource (OFL).

**Spec:** `docs/superpowers/specs/2026-09-04-ui-token-system-design.md`

## Global Constraints

- **The Write tool silently fails in this environment** — it reports success and no file appears. Create and edit every file through Bash (`cat > f <<'EOF'`, `sed -i`). Verify each write with `ls`/`wc -l` before moving on.
- Package manager is **pnpm** (`pnpm-lock.yaml`). Node and pnpm are off PATH on this Windows ARM64 box; see `docs/HANDOFF.md`.
- Layout is out of scope. No component changes position, size, spacing, or animation.
- No behavioural change. No component gains a new state, branch, prop, or input.
- Touch only `src/app/`, `src/presentation/dialogue/`, `public/fonts/`, and `tests/`.
- Fonts are self-hosted from the app origin. **No CDN links** — the app is CSP-constrained.
- `--font-headline` and `--font-ui` must carry `'Noto Sans TC'` in their fallback stacks: Poppins and JetBrains Mono have no CJK coverage, and speaker names are Chinese.
- Box-shadows stay `rgba(0, 0, 0, ...)` and are not tokenised (the spec's 4c names exactly three surface tokens). Their alpha is lowered where a panel flips light, because a shadow tuned for a dark panel reads as dirt under a pale one.
- Run `pnpm test` after every task. 131 tests pass on the branch point. The count grows with every
  task except Task 8, which deliberately collapses six named cases into two and so drops it from
  144 to 140. Every task states its expected count.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/app/tokens.css` | create | The only place a colour, font stack, or glass value is written down |
| `src/app/main.ts` | modify | Imports `tokens.css` before `fonts.css` |
| `src/app/fonts.css` | modify | `@font-face` for Poppins, JetBrains Mono, Noto Sans TC |
| `public/fonts/poppins-700.woff2` | create | Headline face — the only weight the components use |
| `public/fonts/jetbrains-mono-400.woff2` | create | UI labels (Choices `.head`, DialogueOverlay `.hint`) |
| `public/fonts/jetbrains-mono-800.woff2` | create | UI labels (Controls buttons declare `font-weight: 800`) |
| `public/fonts/chakra-petch-700.woff2` | delete | Replaced by Poppins |
| `public/fonts/archivo-800.woff2` | delete | Replaced by JetBrains Mono |
| `src/presentation/dialogue/Nameplate.svelte` | modify | Tokens only |
| `src/presentation/dialogue/Controls.svelte` | modify | Tokens only |
| `src/presentation/dialogue/DialogueOverlay.svelte` | modify | Tokens; box flips light |
| `src/presentation/dialogue/Line.svelte` | modify | Tokens; text flips dark |
| `src/presentation/dialogue/Choices.svelte` | modify | Tokens; panel flips light |
| `src/presentation/dialogue/Backlog.svelte` | modify | Tokens; panel flips light |
| `tests/app/tokens.test.ts` | create | Every expected token is defined exactly once |
| `tests/app/fonts.test.ts` | create | Every `@font-face` url resolves; no orphan font files |
| `tests/presentation/dialogueTokens.test.ts` | create | No hex literal in the dialogue components |

`Portrait.svelte` and `App.svelte` are untouched: neither declares a colour.

---

### Task 1: Token file and its presence test

**Files:**
- Create: `src/app/tokens.css`
- Create: `tests/app/tokens.test.ts`
- Modify: `src/app/main.ts:1`

**Interfaces:**
- Consumes: nothing.
- Produces: the token names every later task uses — `--c-blue`, `--c-lime`, `--c-pale`, `--c-white`, `--c-yellow`, `--c-ink`, `--c-ink-rgb`, `--c-white-rgb`, `--font-headline`, `--font-body`, `--font-ui`, `--surface-glass`, `--surface-blur`, `--surface-border`. Also exports nothing from TS; the test module is self-contained.

- [ ] **Step 1: Write the failing test**

Create `tests/app/tokens.test.ts`:

```ts
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
```

- [ ] **Step 2: Run it and watch it fail**

```bash
pnpm vitest run tests/app/tokens.test.ts
```

Expected: FAIL — `ENOENT: no such file or directory, open '.../src/app/tokens.css'`.

- [ ] **Step 3: Create the token file**

```bash
cat > src/app/tokens.css <<'CSSEOF'
/*
 * Design tokens — the single source of truth for colour, type, and surface treatment.
 * Imported once from main.ts; consumed as var(--...) inside components' scoped <style> blocks.
 * tests/presentation/dialogueTokens.test.ts fails if a hex literal reappears in
 * src/presentation/dialogue/. Palette and type follow the "BLUE HORIZON" style sheet; see
 * docs/superpowers/specs/2026-09-04-ui-token-system-design.md.
 */
:root {
  --c-blue: #145BFF;
  --c-lime: #B6FF00;
  --c-pale: #E8F1FF;
  --c-white: #FFFFFF;
  --c-ink: #0b1020;

  /* Defined for palette completeness; nothing consumes it. The style sheet colours an unknown
     speaker yellow, but the dialogue domain has no unknown-speaker state — Speaker is a branded
     string (src/domain/dialogue/speaker.ts) and an empty speaker is a parse error — so that
     distinction is not implementable as a re-skin. The first component to use this token is what
     decides what it means. */
  --c-yellow: #FFF200;

  /* --c-ink and --c-white as bare channels, so a component can write rgba(var(--c-ink-rgb), .6)
     for secondary text, or rgba(var(--c-white-rgb), .85) for a hover, without restating the
     colour. tests/app/tokens.test.ts asserts each pair stays in sync with its hex. */
  --c-ink-rgb: 11, 16, 32;
  --c-white-rgb: 255, 255, 255;

  /* Poppins and JetBrains Mono have no CJK coverage and speaker names are Chinese, so Noto Sans TC
     sits in both fallback stacks rather than letting CJK drop to system-ui. */
  --font-headline: 'Poppins', 'Noto Sans TC', system-ui, sans-serif;
  --font-body: 'Noto Sans TC', system-ui, sans-serif;
  --font-ui: 'JetBrains Mono', 'Noto Sans TC', ui-monospace, monospace;

  /* One set of glass values for every panel. Before this file there were five unrelated sets
     (blur 12/18/26/28/30px, saturate 120/140/160%, alpha .55/.60/.62/.72) — see the design doc 1a.
     The alpha starts at .72, the one value that already shipped on a light surface (Controls).
     It is the knob the contrast measurement turns; see the design doc 5b.
     The modal scrims in Choices and Backlog are deliberately NOT tokenised: a scrim's job is to
     push the 3D scene back behind a modal, so it stays dark even though the panels above it
     are light. */
  --surface-glass: rgba(var(--c-white-rgb), 0.72);
  --surface-blur: blur(24px) saturate(140%);
  --surface-border: rgba(20, 91, 255, 0.22);
}
CSSEOF
wc -l src/app/tokens.css
```

- [ ] **Step 4: Import it from the entry point**

`src/app/main.ts` is four lines and starts with `import './fonts.css';`. Tokens go first — they are the vocabulary everything else is written in.

```bash
sed -i "1i import './tokens.css';" src/app/main.ts
head -3 src/app/main.ts
```

Expected first three lines:

```ts
import './tokens.css';
import './fonts.css';
import App from './App.svelte';
```

- [ ] **Step 5: Run the test and watch it pass**

```bash
pnpm vitest run tests/app/tokens.test.ts
```

Expected: 3 passed.

- [ ] **Step 6: Run the whole suite**

```bash
pnpm test
```

Expected: 135 passed (131 existing + 4 new — `it.each` over two colours yields two cases).

- [ ] **Step 7: Commit**

```bash
git add src/app/tokens.css src/app/main.ts tests/app/tokens.test.ts
git commit -m "feat(ui): add the design-token file

Fourteen tokens on :root — six palette colours, --c-ink and --c-white also as bare channels for
rgba() use, three font stacks, three glass values. Nothing consumes them yet.

The glass values collapse five unrelated sets that had accumulated across the
dialogue components; --surface-glass's alpha is the knob the contrast
measurement turns later."
```

---

### Task 2: Swap the display fonts

Chakra Petch and Archivo go; Poppins and JetBrains Mono arrive.

**The spec's 4b says "Poppins 700/800" and "JetBrains Mono 400/700". That was a guess and it is wrong.** The components declare only three display weights: `font-weight: 700` at both Chakra Petch sites (`Nameplate.svelte:26`, `Backlog.svelte:55`), `font-weight: 800` at the one Archivo site that sets it (`Controls.svelte:31`), and no weight — so 400 — at the other two (`Choices.svelte:45`, `DialogueOverlay.svelte:132`). Ship exactly those three faces. Step 7 corrects the spec.

**Files:**
- Create: `public/fonts/poppins-700.woff2`, `public/fonts/jetbrains-mono-400.woff2`, `public/fonts/jetbrains-mono-800.woff2`
- Delete: `public/fonts/chakra-petch-700.woff2`, `public/fonts/archivo-800.woff2`
- Modify: `src/app/fonts.css` (replace the Chakra Petch and Archivo blocks; leave all four Noto Sans TC blocks untouched)
- Create: `tests/app/fonts.test.ts`
- Modify: `docs/superpowers/specs/2026-09-04-ui-token-system-design.md` (4b and 5d)

**Interfaces:**
- Consumes: `--font-headline` / `--font-ui` from Task 1 name the families `'Poppins'` and `'JetBrains Mono'`; the `@font-face` `font-family` strings here must match those exactly or the stack silently falls through to `system-ui`.
- Produces: nothing importable. Later tasks rely on the two families resolving.

- [ ] **Step 1: Write the failing test**

```bash
cat > tests/app/fonts.test.ts <<'TSEOF'
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const CSS = fileURLToPath(new URL('../../src/app/fonts.css', import.meta.url));
const DIR = fileURLToPath(new URL('../../public/fonts/', import.meta.url));

const css = readFileSync(CSS, 'utf8');
const referenced = [...css.matchAll(/url\('\/fonts\/([^']+)'\)/g)].map((m) => m[1]);
const families = [...new Set([...css.matchAll(/font-family:\s*'([^']+)'/g)].map((m) => m[1]))];

describe('fonts.css', () => {
  it('declares exactly the three families the tokens name', () => {
    expect(families.slice().sort()).toEqual(['JetBrains Mono', 'Noto Sans TC', 'Poppins']);
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
});
TSEOF
wc -l tests/app/fonts.test.ts
```

- [ ] **Step 2: Run it and watch it fail**

```bash
pnpm vitest run tests/app/fonts.test.ts
```

Expected: the first case FAILS — the families are `['Archivo', 'Chakra Petch', 'Noto Sans TC']`. The other two pass (nothing is missing or orphaned yet).

- [ ] **Step 3: Fetch the three woff2 files**

Fontsource ships one static file per weight and subset. Install the two packages, copy the Latin faces out under this project's naming convention, then uninstall — the existing fonts got here the same way and Fontsource is not a dependency of this repo.

```bash
pnpm add -D @fontsource/poppins @fontsource/jetbrains-mono
ls node_modules/@fontsource/poppins/files/ | grep 'latin-700-normal'
ls node_modules/@fontsource/jetbrains-mono/files/ | grep -E 'latin-(400|800)-normal'
```

Expected names: `poppins-latin-700-normal.woff2`, `jetbrains-mono-latin-400-normal.woff2`, `jetbrains-mono-latin-800-normal.woff2`. If a name differs, use what `ls` printed — do not guess.

```bash
cp node_modules/@fontsource/poppins/files/poppins-latin-700-normal.woff2 public/fonts/poppins-700.woff2
cp node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2 public/fonts/jetbrains-mono-400.woff2
cp node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-800-normal.woff2 public/fonts/jetbrains-mono-800.woff2
pnpm remove @fontsource/poppins @fontsource/jetbrains-mono
ls -la public/fonts/
```

Confirm `package.json` has no `@fontsource` entry afterwards:

```bash
grep -c fontsource package.json || echo "clean"
```

- [ ] **Step 4: Replace the two `@font-face` blocks**

`src/app/fonts.css` opens with a comment and the Chakra Petch and Archivo blocks — **lines 1 to 19**.
Line 20 is blank and line 21 begins the Noto Sans TC comment, so the deletion stops at 19: taking
21 would orphan that comment and its stray `*/` would swallow the first Noto `@font-face`.
Everything from line 20 onwards is correct and stays. Replace the head of the file:

```bash
sed -i '1,19d' src/app/fonts.css
cat > /tmp/fonts-head.css <<'CSSEOF'
/*
 * Self-hosted design fonts (CSP-safe: served from the app origin, no external CDN).
 * Poppins = headline (nameplate, panel titles), JetBrains Mono = uppercase UI labels,
 * Noto Sans TC = CJK body text. Files live in /public/fonts (from Fontsource, OFL).
 * Only the weights the components actually declare are shipped: Poppins 700, JetBrains Mono
 * 400 and 800. tests/app/fonts.test.ts fails on a file nothing references.
 */
@font-face {
  font-family: 'Poppins';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url('/fonts/poppins-700.woff2') format('woff2');
}
@font-face {
  font-family: 'JetBrains Mono';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('/fonts/jetbrains-mono-400.woff2') format('woff2');
}
@font-face {
  font-family: 'JetBrains Mono';
  font-style: normal;
  font-weight: 800;
  font-display: swap;
  src: url('/fonts/jetbrains-mono-800.woff2') format('woff2');
}
CSSEOF
cat /tmp/fonts-head.css src/app/fonts.css > /tmp/fonts-new.css && mv /tmp/fonts-new.css src/app/fonts.css
head -30 src/app/fonts.css
```

Verify the Noto Sans TC blocks survived intact:

```bash
grep -c 'noto-sans-tc' src/app/fonts.css
```

Expected: `4`.

- [ ] **Step 5: Delete the two dead font files**

```bash
rm public/fonts/chakra-petch-700.woff2 public/fonts/archivo-800.woff2
ls public/fonts/
```

Expected: seven files — three new display faces plus the four Noto Sans TC files.

- [ ] **Step 6: Run the test and the suite**

```bash
pnpm vitest run tests/app/fonts.test.ts
pnpm test
```

Expected: 3 passed for the font file; 138 passed overall (131 + 4 from Task 1 + 3 here).

- [ ] **Step 7: Correct the spec**

The spec's 4b and 5d were written before the weights were checked. Fix both:

```bash
S=docs/superpowers/specs/2026-09-04-ui-token-system-design.md
sed -i "s|^--font-headline   Poppins 700/800          new, OFL, self-hosted$|--font-headline   Poppins 700              new, OFL, self-hosted|" $S
sed -i "s|^--font-ui         JetBrains Mono 400/700   new, OFL, self-hosted$|--font-ui         JetBrains Mono 400/800   new, OFL, self-hosted|" $S
sed -i "s|Chakra Petch and Archivo removed (-24 KB); Poppins 700/800 and JetBrains Mono 400/700 added.|Chakra Petch and Archivo removed (-24 KB); Poppins 700 and JetBrains Mono 400/800 added.\nThe weights are the ones the components declare, not the 700/800 + 400/700 the first draft\nguessed at.|" $S
grep -n 'Poppins 700\|JetBrains Mono 400' $S
```

Then record the real byte figures in the spec's section 6:

```bash
du -b public/fonts/poppins-700.woff2 public/fonts/jetbrains-mono-400.woff2 public/fonts/jetbrains-mono-800.woff2
```

Append to the spec under `## 6. Measurements` a line giving the three sizes and the net change against the 24,316 bytes removed.

- [ ] **Step 8: Commit**

```bash
git add public/fonts src/app/fonts.css tests/app/fonts.test.ts docs/superpowers/specs/2026-09-04-ui-token-system-design.md
git commit -m "feat(ui): swap Chakra Petch and Archivo for Poppins and JetBrains Mono

Ships only the weights the components declare -- Poppins 700, JetBrains Mono
400 and 800 -- not the 700/800 + 400/700 the spec first guessed at; the spec is
corrected to match.

The new test fails on a font file nothing references, which is what Chakra Petch
and Archivo would have become."
```

---

## The component recipe

Every remaining task rewrites one component's `<style>` block and nothing else. In all six files
the style block is the last thing in the file, so the edit is always:

```bash
F=src/presentation/dialogue/<Name>.svelte
sed -i '/<style>/,/<\/style>/d' $F
cat >> $F <<'CSSEOF'
<style>
  ...
</style>
CSSEOF
```

Confirm the markup above it is untouched with `git diff --stat` — only the style block's lines
should move. **Never** edit the template or the `<script>` block: no task in this plan changes
behaviour.

---

### Task 3: Hex guard, and Nameplate as its first subject

`Nameplate` is the smallest component and already light, so it converts with no polarity change.
It is the right place to stand the guard up.

**Files:**
- Create: `tests/presentation/dialogueTokens.test.ts`
- Modify: `src/presentation/dialogue/Nameplate.svelte` (style block only)

**Interfaces:**
- Consumes: `--c-blue`, `--c-lime`, `--c-pale`, `--c-ink`, `--font-headline` from Task 1.
- Produces: `hexLiteralsIn(file: string): string[]` exported from `tests/presentation/dialogueTokens.test.ts`. Tasks 4 to 7 each add one `it(...)` calling it; Task 8 replaces them with a directory sweep.

- [ ] **Step 1: Write the failing test**

```bash
cat > tests/presentation/dialogueTokens.test.ts <<'TSEOF'
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
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
  it('Nameplate.svelte', () => {
    expect(hexLiteralsIn('Nameplate.svelte')).toEqual([]);
  });
});
TSEOF
wc -l tests/presentation/dialogueTokens.test.ts
```

- [ ] **Step 2: Run it and watch it fail**

```bash
pnpm vitest run tests/presentation/dialogueTokens.test.ts
```

Expected: FAIL, with the received array showing the four literals in `Nameplate.svelte` —
`['#d8ff00', '#eef0f2', '#0000ff', '#0b0b0d', '#0000ff']` — five, not four: `#0000ff` is used
twice, on `.rail` and on `.tick`.

- [ ] **Step 3: Convert the component**

```bash
F=src/presentation/dialogue/Nameplate.svelte
sed -i '/<style>/,/<\/style>/d' $F
cat >> $F <<'CSSEOF'
<style>
  /* 1a 切角銘牌: blue rail + lime cut corner + pale board (design: linear-gradient 315deg). */
  .nameplate {
    display: inline-flex;
    align-items: stretch;
    background: linear-gradient(315deg, var(--c-lime) 0 12px, transparent 12px 16px, var(--c-pale) 16px);
    box-shadow: 0 14px 30px rgba(0, 0, 0, 0.35);
    pointer-events: auto;
  }
  .rail { width: 10px; background: var(--c-blue); display: block; }
  .body {
    padding: 10px 32px 10px 16px;
    display: flex;
    align-items: center;
    gap: 12px;
    font-family: var(--font-headline);
    font-weight: 700;
    font-size: 17px;
    letter-spacing: 0.04em;
    color: var(--c-ink);
  }
  .tick { width: 3px; height: 12px; background: var(--c-blue); display: block; }
</style>
CSSEOF
git diff --stat src/presentation/dialogue/Nameplate.svelte
```

- [ ] **Step 4: Run the test and the suite**

```bash
pnpm vitest run tests/presentation/dialogueTokens.test.ts
pnpm test
```

Expected: 1 passed for the guard; 139 passed overall.

- [ ] **Step 5: Commit**

```bash
git add tests/presentation/dialogueTokens.test.ts src/presentation/dialogue/Nameplate.svelte
git commit -m "feat(ui): put Nameplate on tokens, and add the hex guard

The guard reads the component sources off disk and fails on any hex literal.
It covers Nameplate today; each following task adds its own file, and the last
generalises it to a sweep of the directory."
```

---

### Task 4: Controls

Also already light. Its `rgba(255, 255, 255, 0.72)` is where `--surface-glass`'s starting alpha
came from, so this component should look unchanged apart from the type and the lit tick.

**Files:**
- Modify: `tests/presentation/dialogueTokens.test.ts` (add one case)
- Modify: `src/presentation/dialogue/Controls.svelte` (style block only)

**Interfaces:**
- Consumes: `hexLiteralsIn` from Task 3; `--surface-glass`, `--surface-blur`, `--surface-border`, `--c-ink`, `--c-ink-rgb`, `--c-white-rgb`, `--c-lime`, `--font-ui` from Task 1.

- [ ] **Step 1: Add the failing case**

Insert before the closing `});` of the describe block in `tests/presentation/dialogueTokens.test.ts`:

```ts
  it('Controls.svelte', () => {
    expect(hexLiteralsIn('Controls.svelte')).toEqual([]);
  });
```

- [ ] **Step 2: Run it and watch it fail**

```bash
pnpm vitest run tests/presentation/dialogueTokens.test.ts
```

Expected: FAIL — received `['#0b0b0d', '#d8ff00']`.

- [ ] **Step 3: Convert the component**

```bash
F=src/presentation/dialogue/Controls.svelte
sed -i '/<style>/,/<\/style>/d' $F
cat >> $F <<'CSSEOF'
<style>
  .controls {
    position: absolute;
    top: 28px;
    right: 28px;
    display: flex;
    gap: 6px;
    pointer-events: auto;
  }
  .controls button {
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--surface-glass);
    backdrop-filter: var(--surface-blur);
    -webkit-backdrop-filter: var(--surface-blur);
    border: 1px solid var(--surface-border);
    padding: 8px 14px;
    font-family: var(--font-ui);
    font-weight: 800;
    font-size: 11px;
    letter-spacing: 0.16em;
    color: var(--c-ink);
    cursor: pointer;
  }
  .controls .mark { width: 14px; height: 3px; background: rgba(var(--c-ink-rgb), 0.2); display: block; }
  .controls button.active .mark { background: var(--c-lime); }
  .controls button:hover { background: rgba(var(--c-white-rgb), 0.85); }
</style>
CSSEOF
git diff --stat src/presentation/dialogue/Controls.svelte
```

- [ ] **Step 4: Run the test and the suite**

```bash
pnpm vitest run tests/presentation/dialogueTokens.test.ts
pnpm test
```

Expected: 2 passed for the guard; 140 passed overall.

- [ ] **Step 5: Commit**

```bash
git add tests/presentation/dialogueTokens.test.ts src/presentation/dialogue/Controls.svelte
git commit -m "feat(ui): put Controls on tokens

Its glass values are the ones --surface-glass was seeded from, so the surface
is unchanged; the type moves to JetBrains Mono and the lit tick to --c-lime."
```

---

### Task 5: DialogueOverlay and Line — the first polarity flip

These two convert together because `Line` renders inside `DialogueOverlay`'s `.box`. Flipping one
without the other leaves either near-white text on a near-white panel or dark text on a dark one,
so neither is independently reviewable.

Three changes here are not simple substitutions:

- `.box`'s shadow drops from `rgba(0, 0, 0, 0.45)` to `0.25`. A shadow tuned under a dark panel
  reads as grime under a pale one.
- `.hint` was `#d8ff00` — lime text, about 1.2:1 on white. It becomes `--c-blue` (design doc 4d).
- `.hit:focus-visible` was `1px solid rgba(216, 255, 0, 0.6)` — lime again, and the same problem.
  It becomes `--c-blue`. The spec's 4d names only `.hint` and `Backlog`'s `.who`, because those are
  the two *hex* sites; this one is an rgba and the guard would not have caught it. It is the same
  defect and it is a focus indicator, so it is fixed here rather than left as an invisible outline.

**Files:**
- Modify: `tests/presentation/dialogueTokens.test.ts` (add two cases)
- Modify: `src/presentation/dialogue/DialogueOverlay.svelte`, `src/presentation/dialogue/Line.svelte` (style blocks only)

**Interfaces:**
- Consumes: `hexLiteralsIn` from Task 3; `--surface-glass`, `--surface-blur`, `--surface-border`, `--c-ink`, `--c-ink-rgb`, `--c-lime`, `--c-blue`, `--font-body`, `--font-ui` from Task 1.

- [ ] **Step 1: Add the failing cases**

```ts
  it('DialogueOverlay.svelte', () => {
    expect(hexLiteralsIn('DialogueOverlay.svelte')).toEqual([]);
  });

  it('Line.svelte', () => {
    expect(hexLiteralsIn('Line.svelte')).toEqual([]);
  });
```

- [ ] **Step 2: Run them and watch them fail**

```bash
pnpm vitest run tests/presentation/dialogueTokens.test.ts
```

Expected: two FAILs — `['#d8ff00', '#d8ff00']` for the overlay and `['#f2f3f5']` for the line.

- [ ] **Step 3: Convert Line**

```bash
F=src/presentation/dialogue/Line.svelte
sed -i '/<style>/,/<\/style>/d' $F
cat >> $F <<'CSSEOF'
<style>
  .line {
    margin: 0;
    font-size: 20px;
    line-height: 2;
    color: var(--c-ink);
    text-wrap: pretty;
  }
</style>
CSSEOF
```

- [ ] **Step 4: Convert DialogueOverlay**

```bash
F=src/presentation/dialogue/DialogueOverlay.svelte
sed -i '/<style>/,/<\/style>/d' $F
cat >> $F <<'CSSEOF'
<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 10;
    pointer-events: none; /* let clicks fall through to the 3D canvas except on the panels below */
    font-family: var(--font-body);
  }
  /* Bottom-anchored dialogue dock, matching the design's inset panels. */
  .dock {
    position: absolute;
    left: 28px;
    right: 28px;
    bottom: 28px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
    pointer-events: none;
  }
  .box {
    align-self: stretch;
    /* Fixed, taller VN textbox: consistent height regardless of line length. */
    height: clamp(180px, 24vh, 240px);
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    background: var(--surface-glass);
    backdrop-filter: var(--surface-blur);
    -webkit-backdrop-filter: var(--surface-blur);
    border: 1px solid var(--surface-border);
    /* Lighter than the 0.45 this carried as a dark panel — that alpha reads as grime under pale. */
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.25);
    padding: 22px 26px;
    pointer-events: auto;
  }
  .hit { flex: 1; cursor: pointer; outline: none; }
  /* Was lime at 0.6 alpha: about 1.2:1 on a light panel, i.e. an invisible focus ring. */
  .hit:focus-visible { outline: 1px solid var(--c-blue); outline-offset: 4px; }
  .footer { display: flex; align-items: center; gap: 12px; margin-top: auto; min-height: 3px; }
  .mark { width: 20px; height: 3px; background: rgba(var(--c-ink-rgb), 0.22); display: block; }
  .mark.on { background: var(--c-lime); }
  .hint {
    margin-left: auto;
    font-family: var(--font-ui);
    font-size: 12px;
    letter-spacing: 0.16em;
    color: var(--c-blue);
  }
</style>
CSSEOF
git diff --stat src/presentation/dialogue/
```

- [ ] **Step 5: Run the tests and the suite**

```bash
pnpm vitest run tests/presentation/dialogueTokens.test.ts
pnpm test
```

Expected: 4 passed for the guard; 142 passed overall.

- [ ] **Step 6: Commit**

```bash
git add tests/presentation/dialogueTokens.test.ts src/presentation/dialogue/DialogueOverlay.svelte src/presentation/dialogue/Line.svelte
git commit -m "feat(ui): flip the dialogue box light and put it on tokens

Line converts in the same commit because it renders inside the box -- flipping
one alone leaves the text illegible against its own panel.

Two lime accents move to blue: the AUTO hint, and the focus ring on the advance
target, which was lime at 0.6 alpha and would have been invisible on a pale
panel. The box shadow drops from 0.45 to 0.25 alpha for the same reason."
```

---

### Task 6: Choices

The `.scrim` keeps `rgba(6, 7, 10, 0.55)` and its own `blur(12px) saturate(120%)`. It is not a
panel and must not take the surface tokens: a scrim pushes the 3D scene back behind the modal, so
it stays dark even though the choices above it are now light (design doc 4e). The hover state
inverts — it brightened *toward* dark before (`rgba(24, 24, 28, 0.7)`) and now brightens toward
white, matching Controls.

**Files:**
- Modify: `tests/presentation/dialogueTokens.test.ts` (add one case)
- Modify: `src/presentation/dialogue/Choices.svelte` (style block only)

**Interfaces:**
- Consumes: `hexLiteralsIn` from Task 3; `--surface-glass`, `--surface-blur`, `--surface-border`, `--c-ink`, `--c-ink-rgb`, `--c-white-rgb`, `--c-blue`, `--c-lime`, `--font-ui` from Task 1.

- [ ] **Step 1: Add the failing case**

```ts
  it('Choices.svelte', () => {
    expect(hexLiteralsIn('Choices.svelte')).toEqual([]);
  });
```

- [ ] **Step 2: Run it and watch it fail**

```bash
pnpm vitest run tests/presentation/dialogueTokens.test.ts
```

Expected: FAIL — received `['#d8ff00', '#f2f3f5', '#0000ff', '#d8ff00']`.

- [ ] **Step 3: Convert the component**

```bash
F=src/presentation/dialogue/Choices.svelte
sed -i '/<style>/,/<\/style>/d' $F
cat >> $F <<'CSSEOF'
<style>
  /* The scrim is deliberately NOT on the surface tokens: it dims the 3D scene behind the modal,
     so it stays dark even though the choices above it are light. */
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 12;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(6, 7, 10, 0.55);
    backdrop-filter: blur(12px) saturate(120%);
    -webkit-backdrop-filter: blur(12px) saturate(120%);
    pointer-events: auto;
  }
  .panel {
    width: min(560px, 84vw);
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 4px;
    font-family: var(--font-ui);
    font-size: 11px;
    letter-spacing: 0.22em;
    color: rgba(var(--c-ink-rgb), 0.6);
  }
  .head .mark { width: 14px; height: 3px; background: var(--c-lime); display: block; }
  .choice {
    display: flex;
    align-items: stretch;
    width: 100%;
    text-align: left;
    padding: 0;
    background: var(--surface-glass);
    backdrop-filter: var(--surface-blur);
    -webkit-backdrop-filter: var(--surface-blur);
    border: 1px solid var(--surface-border);
    color: var(--c-ink);
    cursor: pointer;
    transition: background 0.12s ease;
  }
  .choice .rail { width: 8px; background: var(--c-blue); display: block; flex: none; transition: background 0.12s ease; }
  .choice .label { padding: 16px 20px; font-size: 16px; }
  /* Hover brightens toward white now; as a dark panel it brightened toward dark. */
  .choice:hover, .choice:focus-visible { background: rgba(var(--c-white-rgb), 0.85); outline: none; }
  .choice:hover .rail, .choice:focus-visible .rail { background: var(--c-lime); }
</style>
CSSEOF
git diff --stat src/presentation/dialogue/Choices.svelte
```

- [ ] **Step 4: Run the test and the suite**

```bash
pnpm vitest run tests/presentation/dialogueTokens.test.ts
pnpm test
```

Expected: 5 passed for the guard; 143 passed overall.

- [ ] **Step 5: Commit**

```bash
git add tests/presentation/dialogueTokens.test.ts src/presentation/dialogue/Choices.svelte
git commit -m "feat(ui): flip the choice panel light and put it on tokens

The scrim keeps its own dark rgba and blur on purpose -- it dims the scene
behind the modal, which a light scrim over a bright outdoor hub would not do."
```

---

### Task 7: Backlog

The last component, and the one carrying the speaker-colour change. `.who` was `#d8ff00` — lime
text, which on a pale panel is roughly 1.2:1 and effectively gone. It becomes `--c-blue` for every
speaker. The style sheet distinguishes a yellow unknown speaker; that is not implementable here and
the spec's 4f records why, so `--c-yellow` stays unused.

**Files:**
- Modify: `tests/presentation/dialogueTokens.test.ts` (add one case)
- Modify: `src/presentation/dialogue/Backlog.svelte` (style block only)

**Interfaces:**
- Consumes: `hexLiteralsIn` from Task 3; `--surface-glass`, `--surface-blur`, `--surface-border`, `--c-ink`, `--c-ink-rgb`, `--c-blue`, `--c-lime`, `--c-pale`, `--font-headline` from Task 1.

- [ ] **Step 1: Add the failing case**

```ts
  it('Backlog.svelte', () => {
    expect(hexLiteralsIn('Backlog.svelte')).toEqual([]);
  });
```

- [ ] **Step 2: Run it and watch it fail**

```bash
pnpm vitest run tests/presentation/dialogueTokens.test.ts
```

Expected: FAIL — received `['#d8ff00', '#eef0f2', '#0000ff', '#0b0b0d', '#0b0b0d', '#d8ff00', '#d8ff00']`.

- [ ] **Step 3: Convert the component**

```bash
F=src/presentation/dialogue/Backlog.svelte
sed -i '/<style>/,/<\/style>/d' $F
cat >> $F <<'CSSEOF'
<style>
  /* Like Choices' scrim, deliberately off the surface tokens — it dims the scene behind the modal. */
  .scrim {
    position: absolute;
    inset: 0;
    z-index: 11;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(6, 7, 10, 0.45);
    pointer-events: auto;
  }
  .log {
    width: min(940px, 88vw);
    max-height: calc(100% - 140px);
    display: flex;
    flex-direction: column;
    background: var(--surface-glass);
    backdrop-filter: var(--surface-blur);
    -webkit-backdrop-filter: var(--surface-blur);
    border: 1px solid var(--surface-border);
    /* Lowered from 0.5 with the flip to a pale panel. */
    box-shadow: 0 30px 70px rgba(0, 0, 0, 0.28);
    padding: 0 24px 20px;
  }
  header {
    display: flex;
    align-items: center;
    gap: 14px;
    margin: 0 -24px 14px;
    padding: 10px 24px;
    background: linear-gradient(315deg, var(--c-lime) 0 10px, transparent 10px 14px, var(--c-pale) 14px);
  }
  header .rail { width: 9px; align-self: stretch; margin: -10px 0 -10px -24px; background: var(--c-blue); display: block; flex: none; }
  .title {
    font-family: var(--font-headline);
    font-weight: 700;
    color: var(--c-ink);
    letter-spacing: 0.04em;
  }
  .close { margin-left: auto; background: none; border: none; color: var(--c-ink); font-size: 20px; line-height: 1; cursor: pointer; }
  ol { list-style: none; margin: 0; padding: 0; overflow: auto; display: flex; flex-direction: column; gap: 12px; }
  li { display: flex; align-items: baseline; gap: 10px; font-size: 14px; line-height: 1.8; }
  .mark { width: 18px; height: 3px; background: var(--c-lime); display: block; flex: none; transform: translateY(-4px); }
  /* Was lime, which is ~1.2:1 on a pale panel. Blue for every speaker: the style sheet's yellow
     "unknown speaker" has no state behind it in this codebase (see the design doc, 4f). */
  .who { color: var(--c-blue); font-weight: 700; flex: none; }
  .text { color: rgba(var(--c-ink-rgb), 0.85); }
</style>
CSSEOF
git diff --stat src/presentation/dialogue/Backlog.svelte
```

- [ ] **Step 4: Run the test and the suite**

```bash
pnpm vitest run tests/presentation/dialogueTokens.test.ts
pnpm test
```

Expected: 6 passed for the guard; 144 passed overall.

- [ ] **Step 5: Commit**

```bash
git add tests/presentation/dialogueTokens.test.ts src/presentation/dialogue/Backlog.svelte
git commit -m "feat(ui): flip the backlog light and put it on tokens

Speaker names move from lime to blue -- lime is ~1.2:1 on a pale panel. Every
speaker gets blue; the style sheet's yellow unknown-speaker has no state behind
it here, so --c-yellow stays unused."
```

---

### Task 8: Generalise the guard to a directory sweep

Six named cases become one sweep, so a component added later is covered without anyone
remembering to add a case.

**This task has no red phase** — all six files are already clean, so the sweep passes the moment
it is written. That is expected and is not a reason to skip it: the six named cases only protect
the six files someone thought to list, and `Portrait.svelte` is already outside them.

A sweep has its own failure mode: if the glob matches nothing it passes vacuously and guards
nothing. The second case below exists to catch that.

**Files:**
- Modify: `tests/presentation/dialogueTokens.test.ts` (replace the describe block)

**Interfaces:**
- Consumes: `hexLiteralsIn` from Task 3.
- Produces: nothing new.

- [ ] **Step 1: Replace the six cases with the sweep**

Keep the imports and `hexLiteralsIn` exactly as they are. Replace only the `describe(...)` block:

```ts
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
```

Add `readdirSync` to the `node:fs` import:

```bash
sed -i "s|import { readFileSync } from 'node:fs';|import { readFileSync, readdirSync } from 'node:fs';|" tests/presentation/dialogueTokens.test.ts
grep -n "node:fs" tests/presentation/dialogueTokens.test.ts
```

- [ ] **Step 2: Prove the sweep has teeth**

A guard nobody has seen fail is a guard nobody knows works. Break one file, watch it fail, put it
back:

```bash
sed -i 's|color: var(--c-ink);|color: #0b1020;|' src/presentation/dialogue/Line.svelte
pnpm vitest run tests/presentation/dialogueTokens.test.ts
```

Expected: FAIL — `['Line.svelte: #0b1020']`.

```bash
git checkout src/presentation/dialogue/Line.svelte
pnpm vitest run tests/presentation/dialogueTokens.test.ts
```

Expected: 2 passed.

- [ ] **Step 3: Run the suite**

```bash
pnpm test
```

Expected: 140 passed — the six named cases collapsed into two, so the count drops by four from
Task 7's 144.

- [ ] **Step 4: Commit**

```bash
git add tests/presentation/dialogueTokens.test.ts
git commit -m "test(ui): sweep the dialogue directory for hex literals

Replaces six named cases with a directory scan, so a component added later is
covered without anyone remembering. A vacuous-glob case guards the guard."
```

---

### Task 9: Measure the contrast, confirm the fonts loaded, capture the screenshots

The only task that can send the design back. Everything above is substitution; this decides
whether `--surface-glass` at 0.72 is actually legible over a bright outdoor scene.

**Files:**
- Modify (only if the measurement fails): `src/app/tokens.css` — `--surface-glass` alpha
- Modify: `docs/superpowers/specs/2026-09-04-ui-token-system-design.md` section 6

**Interfaces:**
- Consumes: everything above.
- Produces: the recorded measurement.

- [ ] **Step 1: Start the preview**

```bash
# via the Browser pane, not Bash:
#   preview_start { name: "dev" }
```

Walk to a dialogue trigger and open the dialogue box so `.box` is on screen with **sky** behind
it. Sky is the brightest backdrop the box will ever have, so it is the worst case.

- [ ] **Step 2: Freeze the scene**

Read through the Browser pane's `javascript_tool`. Without this the scene moves between the two
samples and the numbers are noise — see `docs/HANDOFF.md` section 7 for the catalogue of ways
this project's pixel harness has produced false readings.

```js
const s = window.shadows ? BABYLON.EngineStore.LastCreatedScene : null;
s.animationsEnabled = false;
s.physicsEnabled = false;
```

- [ ] **Step 3: Sample the composited backdrop and compute the ratio**

Do not sample text pixels — antialiasing mixes edge greys in and the number is meaningless.
Sample an empty region of `.box` instead, and compare that composited colour against `--c-ink`.

```js
(() => {
  const box = document.querySelector('.box').getBoundingClientRect();
  // an empty strip inside the box, right of the text column
  const x = Math.round(box.right - 60), y = Math.round(box.top + 30);
  const lum = (r, g, b) => {
    const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ink = lum(11, 16, 32);
  return { x, y, ink, note: 'read the pixel at x,y from a screenshot and feed it to lum()' };
})()
```

Take a screenshot, read the RGB at the reported `x,y`, then:

`ratio = (max(Lbg, Link) + 0.05) / (min(Lbg, Link) + 0.05)`

- [ ] **Step 4: Judge it**

Body text is 20px regular (`Line.svelte`). WCAG "large" needs 24px regular or 18.66px bold, so
this is normal text and the threshold is **4.5:1**.

- **Pass:** record and continue.
- **Fail:** raise `--surface-glass`'s alpha in `src/app/tokens.css` in steps of 0.04, reload,
  and re-measure. Record every step, including the ones that failed — the failures are what show
  the final value was chosen rather than guessed.

- [ ] **Step 5: Confirm both new fonts actually loaded**

A wrong `src` path falls back to `system-ui` silently and the result looks plausible.

```js
[
  ['Poppins', document.fonts.check('700 16px Poppins')],
  ['JetBrains Mono 400', document.fonts.check('400 16px "JetBrains Mono"')],
  ['JetBrains Mono 800', document.fonts.check('800 16px "JetBrains Mono"')],
]
```

Expected: all three `true`. A `false` means the `@font-face` `src` or the family string is wrong —
fix `src/app/fonts.css` and reload.

- [ ] **Step 6: Capture the screenshots**

Three, each before and after (the "before" images come from `git stash` on this branch, or from
the merge-base checkout):

1. Dialogue box open, sky behind it
2. `Choices` open
3. `Backlog` open

- [ ] **Step 7: Record the measurements in the spec**

Append under `## 6. Measurements` in the spec: the sampled RGB, the computed ratio, the final
`--surface-glass` alpha and every value tried on the way, the three `document.fonts.check`
results, and the byte figures from Task 2 Step 7.

- [ ] **Step 8: Commit**

```bash
git add docs/superpowers/specs/2026-09-04-ui-token-system-design.md src/app/tokens.css
git commit -m "docs(ui): record the contrast measurement and the font-load check

<one line on whether 0.72 held or what it moved to and why>"
```

---

## Done when

- `pnpm test` is green and includes the directory sweep.
- `pnpm typecheck` is clean.
- No hex literal outside `src/app/tokens.css` in the touched directories.
- `public/fonts/` holds exactly seven files, all referenced.
- The measured contrast ratio is recorded in the spec and is at least 4.5:1.
- All three `document.fonts.check` calls returned `true`.
