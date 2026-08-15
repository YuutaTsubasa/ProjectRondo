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

## Relationship to tooling

- **`.editorconfig`** encodes the analyzer-enforceable subset (currently #2, #7, #9, #10, #11, #12, #15)
  as Roslyn diagnostics for the C# prototype in `__prototype__/`. The TypeScript codebase currently
  relies on `tsc` strict mode (and Vitest) rather than a lint analyzer — an ESLint ruleset mirroring
  this subset would be the web-side equivalent.
- **The `reviewing-code` skill** applies all 18 (plus the four lenses) as a review checklist, with
  per-principle *flag-when / exempt-when* guidance, in either language.
