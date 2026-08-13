# Engineering Principles

ProjectRondo is built **TDD + DDD + Functional + Reactive**, with a pure C# domain
(`src/ProjectRondo.Domain/`, no Godot dependency) driving a Godot presentation layer.

Four lenses frame every change:

- **TDD** — behaviour is pinned by a test written to specify it, not to echo today's constant.
- **DDD** — the domain stays engine-agnostic and pure; presentation converts input → domain values → applies results.
- **Functional core** — pure functions, immutable values, discriminated unions (`OneOf`), side effects at the edges.
- **Reactive** — derive, don't hand-sync; one source of truth (`R3` `ReactiveProperty`).

## The 18 principles

Numbering is canonical and matches the `# (principle N)` references in [`.editorconfig`](../.editorconfig).
Principles marked **(analyzer)** are nudged or enforced by the analyzers in `.editorconfig`.

| # | Principle | In short |
|---|-----------|----------|
| 1 | Avoid meaningless or redundant comments | A comment must add a non-obvious *why*, never restate the code. No commented-out dead code. |
| 2 | Extract methods instead of comments **(analyzer)** | If a `// do X` heads a block, make it a named method instead. |
| 3 | Avoid redundant property wrappers | No pass-through getter/property that only mirrors a value; no unused return values. |
| 4 | Avoid magic numbers and strings | Name unexplained literals in logic. Idiomatic `0/1/-1` and declarative data tables are fine. |
| 5 | Move constants out of methods | Don't rebuild a constant table/regex/object per call; hoist it. Unless the value depends on args. |
| 6 | Extract shared constants | The same literal or union duplicated across modules becomes one shared, compiler-checked definition. |
| 7 | Visually delimit begin/end scopes with braces **(analyzer)** | Multi-line scopes use braces; single-line control flow may omit them. |
| 8 | Prefer LINQ over loops | Use LINQ (or `ForEach()` / `GridRange()` extensions) over hand-rolled push/sum/find/map loops. Exempt: measured per-frame hot paths (note the tradeoff). |
| 9 | Prefer `var` over explicit types **(analyzer)** | Let the type be inferred unless an explicit annotation adds real safety or intent. |
| 10 | Prefer early returns **(analyzer)** | Guard-and-return over nested `if` pyramids; no `else` after a `return`. |
| 11 | Prefer switch expressions over switch statements **(analyzer)** | A `switch` that only maps input → value is an expression. Distinct side effects per branch → see #12. |
| 12 | Prefer exhaustive pattern matching **(analyzer)** | Dispatch must cover every case (throw on the impossible); never silently swallow a new case or widen a union to its base. |
| 13 | Prefer event-driven programming over manual state tracking | Push/subscribe to events; don't poll or hand-sync two states. Exempt: intentional edge-latch. |
| 14 | Prefer UniTask over Task and coroutines | Use UniTask for async; avoid raw `Task`/coroutines and `.ContinueWith` chains. Fire-and-forget must be explicit with contained errors. |
| 15 | Prefer value semantics and immutability **(analyzer)** | Model with `struct`/`record`; don't mutate inputs or domain values, no exported mutable singletons. Exempt: quarantined per-frame perf mutation (note it). |
| 16 | Make invalid states unrepresentable | Enforce invariants at the type boundary (smart constructors, branded/narrowed types, parse-don't-validate) so an illegal value can't be constructed — not ad hoc at each call site. |
| 17 | Avoid single-line comments; use XML summaries | Document types/members with `/// <summary>`, not `//`. Reserve in-body notes for a rare *why* that documents no API surface. |
| 18 | Prefer collection expression `[]` over `Enumerable.Empty<T>()` / `Array.Empty<T>()` | Write empty collections as `[]` — one syntax for empty and non-empty, and for read-only/array targets the compiler emits the same cached empty as `Array.Empty<T>()`. Exempt only when there is no target type for `[]` to bind to (a bare `var`). |

## Relationship to tooling

- **`.editorconfig`** encodes the analyzer-enforceable subset (currently #2, #7, #9, #10, #11, #12, #15) as diagnostics.
- **The `reviewing-code` skill** applies all 18 (plus the four lenses) as a review checklist, with per-principle *flag-when / exempt-when* guidance.
