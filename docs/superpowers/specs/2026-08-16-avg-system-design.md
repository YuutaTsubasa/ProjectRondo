# AVG System Migration — Opening Dialogue (Design Spec)

**Date:** 2026-08-16
**Status:** Approved (brainstorm), pending implementation plan
**Predecessor:** M1 web parity (character movement + babylon hub), merged in PR #13

## 1. Goal & context

Port the Godot **Dialogue** system (`__prototype__/src/ProjectRondo.Domain/Dialogue/*`) to the
web stack (TS + Svelte 5 + babylon), and use it to play an **opening dialogue when the player
enters the hub**: an AVG overlay renders over the existing 3D scene, and when the dialogue ends
(or is skipped) control hands off to the existing character gameplay.

This is one cohesive vertical slice — pure domain → custom DSL → reactive session → AVG UI →
hub-intro integration — not independent subsystems. It follows the same discipline as the
character migration: a **pure, engine-agnostic domain** driving a **Svelte presentation**, so the
dialogue engine stays portable (the reason for leaving Godot in the first place).

## 2. Scope

**In:**
- Pure Dialogue domain in TS, with Vitest parity coverage.
- A **custom DSL** (Ink/Yarn-inspired) with a parser that compiles to the domain's `DialogueGraph`.
- A reactive **session** (Svelte 5 runes) wrapping pure playback, plus **backlog** history.
- **AVG UI** from `__design__` (nameplate + line + typewriter, branch choices, LOG, AUTO, SKIP).
- **Hub-intro integration**: plays on entry as an overlay; AVG mode suspends WASD/camera;
  end/skip resumes gameplay.

**Out (YAGNI / later):**
- Save/Load (存檔) and MENU panels — deferred.
- Chapter-title card (第一章…) — deferred (author excluded it).
- NPC-triggered dialogue — the overlay is built to be reused for it, but wiring NPC triggers is a
  later piece.
- Real portrait art — placeholder slot now; the only supplied asset is a background.

## 3. Architecture & layering

```
src/domain/dialogue/                 ← pure, engine-agnostic, Vitest-covered
  nodeId.ts speaker.ts portraitKey.ts dialogueChoice.ts
  nodeExit.ts            (tagged union: linear | branch | end)
  dialogueNode.ts
  dialogueGraph.ts       (fromNodes + validate: missing-start / dangling / unreachable)
  dialogueState.ts       (tagged union: speaking | awaitingChoice | ended)
  dialogueInput.ts
  dialoguePlayback.ts    (pure start/step; invalid input = no-op)
  graphError.ts          (missingStart | danglingReference | unreachableNode)
  script/                ← the custom DSL, ALSO pure (text → graph)
    lexer.ts parser.ts   (parse errors surfaced alongside graph errors)

src/presentation/dialogue/           ← Svelte-bound
  dialogueSession.svelte.ts          (runes wrapper over playback + backlog)
  DialogueOverlay.svelte             (root: background, mode gate)
  Nameplate.svelte Line.svelte Choices.svelte Backlog.svelte Controls.svelte

src/content/dialogue/intro.dlg       ← the opening script (DSL source)
src/app/  (game-mode gate + hub wiring for the intro overlay)
```

**Data flow:** `intro.dlg` → parser → `DialogueGraph` (validated) → `DialogueSession` (runes) →
UI binds `speaker/line/portrait/choices/isFinished`; clicks call `advance()` / `select(i)`; on
`ended` the game mode flips to *playing*.

**Tagged unions:** C# `OneOf` maps to TS discriminated unions (`{ kind: '…' }`) with a small
`match` helper — same parity approach used for the character domain.

## 4. Domain port (parity)

Direct ports of the C# records/statics (semantics preserved line-for-line where practical):

| C# | TS |
|---|---|
| `NodeId(string)`, `Speaker(string)`, `PortraitKey(string)`, `DialogueChoice(string,NodeId)` | readonly record objects (branded string ids if useful) |
| `NodeExit : OneOf<LinearExit, BranchExit, EndExit>` | `type NodeExit = {kind:'linear',next} \| {kind:'branch',choices} \| {kind:'end'}` |
| `DialogueNode(Id,Speaker,Line,Portrait,Exit)` | `interface DialogueNode` (readonly) |
| `DialogueGraph(Nodes,StartId)` + `FromNodes` + `Validate()` | `dialogueGraph.ts` — `Map`/record of nodes, `fromNodes`, `validate` |
| `DialogueState : OneOf<Speaking, AwaitingChoice, Ended>` | discriminated union |
| `DialogueInput : OneOf<AdvanceInput, SelectInput>` | `{kind:'advance'} \| {kind:'select',index}` |
| `DialoguePlayback.Start/Step` | pure `start(graph)` / `step(graph,state,input)` |

**Behavioural invariants to preserve (and test):**
- `start` assumes `startId` exists (graph-construction invariant) and throws otherwise.
- `step` on invalid input is a **no-op returning the same state**: advancing while awaiting a
  choice, selecting while speaking, out-of-range select index, any input after `ended`.
- Mid-playback jump to a missing node id is a **no-op** (not a throw) — only `validate` reports it.
- `validate` returns `missingStart`, `danglingReference(from,target)`, `unreachableNode(id)`;
  empty for a well-formed graph; never throws.
- A node whose exit is `branch` produces `AwaitingChoice`; `linear`/`end` produce `Speaking`
  (matching `StateOf`); `Ended` is only reached by advancing a `Speaking` node whose exit is `end`.

## 5. Custom DSL

Authoring format compiled to `DialogueGraph`. The parser **auto-chains consecutive lines** into
linear nodes (auto-generated ids), so authors only name nodes that are jump targets.

```
:: greet
里昂: 雲層再往下沉三十公尺，哨站就看不見谷底了。
旁白: 風從西面壓過來，銀色的護甲上滑過一層薄光。
-> ask

:: ask
里昂: 你確定要在這種天氣裡下去？
* 走向懸崖邊，確認雲層下的動靜   -> cliff
* 先與同行的騎士確認裝備         -> gear
* 什麼都不說，繼續等待           -> wait

:: cliff
旁白: …
-> END
```

**Grammar (minimal):**
- `:: id` — a jump label (names the next node).
- `Speaker: line` — one dialogue node; `Speaker(portrait): line` sets an explicit portrait,
  otherwise the portrait defaults to the key `normal` (as in the Godot demo).
- Consecutive `Speaker: line` lines auto-chain via linear exits.
- `-> id` / `-> END` — explicit linear exit / end.
- `* choice text -> id` — a branch choice; a run of `*` lines forms one `BranchExit` on the
  preceding node.
- `# comment` — ignored.

**Errors:** the lexer/parser reports position-tagged errors (unknown target, choice with no
preceding line, duplicate label, empty node); after parsing, `graph.validate()` runs so dangling
/ unreachable authoring bugs also fail loudly at load rather than getting stuck at runtime.

**Alternative considered:** JSON data file (no parser). Rejected in favour of the DSL for
authoring ergonomics; kept *compiled to our own domain* (not adopting inkjs/bondage.js) to avoid
reintroducing a third-party runtime dependency.

## 6. Reactive session

`dialogueSession.svelte.ts` (Svelte 5 runes):
- `$state<DialogueState>` initialised from `start(graph)`.
- `$derived`: `speaker`, `line`, `portrait`, `choices`, `isFinished`, `current`.
- `advance()` / `select(i)` set state via pure `step()`.
- **Backlog:** appends `{speaker,line}` to a `backlog` array whenever the shown node changes
  (mirrors R3 `DistinctUntilChanged` on the node; the `line` stream deliberately re-emits even on
  repeated text so the typewriter restarts).

**Alternative considered:** a framework-agnostic observable (nanostores) for reuse outside Svelte.
Rejected — presentation is already committed to Svelte; the *domain* remains portable regardless.

## 7. AVG UI (from `__design__`)

Visual language from `基礎 UI` — white title-rail, black frosted-glass panels, single blue accent,
consistent spacing rhythm. Background = `__design__/uploads/background260709.png`.

- **Nameplate** — current speaker; style from `標題列方向` (default **1a 切角銘牌**; 1b/1c swappable).
- **Line** — typewriter reveal; a click first completes the reveal, a second click advances.
- **Choices** — the branch option list ("SELECT AN ACTION"); a click calls `select(i)`.
- **Backlog (回顧 / LOG)** — scrollable past lines from the session backlog.
- **Controls** — **AUTO** (auto-advance on a timer once the line finishes revealing),
  **SKIP** (fast-forward / dismiss the intro), **LOG** (toggle backlog).

## 8. Hub-intro integration

A top-level **game mode** `'intro' | 'playing'`:
- On hub load → mode `intro`: overlay mounts; character input (WASD) and camera look are
  suspended (the existing input/controller loop is gated on mode).
- Dialogue `ended` **or** SKIP → mode `playing`: overlay unmounts, gameplay resumes (WASD/camera
  live again).
- The overlay + session are reusable for later NPC-triggered dialogues (open a different graph).

## 9. Testing

- **Vitest (parity, pure):** `dialoguePlayback` (start; each no-op rule; branch→select→jump;
  advance→end), `dialogueGraph.validate` (missing-start / dangling / unreachable / clean),
  state & input unions. **DSL parser:** tokenizing, auto-chaining consecutive lines, branch runs,
  `-> END`, default portrait when omitted, and each authoring error.
- **In-browser (presentation):** intro plays over the hub; typewriter + click-to-complete;
  choices branch; AUTO advances; SKIP dismisses; backlog records; on end WASD/camera are live
  again (mode handoff).

## 10. Sequencing (phases for the plan)

1. **Domain port** (pure + tests) — value types, unions, graph+validate, playback.
2. **DSL** (pure + tests) — lexer/parser → graph, error reporting.
3. **Session** (runes + backlog).
4. **AVG UI** components wired to the session (design fidelity, typewriter/auto/skip/log).
5. **Hub-intro integration** — game-mode gate + intro `.dlg` + input suspension + handoff.

Phases 1–2 are pure and fully unit-tested before any UI; 3–5 are verified in-browser.

## 11. Open picks (non-blocking)

- **Title-rail style**: default **1a 切角銘牌**; 1b 骨架HUD / 1c 分節鋼條 available.
- **Portraits**: placeholder slot until real art exists.

## 12. Parity notes

- Port keeps the domain's "invalid input is a silent no-op; authoring bugs surface via `validate`"
  contract — do not turn mid-playback dangling jumps into throws.
- `line` stream must re-emit on repeated text (typewriter restart); `speaker`/`portrait` are
  distinct-until-changed.
- New branch `claude/avg-system-migration` off `main` (this replaces the merged SP0 branch).
