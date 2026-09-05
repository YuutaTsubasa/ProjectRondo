# Engineering Principles

ProjectRondo is built **TDD + DDD + Functional + Reactive**, with a pure **TypeScript** domain
(`src/domain/`, no engine/UI dependency) driving a **babylon.js + Svelte** presentation layer. (The
original Godot 4 / C# implementation is preserved under `__prototype__/` as a parity reference; the
principles below are language-agnostic in intent and apply to both.)

Four lenses frame every change:

- **TDD** — behaviour is pinned by a test written to specify it, not to echo today's constant.
- **DDD** — the domain stays engine-agnostic and pure; presentation converts input → domain values → applies results.
- **Functional core** — pure functions, immutable values, discriminated unions, side effects at the edges.
- **Reactive** — derive, don't hand-sync; one source of truth (Svelte runes/stores on the web; `R3` `ReactiveProperty` in the C# prototype).

## The 18 principles

Numbering is canonical and matches the `# (principle N)` references in [`.editorconfig`](../.editorconfig).
Principles marked **(analyzer)** are enforced by the Roslyn analyzers in `.editorconfig` for the C#
prototype; on the TypeScript side they are upheld by `tsc` strict mode and review (see *tooling* below).

| # | Principle | In short |
|---|-----------|----------|
| 1 | Avoid meaningless or redundant comments | A comment must add a non-obvious *why*, never restate the code. No commented-out dead code. |
| 2 | Extract functions instead of comments **(analyzer)** | If a `// do X` heads a block, make it a named function instead. |
| 3 | Avoid redundant property wrappers | No pass-through getter/property that only mirrors a value; no unused return values. |
| 4 | Avoid magic numbers and strings | Name unexplained literals in logic. Idiomatic `0/1/-1` and declarative data tables are fine. |
| 5 | Move constants out of functions | Don't rebuild a constant table/regex/object per call; hoist it to module scope. Unless the value depends on args. |
| 6 | Extract shared constants | The same literal or union duplicated across modules becomes one shared, type-checked definition. |
| 7 | Visually delimit begin/end scopes with braces **(analyzer)** | Multi-line scopes use braces; single-line control flow may omit them. |
| 8 | Prefer declarative iteration over hand-rolled loops | Use array/iterator methods (`map`/`filter`/`reduce`/`find`, `for…of`) over hand-rolled push/sum/find/map loops. Exempt: measured per-frame hot paths (note the tradeoff). |
| 9 | Prefer inferred types **(analyzer)** | Let the type be inferred (`const`/`let`, return types) unless an explicit annotation adds real safety or intent. |
| 10 | Prefer early returns **(analyzer)** | Guard-and-return over nested `if` pyramids; no `else` after a `return`. |
| 11 | Prefer expression-style dispatch over statement switches **(analyzer)** | Map input → value with a lookup/ternary/returning `switch` rather than a `switch` statement that assigns to an outer variable. Distinct side effects per branch → see #12. |
| 12 | Prefer exhaustive pattern matching **(analyzer)** | Dispatch must cover every case (assert `never` on the impossible); never silently swallow a new case or widen a discriminated union to its base. |
| 13 | Prefer event-driven programming over manual state tracking | Push/subscribe to events/observables; don't poll or hand-sync two states. Exempt: intentional edge-latch. |
| 14 | Prefer async/await over blocking waits and per-frame polling | Use `async`/`await` + Promises (and babylon `Observable`s / Svelte reactivity) instead of blocking or hand-rolled per-frame polling; avoid `.then` chains for control flow, and make fire-and-forget explicit with contained errors. The pure domain uses plain functions/Promises (no engine). |
| 15 | Prefer value semantics and immutability **(analyzer)** | Model with `readonly` interfaces and plain immutable objects; don't mutate inputs or domain values; no exported mutable singletons. Exempt: quarantined per-frame perf mutation (note it). |
| 16 | Make invalid states unrepresentable | Enforce invariants at the type boundary (smart constructors / factory functions, branded/narrowed types, parse-don't-validate) so an illegal value can't be constructed — not ad hoc at each call site. |
| 17 | Avoid single-line comments; document with doc comments | Document types/members with JSDoc `/** … */` (`/// <summary>` in the C# prototype), not `//`. Reserve in-body notes for a rare *why* that documents no API surface. |
| 18 | Prefer literal empty collections | Write empty collections as `[]` / `{}` literals (with `readonly` / `as const` for fixed tables) rather than helper constructors. |

## What review keeps catching in the web UI

The 18 above are about how code is written. This section is about what has actually gone wrong here.

PR #33 (the VN UI kit) took **18 review rounds and 55 findings** to reach a clean verdict. They were
not 55 independent problems — they were about six mistakes, each made several times, mostly in code
that every automated check passed. These are written as **checks to run**, not rules to remember,
because the rule was not the missing part: `tokens.css` said "`--c-blue` is a fill only" in a comment,
and the same PR then broke it at four sites -- the typing caret and two focus rings, all fixed
together in `3035f7a`, and the choice list's caret glyph, found five rounds later in `1b756b5`.

### Colour used as text or as an indicator

- **Measure against the composited backdrop, not the token's own surface.** A panel at
  `rgba(255,255,255,0.62)` over a live 3D scene is not white — it spans white down to `rgb(158)`
  depending on what is behind it. Compute the range and take the worst case.
- **An outline's backdrop is *outside* the element.** `outline-offset` puts the ring past the border
  box, so a focus ring on a panel is drawn on the scene, not on the panel. Contrast measured against
  the panel says nothing about it. Where the backdrop cannot be bounded, give the indicator its own
  contrast — a light halo with the ring inside it — rather than picking a colour and hoping.
- **A modal ground with alpha has no floor.** `rgba(soft-blue, 0.55)` over an arbitrary scene can
  composite arbitrarily dark. If text sits on it, make it opaque or measure the floor.
- Thresholds: **4.5:1** for text (24px regular / 18.66px bold is the "large" exemption), **3:1** for
  non-text indicators.

### Focus, when a panel covers the screen

- **`inert` does not blur.** Chrome leaves focus exactly where it was — now inside the inert subtree,
  non-interactive and out of the accessibility tree. The modal must take focus itself.
- **Save the trigger before the DOM updates.** A `$effect` runs after; use `$effect.pre`, or an
  engine that applies the spec's focus fixup will have moved `activeElement` to `<body>` already.
- **Defer the focus call by a task, not a frame.** `requestAnimationFrame` never fires on a hidden
  page, so a modal opening in a backgrounded tab would never take focus.
- **Mount modals conditionally.** A component that is always mounted and hides behind an inner
  `{#if}` runs its focus effect too early; a fresh mount is what makes the timing work.
- **Check siblings outside the wrapper.** `inert` on an overlay does not reach the `<canvas>` next to
  it. Babylon also sets a *positive* `tabIndex` in `Scene`'s constructor, synchronously, before the
  first `await` — so a reset in `.then()` leaves it tabbable for the whole scene load.
- **Scroll containers need a tab stop.** A scrollable region with no focusable child is pointer-only
  unless the browser volunteers (Chrome does; that is not something to depend on).

### Reaching assistive technology

- **`role="button"` prunes its children.** ARIA gives that role presentational children, so content
  inside it is removed from the accessibility tree and an `aria-label` replaces any name. Keep the
  affordance and the content as siblings — a stretched `<button>` over a plain container.
- **Hiding decoration is only half the job.** This UI carefully `aria-hidden`s every rail, marker and
  glyph, and for several rounds the dialogue line itself reached assistive technology not at all.
- **A typewriter belongs behind `aria-hidden`**, with the complete line exposed once in a
  visually-hidden sibling. A live region fed a per-character mutation announces per character.
- **A `<header>` inside a `div[role="dialog"]` is a page banner.** Only the `<dialog>` *element* is a
  sectioning root.

### Values that nothing holds together

- **A value repeated across two scoped `<style>` blocks has no guard in this repo.** Svelte scoping
  means there is no shared class to compare, and the token tests only check `var()` resolution and
  hex literals. Five things were extracted in PR #33 on exactly this argument. If two components are
  meant to match, the match has to live in `tokens.css`.
- **A comment asserting a match is not a mechanism** — and is worse than silence, because it reads as
  though something enforces it.

### Declarations that reach nothing

- `tests/app/tokens.test.ts` now fails on a token no `var()` references. Before it existed,
  `--c-ink-rgb` and `--c-white` each survived several rounds, kept alive by the test that read them.
- The same shape recurs without a guard: exported test helpers with one in-file caller, `class`
  attributes whose rule was deleted, event handlers a native element already provides.

### Comments that assert what nothing enforces

The largest cluster in PR #33, and the easiest to write without noticing.

- **A comment that states a fact can be wrong, and nothing checks it.** One explained why a regex
  skipped `{#each}` by saying a letter follows the `#` — `e`, `a` and `c` are all hex digits, and the
  real reason was the trailing word boundary. A maintainer trusting it would have read the two parts
  actually holding the guard together as incidental.
- **A comment that names other code goes stale silently.** One listed the `rgba()` sites its rule
  permitted, after those sites had become tokens, and cited a spec section that never existed in
  that document. Another documented a token as backing a hairline that had been deleted.
- **A comment that claims two things match is not a mechanism.** "matching Choices" sat above a
  heading whose type treatment nothing held to the other panel's. That is worse than silence: it
  reads as though something enforces it.
- **An inserted wrapper orphans the comment above it.** Twice, adding a `<div>` left an explanation
  describing an element two lines further down and one level deeper.
- **Check the comment when you change the code it describes** — including a test's own header. One
  claimed coverage of a behaviour no case exercised.

## Relationship to tooling

- **`.editorconfig`** encodes the analyzer-enforceable subset (currently #2, #7, #9, #10, #11, #12, #15)
  as Roslyn diagnostics for the C# prototype in `__prototype__/`. The TypeScript codebase currently
  relies on `tsc` strict mode (and Vitest) rather than a lint analyzer — an ESLint ruleset mirroring
  this subset would be the web-side equivalent.
- **The `reviewing-code` skill** applies all 18 (plus the four lenses) as a review checklist, with
  per-principle *flag-when / exempt-when* guidance, in either language.
