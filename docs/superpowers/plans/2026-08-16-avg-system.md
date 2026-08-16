# AVG System (Opening Dialogue) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the Godot Dialogue system to TS and play an opening dialogue as an overlay when the player enters the hub, handing off to gameplay when it ends.

**Architecture:** A pure, engine-agnostic `src/domain/dialogue` (value types, tagged-union `NodeExit`/`DialogueState`/`DialogueInput`, `DialogueGraph`+`validate`, pure `DialoguePlayback`) with a custom DSL parser compiling script text into the graph; a Svelte-5-runes `DialogueSession` wrapping the pure playback with backlog; AVG UI components; and a hub game-mode gate that suspends WASD/camera during the intro.

**Tech Stack:** TypeScript, Vitest, Svelte 5 (runes), babylon.js (existing hub), Vite.

**Spec:** `docs/superpowers/specs/2026-08-16-avg-system-design.md`

**Conventions (match existing code):**
- Value types = `readonly` interfaces/`type`s + factory functions + `UPPER_CASE` constants (see `src/domain/hub/character/characterMotion.ts`).
- Tagged unions = `{ readonly kind: '...' }` discriminated unions; dispatch with `switch (x.kind)`.
- Domain imports are relative (`../math/...`); test imports use `../../../../src/domain/...`.
- Tests: `describe/it/expect` from `vitest`, files at `tests/**/*.test.ts`, node env.
- Run tests: `pnpm test` (all) or `pnpm exec vitest run <path>` (one file). Typecheck: `pnpm run typecheck`.

---

## Phase 1 — Pure domain port (Vitest)

### Task 1: Dialogue value types

**Files:**
- Create: `src/domain/dialogue/nodeId.ts`, `src/domain/dialogue/speaker.ts`, `src/domain/dialogue/portraitKey.ts`, `src/domain/dialogue/dialogueChoice.ts`
- Test: `tests/domain/dialogue/valueTypes.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/domain/dialogue/valueTypes.test.ts
import { describe, it, expect } from 'vitest';
import { nodeId } from '../../../src/domain/dialogue/nodeId';
import { speaker } from '../../../src/domain/dialogue/speaker';
import { portraitKey } from '../../../src/domain/dialogue/portraitKey';
import { dialogueChoice } from '../../../src/domain/dialogue/dialogueChoice';

describe('dialogue value types', () => {
  it('brands are plain strings at runtime (usable as Map keys and for display)', () => {
    expect(nodeId('greet')).toBe('greet');
    expect(speaker('里昂')).toBe('里昂');
    expect(portraitKey('normal')).toBe('normal');
    const key = nodeId('a');
    expect(new Map([[key, 1]]).get(nodeId('a'))).toBe(1); // value equality
  });
  it('dialogueChoice pairs a label with a target', () => {
    expect(dialogueChoice('左邊', nodeId('left'))).toEqual({ label: '左邊', target: 'left' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/domain/dialogue/valueTypes.test.ts`
Expected: FAIL — cannot find module `nodeId`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/domain/dialogue/nodeId.ts
/** A node's identity within a graph. A branded string: value-equal, usable as a Map key. */
export type NodeId = string & { readonly __brand: 'NodeId' };
export const nodeId = (value: string): NodeId => value as NodeId;
```

```ts
// src/domain/dialogue/speaker.ts
/** Who speaks a line. Branded string; the value is the display name. */
export type Speaker = string & { readonly __brand: 'Speaker' };
export const speaker = (name: string): Speaker => name as Speaker;
```

```ts
// src/domain/dialogue/portraitKey.ts
/** Which portrait to show for a line. Branded string. */
export type PortraitKey = string & { readonly __brand: 'PortraitKey' };
export const portraitKey = (value: string): PortraitKey => value as PortraitKey;
```

```ts
// src/domain/dialogue/dialogueChoice.ts
import { type NodeId } from './nodeId';

/** A branch option: a label the player picks, and the node it leads to. */
export interface DialogueChoice {
  readonly label: string;
  readonly target: NodeId;
}
export const dialogueChoice = (label: string, target: NodeId): DialogueChoice => ({ label, target });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/domain/dialogue/valueTypes.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/domain/dialogue tests/domain/dialogue/valueTypes.test.ts
git commit -m "feat(dialogue): value types (NodeId, Speaker, PortraitKey, DialogueChoice)"
```

---

### Task 2: NodeExit tagged union

**Files:**
- Create: `src/domain/dialogue/nodeExit.ts`
- Test: `tests/domain/dialogue/nodeExit.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/domain/dialogue/nodeExit.test.ts
import { describe, it, expect } from 'vitest';
import { linearExit, branchExit, END_EXIT } from '../../../src/domain/dialogue/nodeExit';
import { dialogueChoice } from '../../../src/domain/dialogue/dialogueChoice';
import { nodeId } from '../../../src/domain/dialogue/nodeId';

describe('NodeExit', () => {
  it('linear carries the next node id', () => {
    expect(linearExit(nodeId('ask'))).toEqual({ kind: 'linear', next: 'ask' });
  });
  it('branch carries the choices', () => {
    const c = [dialogueChoice('左', nodeId('l')), dialogueChoice('右', nodeId('r'))];
    expect(branchExit(c)).toEqual({ kind: 'branch', choices: c });
  });
  it('end is a singleton kind', () => {
    expect(END_EXIT).toEqual({ kind: 'end' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/domain/dialogue/nodeExit.test.ts`
Expected: FAIL — cannot find module `nodeExit`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/domain/dialogue/nodeExit.ts
import { type NodeId } from './nodeId';
import { type DialogueChoice } from './dialogueChoice';

/** Where a node leads: the linear next, a set of branch choices, or the end. */
export type NodeExit =
  | { readonly kind: 'linear'; readonly next: NodeId }
  | { readonly kind: 'branch'; readonly choices: readonly DialogueChoice[] }
  | { readonly kind: 'end' };

export const linearExit = (next: NodeId): NodeExit => ({ kind: 'linear', next });
export const branchExit = (choices: readonly DialogueChoice[]): NodeExit => ({ kind: 'branch', choices });
export const END_EXIT: NodeExit = { kind: 'end' };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/domain/dialogue/nodeExit.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/domain/dialogue/nodeExit.ts tests/domain/dialogue/nodeExit.test.ts
git commit -m "feat(dialogue): NodeExit tagged union (linear/branch/end)"
```

---

### Task 3: DialogueNode, DialogueState, DialogueInput

**Files:**
- Create: `src/domain/dialogue/dialogueNode.ts`, `src/domain/dialogue/dialogueState.ts`, `src/domain/dialogue/dialogueInput.ts`
- Test: `tests/domain/dialogue/dialogueInput.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/domain/dialogue/dialogueInput.test.ts
import { describe, it, expect } from 'vitest';
import { ADVANCE, select } from '../../../src/domain/dialogue/dialogueInput';

describe('DialogueInput', () => {
  it('ADVANCE is the advance intent', () => {
    expect(ADVANCE).toEqual({ kind: 'advance' });
  });
  it('select carries a zero-based index', () => {
    expect(select(2)).toEqual({ kind: 'select', index: 2 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/domain/dialogue/dialogueInput.test.ts`
Expected: FAIL — cannot find module `dialogueInput`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/domain/dialogue/dialogueNode.ts
import { type NodeId } from './nodeId';
import { type Speaker } from './speaker';
import { type PortraitKey } from './portraitKey';
import { type NodeExit } from './nodeExit';

/** One line of dialogue: who says it, the text, the portrait to show, and where it leads. */
export interface DialogueNode {
  readonly id: NodeId;
  readonly speaker: Speaker;
  readonly line: string;
  readonly portrait: PortraitKey;
  readonly exit: NodeExit;
}
```

```ts
// src/domain/dialogue/dialogueState.ts
import { type DialogueNode } from './dialogueNode';
import { type DialogueChoice } from './dialogueChoice';

/** The observable state of a running dialogue: showing a line, awaiting a choice, or ended. */
export type DialogueState =
  | { readonly kind: 'speaking'; readonly current: DialogueNode }
  | { readonly kind: 'awaitingChoice'; readonly current: DialogueNode; readonly choices: readonly DialogueChoice[] }
  | { readonly kind: 'ended'; readonly last: DialogueNode };

/** The node currently on screen, whichever state we are in. */
export const currentNode = (state: DialogueState): DialogueNode =>
  state.kind === 'ended' ? state.last : state.current;
```

```ts
// src/domain/dialogue/dialogueInput.ts
/** Player intent while a dialogue runs: advance the current line, or select a branch option. */
export type DialogueInput =
  | { readonly kind: 'advance' }
  | { readonly kind: 'select'; readonly index: number };

export const ADVANCE: DialogueInput = { kind: 'advance' };
export const select = (index: number): DialogueInput => ({ kind: 'select', index });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/domain/dialogue/dialogueInput.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/domain/dialogue/dialogueNode.ts src/domain/dialogue/dialogueState.ts src/domain/dialogue/dialogueInput.ts tests/domain/dialogue/dialogueInput.test.ts
git commit -m "feat(dialogue): DialogueNode, DialogueState, DialogueInput"
```

---

### Task 4: DialogueGraph + validate + GraphError

**Files:**
- Create: `src/domain/dialogue/graphError.ts`, `src/domain/dialogue/dialogueGraph.ts`
- Test: `tests/domain/dialogue/dialogueGraph.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/domain/dialogue/dialogueGraph.test.ts
import { describe, it, expect } from 'vitest';
import { fromNodes, validate } from '../../../src/domain/dialogue/dialogueGraph';
import { type DialogueNode } from '../../../src/domain/dialogue/dialogueNode';
import { nodeId } from '../../../src/domain/dialogue/nodeId';
import { speaker } from '../../../src/domain/dialogue/speaker';
import { portraitKey } from '../../../src/domain/dialogue/portraitKey';
import { linearExit, branchExit, END_EXIT } from '../../../src/domain/dialogue/nodeExit';
import { dialogueChoice } from '../../../src/domain/dialogue/dialogueChoice';

const p = portraitKey('normal');
const s = speaker('Nina');
const node = (id: string, exit: DialogueNode['exit']): DialogueNode =>
  ({ id: nodeId(id), speaker: s, line: id, portrait: p, exit });

describe('DialogueGraph.validate', () => {
  it('is empty for a well-formed graph', () => {
    const g = fromNodes(nodeId('a'), [node('a', linearExit(nodeId('b'))), node('b', END_EXIT)]);
    expect(validate(g)).toEqual([]);
  });
  it('reports a missing start node', () => {
    const g = fromNodes(nodeId('missing'), [node('a', END_EXIT)]);
    expect(validate(g)).toContainEqual({ kind: 'missingStart', startId: 'missing' });
  });
  it('reports a dangling reference', () => {
    const g = fromNodes(nodeId('a'), [node('a', linearExit(nodeId('gone')))]);
    expect(validate(g)).toContainEqual({ kind: 'danglingReference', from: 'a', target: 'gone' });
  });
  it('reports an unreachable node', () => {
    const g = fromNodes(nodeId('a'), [node('a', END_EXIT), node('island', END_EXIT)]);
    expect(validate(g)).toContainEqual({ kind: 'unreachableNode', node: 'island' });
  });
  it('follows branch targets when computing reachability', () => {
    const g = fromNodes(nodeId('a'), [
      node('a', branchExit([dialogueChoice('x', nodeId('b'))])),
      node('b', END_EXIT),
    ]);
    expect(validate(g)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/domain/dialogue/dialogueGraph.test.ts`
Expected: FAIL — cannot find module `dialogueGraph`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/domain/dialogue/graphError.ts
import { type NodeId } from './nodeId';

/** Authoring problems surfaced by DialogueGraph.validate so they fail at load, not at runtime. */
export type GraphError =
  | { readonly kind: 'missingStart'; readonly startId: NodeId }
  | { readonly kind: 'danglingReference'; readonly from: NodeId; readonly target: NodeId }
  | { readonly kind: 'unreachableNode'; readonly node: NodeId };
```

```ts
// src/domain/dialogue/dialogueGraph.ts
import { type NodeId } from './nodeId';
import { type DialogueNode } from './dialogueNode';
import { type NodeExit } from './nodeExit';
import { type GraphError } from './graphError';

/** An immutable dialogue as a graph of nodes keyed by id, with a designated start. */
export interface DialogueGraph {
  readonly nodes: ReadonlyMap<NodeId, DialogueNode>;
  readonly startId: NodeId;
}

/** Builds a graph from nodes, indexing each by its id. */
export const fromNodes = (startId: NodeId, nodes: readonly DialogueNode[]): DialogueGraph => ({
  nodes: new Map(nodes.map((n) => [n.id, n])),
  startId,
});

/** The node ids an exit can lead to: the linear next, each branch target, or none for an end. */
const targets = (exit: NodeExit): readonly NodeId[] => {
  switch (exit.kind) {
    case 'linear': return [exit.next];
    case 'branch': return exit.choices.map((c) => c.target);
    case 'end': return [];
  }
};

/** The set of node ids reachable from `start` by following exits present in the graph. */
const reachableFrom = (graph: DialogueGraph, start: NodeId): ReadonlySet<NodeId> => {
  const visited = new Set<NodeId>();
  const pending: NodeId[] = [start];
  while (pending.length > 0) {
    const id = pending.pop()!;
    const node = graph.nodes.get(id);
    if (!node || visited.has(id)) continue;
    visited.add(id);
    for (const t of targets(node.exit)) pending.push(t);
  }
  return visited;
};

/** Reports authoring problems; empty for a well-formed graph. Never throws. */
export const validate = (graph: DialogueGraph): readonly GraphError[] => {
  const hasStart = graph.nodes.has(graph.startId);
  const reachable = hasStart ? reachableFrom(graph, graph.startId) : new Set<NodeId>();
  const errors: GraphError[] = [];

  if (!hasStart) errors.push({ kind: 'missingStart', startId: graph.startId });

  for (const node of graph.nodes.values())
    for (const target of targets(node.exit))
      if (!graph.nodes.has(target))
        errors.push({ kind: 'danglingReference', from: node.id, target });

  if (hasStart)
    for (const id of graph.nodes.keys())
      if (!reachable.has(id)) errors.push({ kind: 'unreachableNode', node: id });

  return errors;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/domain/dialogue/dialogueGraph.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/domain/dialogue/graphError.ts src/domain/dialogue/dialogueGraph.ts tests/domain/dialogue/dialogueGraph.test.ts
git commit -m "feat(dialogue): DialogueGraph + validate (missing-start/dangling/unreachable)"
```

---

### Task 5: DialoguePlayback (pure start/step)

**Files:**
- Create: `src/domain/dialogue/dialoguePlayback.ts`
- Test: `tests/domain/dialogue/dialoguePlayback.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/domain/dialogue/dialoguePlayback.test.ts
import { describe, it, expect } from 'vitest';
import { start, step } from '../../../src/domain/dialogue/dialoguePlayback';
import { fromNodes } from '../../../src/domain/dialogue/dialogueGraph';
import { type DialogueNode } from '../../../src/domain/dialogue/dialogueNode';
import { nodeId } from '../../../src/domain/dialogue/nodeId';
import { speaker } from '../../../src/domain/dialogue/speaker';
import { portraitKey } from '../../../src/domain/dialogue/portraitKey';
import { linearExit, branchExit, END_EXIT } from '../../../src/domain/dialogue/nodeExit';
import { dialogueChoice } from '../../../src/domain/dialogue/dialogueChoice';
import { ADVANCE, select } from '../../../src/domain/dialogue/dialogueInput';

const p = portraitKey('normal');
const s = speaker('Nina');
const node = (id: string, exit: DialogueNode['exit']): DialogueNode =>
  ({ id: nodeId(id), speaker: s, line: id, portrait: p, exit });

// greet -> ask (branch: left|right) ; left/right end
const graph = fromNodes(nodeId('greet'), [
  node('greet', linearExit(nodeId('ask'))),
  node('ask', branchExit([dialogueChoice('L', nodeId('left')), dialogueChoice('R', nodeId('right'))])),
  node('left', END_EXIT),
  node('right', END_EXIT),
]);

describe('DialoguePlayback', () => {
  it('start is speaking the start node', () => {
    expect(start(graph)).toEqual({ kind: 'speaking', current: graph.nodes.get(nodeId('greet')) });
  });
  it('start throws when the start node is missing', () => {
    const bad = fromNodes(nodeId('nope'), [node('a', END_EXIT)]);
    expect(() => start(bad)).toThrow();
  });
  it('advancing a linear line moves to the next node (which awaits a choice)', () => {
    const next = step(graph, start(graph), ADVANCE);
    expect(next.kind).toBe('awaitingChoice');
    expect(next.kind === 'awaitingChoice' && next.choices.length).toBe(2);
  });
  it('selecting a valid choice jumps to its target', () => {
    const awaiting = step(graph, start(graph), ADVANCE);
    const chosen = step(graph, awaiting, select(0));
    expect(chosen).toEqual({ kind: 'speaking', current: graph.nodes.get(nodeId('left')) });
  });
  it('advancing a line whose exit is end ends the dialogue', () => {
    const awaiting = step(graph, start(graph), ADVANCE);
    const left = step(graph, awaiting, select(0)); // speaking 'left' (END_EXIT)
    const ended = step(graph, left, ADVANCE);
    expect(ended).toEqual({ kind: 'ended', last: graph.nodes.get(nodeId('left')) });
  });

  // No-op rules (invalid input returns the SAME state reference).
  it('advancing while awaiting a choice is a no-op', () => {
    const awaiting = step(graph, start(graph), ADVANCE);
    expect(step(graph, awaiting, ADVANCE)).toBe(awaiting);
  });
  it('selecting while speaking is a no-op', () => {
    const speaking = start(graph);
    expect(step(graph, speaking, select(0))).toBe(speaking);
  });
  it('an out-of-range select is a no-op', () => {
    const awaiting = step(graph, start(graph), ADVANCE);
    expect(step(graph, awaiting, select(5))).toBe(awaiting);
    expect(step(graph, awaiting, select(-1))).toBe(awaiting);
  });
  it('any input after the end is a no-op', () => {
    const awaiting = step(graph, start(graph), ADVANCE);
    const left = step(graph, awaiting, select(0));
    const ended = step(graph, left, ADVANCE);
    expect(step(graph, ended, ADVANCE)).toBe(ended);
    expect(step(graph, ended, select(0))).toBe(ended);
  });
  it('a dangling jump mid-playback is a no-op (only validate reports it)', () => {
    const g = fromNodes(nodeId('a'), [node('a', linearExit(nodeId('gone')))]);
    const speaking = start(g);
    expect(step(g, speaking, ADVANCE)).toBe(speaking);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/domain/dialogue/dialoguePlayback.test.ts`
Expected: FAIL — cannot find module `dialoguePlayback`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/domain/dialogue/dialoguePlayback.ts
import { type DialogueGraph } from './dialogueGraph';
import { type DialogueNode } from './dialogueNode';
import { type NodeId } from './nodeId';
import { type DialogueState } from './dialogueState';
import { type DialogueInput } from './dialogueInput';

/** The state showing a node: awaiting a choice if it branches, otherwise speaking. */
const stateOf = (node: DialogueNode): DialogueState =>
  node.exit.kind === 'branch'
    ? { kind: 'awaitingChoice', current: node, choices: node.exit.choices }
    : { kind: 'speaking', current: node };

/** The state at the graph's start node. Assumes startId exists (a construction invariant); throws otherwise. */
export const start = (graph: DialogueGraph): DialogueState => {
  const node = graph.nodes.get(graph.startId);
  if (!node) throw new Error(`start node '${graph.startId}' is not in the graph`);
  return stateOf(node);
};

/** Move to node `id` if present, else return `fallback` (a mid-playback dangling ref is a no-op). */
const go = (graph: DialogueGraph, id: NodeId, fallback: DialogueState): DialogueState => {
  const node = graph.nodes.get(id);
  return node ? stateOf(node) : fallback;
};

/** Advances the dialogue by one input, returning the SAME state for invalid input. */
export const step = (graph: DialogueGraph, state: DialogueState, input: DialogueInput): DialogueState => {
  switch (state.kind) {
    case 'speaking': {
      if (input.kind !== 'advance') return state;         // selecting while speaking: no-op
      const exit = state.current.exit;
      if (exit.kind === 'linear') return go(graph, exit.next, state);
      if (exit.kind === 'end') return { kind: 'ended', last: state.current };
      return state;                                       // branch handled by awaitingChoice
    }
    case 'awaitingChoice': {
      if (input.kind !== 'select') return state;          // advancing while awaiting: no-op
      if (input.index < 0 || input.index >= state.choices.length) return state;
      return go(graph, state.choices[input.index].target, state);
    }
    case 'ended':
      return state;                                       // input after end: no-op
  }
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/domain/dialogue/dialoguePlayback.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm run typecheck` → Expected: exit 0.

```bash
git add src/domain/dialogue/dialoguePlayback.ts tests/domain/dialogue/dialoguePlayback.test.ts
git commit -m "feat(dialogue): pure DialoguePlayback (start/step, invalid input = no-op)"
```

---

## Phase 2 — Custom DSL (Vitest)

The parser compiles script text into a `DialogueGraph`. It auto-chains consecutive `Speaker: line`
lines into linear nodes (auto-generated ids), so only jump targets need `:: id` labels.

### Task 6: DSL lexer (tokenize)

**Files:**
- Create: `src/domain/dialogue/script/token.ts`, `src/domain/dialogue/script/lexer.ts`
- Test: `tests/domain/dialogue/script/lexer.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/domain/dialogue/script/lexer.test.ts
import { describe, it, expect } from 'vitest';
import { tokenize } from '../../../../src/domain/dialogue/script/lexer';

describe('DSL lexer', () => {
  it('tokenizes labels, lines, gotos and choices, ignoring blanks and comments', () => {
    const src = [
      '# a comment',
      ':: greet',
      '里昂: 你好。',
      '旁白(wide): 風起了。',
      '',
      '-> ask',
      ':: ask',
      '里昂: 走哪邊？',
      '* 左邊 -> left',
      '* 右邊 -> right',
      '-> END',
    ].join('\n');
    expect(tokenize(src)).toEqual([
      { kind: 'label', id: 'greet', line: 2 },
      { kind: 'line', speaker: '里昂', portrait: undefined, text: '你好。', line: 3 },
      { kind: 'line', speaker: '旁白', portrait: 'wide', text: '風起了。', line: 4 },
      { kind: 'goto', target: 'ask', line: 6 },
      { kind: 'label', id: 'ask', line: 7 },
      { kind: 'line', speaker: '里昂', portrait: undefined, text: '走哪邊？', line: 8 },
      { kind: 'choice', text: '左邊', target: 'left', line: 9 },
      { kind: 'choice', text: '右邊', target: 'right', line: 10 },
      { kind: 'goto', target: 'END', line: 11 },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/domain/dialogue/script/lexer.test.ts`
Expected: FAIL — cannot find module `lexer`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/domain/dialogue/script/token.ts
/** A lexed line of DSL source (1-based `line` for error messages). */
export type Token =
  | { readonly kind: 'label'; readonly id: string; readonly line: number }
  | { readonly kind: 'line'; readonly speaker: string; readonly portrait: string | undefined; readonly text: string; readonly line: number }
  | { readonly kind: 'goto'; readonly target: string; readonly line: number }
  | { readonly kind: 'choice'; readonly text: string; readonly target: string; readonly line: number };
```

```ts
// src/domain/dialogue/script/lexer.ts
import { type Token } from './token';

/** `* text -> target` */
const CHOICE = /^\*\s*(.+?)\s*->\s*(\S+)\s*$/;
/** `Speaker: text` or `Speaker(portrait): text` */
const LINE = /^([^():]+?)(?:\(([^)]*)\))?\s*:\s*(.*)$/;

/** Splits DSL source into one token per meaningful line; blanks and `#` comments are skipped. */
export const tokenize = (source: string): Token[] => {
  const tokens: Token[] = [];
  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = i + 1;
    const raw = lines[i].trim();
    if (raw === '' || raw.startsWith('#')) continue;

    if (raw.startsWith('::')) {
      tokens.push({ kind: 'label', id: raw.slice(2).trim(), line });
      continue;
    }
    if (raw.startsWith('->')) {
      tokens.push({ kind: 'goto', target: raw.slice(2).trim(), line });
      continue;
    }
    const choice = CHOICE.exec(raw);
    if (choice) {
      tokens.push({ kind: 'choice', text: choice[1], target: choice[2], line });
      continue;
    }
    const parsed = LINE.exec(raw);
    if (parsed) {
      tokens.push({ kind: 'line', speaker: parsed[1].trim(), portrait: parsed[2]?.trim() || undefined, text: parsed[3].trim(), line });
      continue;
    }
    // Unrecognized line: emit a line token with empty speaker so the parser reports it in context.
    tokens.push({ kind: 'line', speaker: '', portrait: undefined, text: raw, line });
  }
  return tokens;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/domain/dialogue/script/lexer.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/domain/dialogue/script/token.ts src/domain/dialogue/script/lexer.ts tests/domain/dialogue/script/lexer.test.ts
git commit -m "feat(dialogue): DSL lexer (labels/lines/gotos/choices)"
```

---

### Task 7: DSL parser (tokens → DialogueGraph)

**Files:**
- Create: `src/domain/dialogue/script/parseError.ts`, `src/domain/dialogue/script/parser.ts`
- Test: `tests/domain/dialogue/script/parser.test.ts`

Parsing rules:
- A `line` token creates a `DialogueNode` (id = the pending `::` label, else auto `#N` where N is the node's order). Default portrait = `normal` when omitted.
- Consecutive line nodes auto-chain: the previous node's exit becomes `linear(next)` — unless it was already set by a `goto` or `choice`.
- `goto id` / `goto END` sets the previous node's exit to `linear(id)` / `end`.
- A run of `choice` tokens sets the previous node's exit to `branch([...])`.
- Start id = the first node's id.
- The last node with an unset exit defaults to `end`.
- After building, run `validate` and merge its errors.

- [ ] **Step 1: Write the failing test**

```ts
// tests/domain/dialogue/script/parser.test.ts
import { describe, it, expect } from 'vitest';
import { parse } from '../../../../src/domain/dialogue/script/parser';
import { start, step } from '../../../../src/domain/dialogue/dialoguePlayback';
import { ADVANCE, select } from '../../../../src/domain/dialogue/dialogueInput';

const SCRIPT = `
:: greet
里昂: 雲層再往下沉三十公尺，哨站就看不見谷底了。
旁白: 風從西面壓過來。
-> ask

:: ask
里昂: 你確定要在這種天氣裡下去？
* 走向懸崖邊 -> cliff
* 繼續等待 -> wait

:: cliff
旁白: 你走向懸崖。
-> END

:: wait
旁白: 你選擇等待。
`;

describe('DSL parser', () => {
  it('parses a well-formed script into a runnable graph', () => {
    const { graph, errors } = parse(SCRIPT);
    expect(errors).toEqual([]);
    expect(graph).toBeDefined();

    // greet: two auto-chained lines, then -> ask (a branch of 2)
    let state = start(graph!);
    expect(state.kind === 'speaking' && state.current.speaker).toBe('里昂');
    state = step(graph!, state, ADVANCE); // second line (旁白)
    expect(state.kind === 'speaking' && state.current.speaker).toBe('旁白');
    state = step(graph!, state, ADVANCE); // -> ask (awaiting choice)
    expect(state.kind).toBe('awaitingChoice');
    expect(state.kind === 'awaitingChoice' && state.choices.map((c) => c.label)).toEqual(['走向懸崖邊', '繼續等待']);

    // choose cliff -> line -> END
    state = step(graph!, state, select(0));
    expect(state.kind === 'speaking' && state.current.speaker).toBe('旁白');
    state = step(graph!, state, ADVANCE);
    expect(state.kind).toBe('ended');
  });

  it('defaults the portrait to "normal" when omitted', () => {
    const { graph } = parse(':: a\n里昂: 嗨。\n');
    const node = start(graph!);
    expect(node.kind === 'speaking' && node.current.portrait).toBe('normal');
  });

  it('reports a choice that appears before any line', () => {
    const { errors } = parse('* 左 -> l\n');
    expect(errors.some((e) => e.kind === 'choiceWithoutLine')).toBe(true);
  });

  it('reports a duplicate label', () => {
    const { errors } = parse(':: a\n里昂: x\n:: a\n里昂: y\n');
    expect(errors.some((e) => e.kind === 'duplicateLabel')).toBe(true);
  });

  it('surfaces graph validation errors (dangling target)', () => {
    const { errors } = parse(':: a\n里昂: x\n-> nowhere\n');
    expect(errors.some((e) => e.kind === 'danglingReference')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/domain/dialogue/script/parser.test.ts`
Expected: FAIL — cannot find module `parser`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/domain/dialogue/script/parseError.ts
import { type GraphError } from '../graphError';

/** A DSL authoring error: either a syntactic problem or a merged graph-validation error. */
export type ParseError =
  | { readonly kind: 'choiceWithoutLine'; readonly line: number }
  | { readonly kind: 'gotoWithoutLine'; readonly line: number }
  | { readonly kind: 'duplicateLabel'; readonly id: string; readonly line: number }
  | { readonly kind: 'emptyLine'; readonly line: number }
  | { readonly kind: 'labelWithoutLine'; readonly id: string; readonly line: number }
  | GraphError;
```

```ts
// src/domain/dialogue/script/parser.ts
import { type DialogueGraph, fromNodes, validate } from '../dialogueGraph';
import { type DialogueNode } from '../dialogueNode';
import { type NodeExit, linearExit, branchExit, END_EXIT } from '../nodeExit';
import { nodeId } from '../nodeId';
import { speaker } from '../speaker';
import { portraitKey } from '../portraitKey';
import { dialogueChoice } from '../dialogueChoice';
import { tokenize } from './lexer';
import { type ParseError } from './parseError';

interface Building {
  id: string;
  speaker: string;
  line: string;
  portrait: string;
  exit: NodeExit | undefined; // undefined = not yet set (auto-chain candidate)
}

const DEFAULT_PORTRAIT = 'normal';

/** Compiles DSL source into a DialogueGraph. Returns the graph (if any nodes) and all authoring errors. */
export const parse = (source: string): { graph: DialogueGraph | undefined; errors: readonly ParseError[] } => {
  const tokens = tokenize(source);
  const nodes: Building[] = [];
  const errors: ParseError[] = [];
  const labels = new Set<string>();
  let pendingLabel: string | undefined;
  let auto = 0;

  const prev = (): Building | undefined => nodes[nodes.length - 1];

  for (const t of tokens) {
    switch (t.kind) {
      case 'label': {
        if (pendingLabel !== undefined) errors.push({ kind: 'labelWithoutLine', id: pendingLabel, line: t.line });
        if (labels.has(t.id)) errors.push({ kind: 'duplicateLabel', id: t.id, line: t.line });
        labels.add(t.id);
        pendingLabel = t.id;
        break;
      }
      case 'line': {
        if (t.speaker === '') { errors.push({ kind: 'emptyLine', line: t.line }); break; }
        const previous = prev();
        const id = pendingLabel ?? `#${auto++}`;
        pendingLabel = undefined;
        if (previous && previous.exit === undefined) previous.exit = linearExit(nodeId(id)); // auto-chain
        nodes.push({ id, speaker: t.speaker, line: t.text, portrait: t.portrait ?? DEFAULT_PORTRAIT, exit: undefined });
        break;
      }
      case 'goto': {
        const previous = prev();
        if (!previous) { errors.push({ kind: 'gotoWithoutLine', line: t.line }); break; }
        previous.exit = t.target === 'END' ? END_EXIT : linearExit(nodeId(t.target));
        break;
      }
      case 'choice': {
        const previous = prev();
        if (!previous) { errors.push({ kind: 'choiceWithoutLine', line: t.line }); break; }
        const choice = dialogueChoice(t.text, nodeId(t.target));
        previous.exit =
          previous.exit && previous.exit.kind === 'branch'
            ? branchExit([...previous.exit.choices, choice])
            : branchExit([choice]);
        break;
      }
    }
  }
  if (pendingLabel !== undefined) errors.push({ kind: 'labelWithoutLine', id: pendingLabel, line: 0 });

  if (nodes.length === 0) return { graph: undefined, errors };

  const built: DialogueNode[] = nodes.map((n) => ({
    id: nodeId(n.id),
    speaker: speaker(n.speaker),
    line: n.line,
    portrait: portraitKey(n.portrait),
    exit: n.exit ?? END_EXIT, // trailing node with no explicit exit ends the dialogue
  }));
  const graph = fromNodes(nodeId(nodes[0].id), built);
  errors.push(...validate(graph));
  return { graph, errors };
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/domain/dialogue/script/parser.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm run typecheck` → Expected: exit 0.

```bash
git add src/domain/dialogue/script/parseError.ts src/domain/dialogue/script/parser.ts tests/domain/dialogue/script/parser.test.ts
git commit -m "feat(dialogue): DSL parser (auto-chain, branches, END, error reporting)"
```

---

## Phase 3 — Reactive session (Svelte runes)

### Task 8: DialogueSession

**Files:**
- Create: `src/presentation/dialogue/dialogueSession.svelte.ts`
- Test: `tests/presentation/dialogue/dialogueSession.test.ts`

The session wraps pure playback in runes state and records a backlog. It is tested headlessly by
importing the `.svelte.ts` module (runes compile to plain reactive state; Vitest with the svelte
plugin evaluates it). If the module cannot be imported under the current Vitest config, convert the
test to instantiate via the exported `createDialogueSession` and assert on the returned getters.

- [ ] **Step 1: Write the failing test**

```ts
// tests/presentation/dialogue/dialogueSession.test.ts
import { describe, it, expect } from 'vitest';
import { createDialogueSession } from '../../../src/presentation/dialogue/dialogueSession.svelte';
import { parse } from '../../../src/domain/dialogue/script/parser';

const { graph } = parse(':: greet\n里昂: 你好。\n-> ask\n:: ask\n里昂: 走哪？\n* 左 -> l\n* 右 -> r\n:: l\n旁白: 左。\n:: r\n旁白: 右。\n');

describe('DialogueSession', () => {
  it('exposes speaker/line/choices and advances', () => {
    const s = createDialogueSession(graph!);
    expect(s.speaker).toBe('里昂');
    expect(s.line).toBe('你好。');
    expect(s.isFinished).toBe(false);
    s.advance();                       // -> ask (awaiting)
    expect(s.choices.map((c) => c.label)).toEqual(['左', '右']);
    s.select(0);                       // -> l
    expect(s.line).toBe('左。');
  });
  it('records a backlog of shown lines', () => {
    const s = createDialogueSession(graph!);
    s.advance(); s.select(1);          // greet, ask, r
    expect(s.backlog.map((b) => b.line)).toEqual(['你好。', '走哪？', '右。']);
  });
  it('an invalid input does not change state or backlog', () => {
    const s = createDialogueSession(graph!);
    s.advance();                       // now awaiting choice
    const before = s.backlog.length;
    s.advance();                       // no-op (advancing while awaiting)
    expect(s.backlog.length).toBe(before);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/presentation/dialogue/dialogueSession.test.ts`
Expected: FAIL — cannot find module `dialogueSession.svelte`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/presentation/dialogue/dialogueSession.svelte.ts
import { type DialogueGraph } from '../../domain/dialogue/dialogueGraph';
import { type DialogueState, currentNode } from '../../domain/dialogue/dialogueState';
import { type DialogueChoice } from '../../domain/dialogue/dialogueChoice';
import { start, step } from '../../domain/dialogue/dialoguePlayback';
import { ADVANCE, select as selectInput } from '../../domain/dialogue/dialogueInput';

export interface BacklogEntry { readonly speaker: string; readonly line: string; }

/**
 * A running dialogue as reactive state. Wraps the pure DialoguePlayback so components bind to
 * `speaker`/`line`/`choices`/`isFinished` and call `advance()`/`select()`. Records a backlog of
 * every shown line. Invalid input is a no-op (same state), so the backlog does not grow.
 */
export function createDialogueSession(graph: DialogueGraph) {
  let state = $state<DialogueState>(start(graph));
  const backlog = $state<BacklogEntry[]>([]);
  const record = (s: DialogueState) => {
    const node = currentNode(s);
    backlog.push({ speaker: node.speaker, line: node.line });
  };
  record(state);

  const apply = (next: DialogueState) => {
    if (next === state) return;          // no-op input: nothing changed
    state = next;
    record(state);
  };

  return {
    get state() { return state; },
    get speaker(): string { return currentNode(state).speaker; },
    get line(): string { return currentNode(state).line; },
    get portrait(): string { return currentNode(state).portrait; },
    get choices(): readonly DialogueChoice[] { return state.kind === 'awaitingChoice' ? state.choices : []; },
    get isFinished(): boolean { return state.kind === 'ended'; },
    get backlog(): readonly BacklogEntry[] { return backlog; },
    advance() { apply(step(graph, state, ADVANCE)); },
    select(index: number) { apply(step(graph, state, selectInput(index))); },
  };
}

export type DialogueSession = ReturnType<typeof createDialogueSession>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/presentation/dialogue/dialogueSession.test.ts`
Expected: PASS (3 tests).

If it fails to import `.svelte.ts` under Vitest, add the svelte plugin to the test config: in `vite.config.ts` ensure `svelte({ hot: false })` is present in `plugins` for the test run (it already is for the app), and set Vitest `environment` to keep `node`. Re-run.

- [ ] **Step 5: Commit**

```bash
git add src/presentation/dialogue/dialogueSession.svelte.ts tests/presentation/dialogue/dialogueSession.test.ts
git commit -m "feat(dialogue): reactive DialogueSession (runes) with backlog"
```

---

## Phase 4 — AVG UI

Styling follows `__design__` (white title-rail, black frosted-glass, single blue accent). Colors
and spacing are refined against the design during in-browser verification; the code below wires
structure and behaviour. Verify with the preview after each task (see Phase 5 for how the overlay
mounts; until then, temporarily render `<DialogueOverlay>` from `App.svelte` with a parsed sample
graph to view it).

### Task 9: DialogueOverlay + Nameplate + Line (typewriter)

**Files:**
- Create: `src/presentation/dialogue/Line.svelte`, `src/presentation/dialogue/Nameplate.svelte`, `src/presentation/dialogue/DialogueOverlay.svelte`

- [ ] **Step 1: Nameplate**

```svelte
<!-- src/presentation/dialogue/Nameplate.svelte -->
<script lang="ts">
  let { speaker }: { speaker: string } = $props();
</script>

<div class="nameplate">{speaker}</div>

<style>
  .nameplate {
    display: inline-block; background: #fff; color: #111;
    padding: 0.2rem 1rem; font-weight: 700; letter-spacing: 0.05em;
    clip-path: polygon(0 0, 100% 0, calc(100% - 0.6rem) 100%, 0 100%); /* 1a 切角銘牌 */
  }
</style>
```

- [ ] **Step 2: Line (typewriter with click-to-complete)**

```svelte
<!-- src/presentation/dialogue/Line.svelte -->
<script lang="ts">
  let { text, charMs = 24, onDone }: { text: string; charMs?: number; onDone?: () => void } = $props();
  let shown = $state('');
  let complete = $state(false);
  let timer: ReturnType<typeof setInterval> | undefined;

  const finish = () => { shown = text; complete = true; clearInterval(timer); onDone?.(); };

  $effect(() => {
    shown = ''; complete = false;
    let i = 0;
    clearInterval(timer);
    timer = setInterval(() => {
      i++; shown = text.slice(0, i);
      if (i >= text.length) finish();
    }, charMs);
    return () => clearInterval(timer);
  });

  /** Reveal-all on first click; the parent decides advance on the second. Returns true if it completed now. */
  export function reveal(): boolean { if (!complete) { finish(); return true; } return false; }
</script>

<p class="line">{shown}</p>

<style>
  .line { color: #f4f6f8; font-size: 1.15rem; line-height: 1.7; margin: 0; }
</style>
```

- [ ] **Step 3: DialogueOverlay (composes the box; click advances)**

```svelte
<!-- src/presentation/dialogue/DialogueOverlay.svelte -->
<script lang="ts">
  import type { DialogueSession } from './dialogueSession.svelte';
  import Nameplate from './Nameplate.svelte';
  import Line from './Line.svelte';

  let { session, onFinished }: { session: DialogueSession; onFinished?: () => void } = $props();
  let lineRef: Line;

  function onBoxClick() {
    if (session.choices.length > 0) return;      // choices handle their own clicks
    if (lineRef?.reveal()) return;               // first click completes the typewriter
    session.advance();                           // second click advances
    if (session.isFinished) onFinished?.();
  }
</script>

<div class="overlay">
  <div class="backdrop"></div>
  <button class="box" onclick={onBoxClick} aria-label="advance dialogue">
    <Nameplate speaker={session.speaker} />
    <Line bind:this={lineRef} text={session.line} />
  </button>
</div>

<style>
  .overlay { position: fixed; inset: 0; display: flex; align-items: flex-end; z-index: 10; }
  .backdrop { position: absolute; inset: 0;
    background: url('/design/background260709.png') center/cover no-repeat, rgba(0,0,0,0.35); }
  .box { position: relative; width: min(900px, 92vw); margin: 0 auto 6vh; text-align: left;
    background: rgba(12,14,18,0.72); backdrop-filter: blur(12px);
    border: 1px solid rgba(255,255,255,0.12); border-radius: 8px; padding: 1.4rem 1.6rem;
    display: flex; flex-direction: column; gap: 0.8rem; cursor: pointer; }
</style>
```

- [ ] **Step 4: Make the background asset available**

Copy the design background into the app's static assets:

```bash
mkdir -p public/design && cp "../../../__design__/uploads/background260709.png" public/design/background260709.png
git add public/design/background260709.png
```
(Path note: run from the worktree root; adjust the relative path to reach the repo-root `__design__/uploads/`.)

- [ ] **Step 5: Commit**

```bash
git add src/presentation/dialogue/Nameplate.svelte src/presentation/dialogue/Line.svelte src/presentation/dialogue/DialogueOverlay.svelte
git commit -m "feat(dialogue): AVG overlay, nameplate, typewriter line"
```

---

### Task 10: Choices + Controls (AUTO/SKIP/LOG) + Backlog

**Files:**
- Create: `src/presentation/dialogue/Choices.svelte`, `src/presentation/dialogue/Controls.svelte`, `src/presentation/dialogue/Backlog.svelte`
- Modify: `src/presentation/dialogue/DialogueOverlay.svelte`

- [ ] **Step 1: Choices**

```svelte
<!-- src/presentation/dialogue/Choices.svelte -->
<script lang="ts">
  import type { DialogueChoice } from '../../domain/dialogue/dialogueChoice';
  let { choices, onSelect }: { choices: readonly DialogueChoice[]; onSelect: (i: number) => void } = $props();
</script>

{#if choices.length > 0}
  <ul class="choices" role="listbox" aria-label="SELECT AN ACTION">
    {#each choices as choice, i}
      <li><button class="choice" onclick={() => onSelect(i)}>{choice.label}</button></li>
    {/each}
  </ul>
{/if}

<style>
  .choices { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.5rem; }
  .choice { width: 100%; text-align: left; padding: 0.7rem 1rem; color: #f4f6f8;
    background: rgba(255,255,255,0.06); border: 1px solid rgba(90,150,255,0.5);
    border-left: 3px solid #4a90ff; border-radius: 4px; cursor: pointer; }
  .choice:hover { background: rgba(74,144,255,0.18); }
</style>
```

- [ ] **Step 2: Controls (AUTO/SKIP/LOG)**

```svelte
<!-- src/presentation/dialogue/Controls.svelte -->
<script lang="ts">
  let { auto, onToggleAuto, onSkip, onToggleLog }:
    { auto: boolean; onToggleAuto: () => void; onSkip: () => void; onToggleLog: () => void } = $props();
</script>

<div class="controls">
  <button class:active={auto} onclick={onToggleAuto}>AUTO</button>
  <button onclick={onSkip}>SKIP</button>
  <button onclick={onToggleLog}>LOG</button>
</div>

<style>
  .controls { position: absolute; top: -2.4rem; right: 0; display: flex; gap: 0.5rem; }
  .controls button { color: #cdd6e0; background: rgba(12,14,18,0.72); border: 1px solid rgba(255,255,255,0.14);
    padding: 0.25rem 0.7rem; font-size: 0.75rem; letter-spacing: 0.08em; cursor: pointer; }
  .controls button.active { color: #4a90ff; border-color: #4a90ff; }
</style>
```

- [ ] **Step 3: Backlog**

```svelte
<!-- src/presentation/dialogue/Backlog.svelte -->
<script lang="ts">
  import type { BacklogEntry } from './dialogueSession.svelte';
  let { entries, onClose }: { entries: readonly BacklogEntry[]; onClose: () => void } = $props();
</script>

<div class="log">
  <header>對話回顧 <button onclick={onClose} aria-label="close log">×</button></header>
  <ol>
    {#each entries as e}
      <li><span class="who">{e.speaker}</span> {e.line}</li>
    {/each}
  </ol>
</div>

<style>
  .log { position: absolute; inset: 8% 8% 12%; background: rgba(8,10,14,0.92); backdrop-filter: blur(14px);
    border: 1px solid rgba(255,255,255,0.12); border-radius: 8px; padding: 1.2rem; overflow-y: auto; z-index: 11; }
  .log header { display: flex; justify-content: space-between; color: #fff; font-weight: 700; margin-bottom: 0.8rem; }
  .log ol { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.6rem; color: #dfe6ee; }
  .who { color: #4a90ff; margin-right: 0.6rem; }
  .log button { background: none; border: none; color: #cdd6e0; font-size: 1.2rem; cursor: pointer; }
</style>
```

- [ ] **Step 4: Wire Choices/Controls/Backlog into DialogueOverlay**

Replace `src/presentation/dialogue/DialogueOverlay.svelte`'s `<script>` and markup with:

```svelte
<!-- src/presentation/dialogue/DialogueOverlay.svelte -->
<script lang="ts">
  import type { DialogueSession } from './dialogueSession.svelte';
  import Nameplate from './Nameplate.svelte';
  import Line from './Line.svelte';
  import Choices from './Choices.svelte';
  import Controls from './Controls.svelte';
  import Backlog from './Backlog.svelte';

  let { session, onFinished }: { session: DialogueSession; onFinished?: () => void } = $props();
  let lineRef: Line | undefined = $state();
  let auto = $state(false);
  let showLog = $state(false);
  let lineDone = $state(false);

  function advance() {
    session.advance();
    if (session.isFinished) { finish(); }
  }
  function finish() { auto = false; onFinished?.(); }
  function onSelect(i: number) { session.select(i); }
  function onBoxClick() {
    if (session.choices.length > 0) return;
    if (lineRef?.reveal()) return;
    advance();
  }
  function onBoxKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onBoxClick(); }
  }
  function skip() { while (!session.isFinished && session.choices.length === 0) session.advance();
    if (session.isFinished) finish(); }

  // AUTO: once the current line finishes revealing, advance after a pause (only when not awaiting a choice).
  // Setting auto = false (e.g. via finish()) re-runs this effect and fires the cleanup, cancelling any pending timer.
  $effect(() => {
    if (auto && lineDone && session.choices.length === 0 && !session.isFinished) {
      const t = setTimeout(advance, 1200);
      return () => clearTimeout(t);
    }
  });

  // Reset the typewriter-done flag whenever the line changes ({#key session.line} remounts <Line>).
  $effect(() => { session.line; lineDone = false; });
</script>

<div class="overlay">
  <div class="backdrop"></div>
  <div class="box-wrap">
    <Controls {auto} onToggleAuto={() => (auto = !auto)} onSkip={skip} onToggleLog={() => (showLog = !showLog)} />
    <div class="box">
      <Nameplate speaker={session.speaker} />
      <div class="hit" role="button" tabindex="0" onclick={onBoxClick} onkeydown={onBoxKeydown}
           aria-label="advance dialogue">
        {#key session.line}
          <Line bind:this={lineRef} text={session.line} onDone={() => (lineDone = true)} />
        {/key}
      </div>
      <Choices choices={session.choices} onSelect={onSelect} />
    </div>
  </div>
  {#if showLog}<Backlog entries={session.backlog} onClose={() => (showLog = false)} />{/if}
</div>

<style>
  .overlay { position: fixed; inset: 0; display: flex; align-items: flex-end; z-index: 10; }
  .backdrop { position: absolute; inset: 0;
    background: url('/design/background260709.png') center/cover no-repeat, rgba(0,0,0,0.35); }
  .box-wrap { position: relative; width: min(900px, 92vw); margin: 0 auto 6vh; }
  .box { position: relative; width: 100%; text-align: left; background: rgba(12,14,18,0.72);
    backdrop-filter: blur(12px); border: 1px solid rgba(255,255,255,0.12); border-radius: 8px;
    padding: 1.4rem 1.6rem; display: flex; flex-direction: column; gap: 0.8rem; }
  .hit { cursor: pointer; }
</style>
```

Note: `.box` is a plain `<div>`, not a `<button>` — it now contains `<Choices>`'s own `<button>`s as a
sibling, and nesting an interactive element (a button) inside another interactive element is invalid
HTML and an a11y defect. Only the advance region (nameplate + line) is the focusable control, via
`.hit` (`role="button"` + `tabindex="0"` + click/keydown handlers), so `<Choices>` can sit beside it
without being nested inside an interactive ancestor. `lineDone` resets when the line changes: the
`{#key session.line}` remounts `Line`, and `lineDone` is set back to false by the second `$effect`
above. The AUTO `$effect` returns a cleanup (`() => clearTimeout(t)`) rather than relying on a
module-level timer var, so the pending timer is cancelled both on re-run and on unmount.

- [ ] **Step 5: Commit**

```bash
git add src/presentation/dialogue/Choices.svelte src/presentation/dialogue/Controls.svelte src/presentation/dialogue/Backlog.svelte src/presentation/dialogue/DialogueOverlay.svelte
git commit -m "feat(dialogue): choices, AUTO/SKIP/LOG controls, backlog panel"
```

---

## Phase 5 — Hub-intro integration

### Task 11: Game-mode gate + intro script + input suspension

**Files:**
- Create: `src/content/dialogue/intro.dlg`, `src/app/gameMode.svelte.ts`
- Modify: `src/presentation/babylon/input.ts`, `src/app/App.svelte`

- [ ] **Step 1: Author the intro script**

```
# src/content/dialogue/intro.dlg — 第一章 雲上的哨站
:: intro
里昂: 雲層再往下沉三十公尺，哨站就看不見谷底了。
旁白: 風從西面壓過來，銀色的護甲上滑過一層薄光。
里昂: 你確定要在這種天氣裡下去？
* 走向懸崖邊，確認雲層下的動靜 -> cliff
* 先與同行的騎士確認裝備 -> gear
* 什麼都不說，繼續等待 -> wait

:: cliff
旁白: 你走向懸崖，雲在腳下翻湧。
-> END

:: gear
里昂: 好，先檢查裝備。謹慎點沒錯。
-> END

:: wait
旁白: 你按住不動，讓風先過去。
-> END
```

Import it as a raw string (Vite `?raw`): `import introSource from '../content/dialogue/intro.dlg?raw';`

- [ ] **Step 2: Game mode**

```ts
// src/app/gameMode.svelte.ts
/** The hub is either playing the intro dialogue or in normal gameplay. */
export type Mode = 'intro' | 'playing';

export function createGameMode() {
  let mode = $state<Mode>('intro');
  return {
    get mode() { return mode; },
    get isPlaying() { return mode === 'playing'; },
    toPlaying() { mode = 'playing'; },
  };
}
export type GameMode = ReturnType<typeof createGameMode>;
```

- [ ] **Step 3: Let input be suspended**

Modify `src/presentation/babylon/input.ts` so the axis/jump read as neutral while suspended. Add an
`enabled` flag with a setter, and gate `axis()`/`consumeJump()`:

```ts
// in createInput(), add:
let enabled = true;
// gate the raw handlers too — while suspended they must be fully inert (no down-tracking, no
// preventDefault), otherwise a key pressed during the overlay is already "down" the instant input
// re-enables, and preventDefault on Enter/Space can fight the overlay's own advance handler:
const onKeyDown = (e: KeyboardEvent) => {
  if (!enabled) return;
  const k = e.key.toLowerCase();
  if (GAME_KEYS.has(k)) e.preventDefault();
  if (!down.has(k) && isJumpKey(k)) jumpQueued = true;
  down.add(k);
};
const onKeyUp = (e: KeyboardEvent) => { if (!enabled) return; down.delete(e.key.toLowerCase()); };
// change axis() to:
axis: () => enabled
  ? { x: (down.has('d') ? 1 : 0) - (down.has('a') ? 1 : 0), y: (down.has('w') ? 1 : 0) - (down.has('s') ? 1 : 0) }
  : { x: 0, y: 0 },
// change consumeJump() to early-return false when !enabled:
consumeJump: () => { if (!enabled) { jumpQueued = false; return false; } const j = jumpQueued; jumpQueued = false; return j; },
// add to the returned object:
setEnabled: (value: boolean) => { enabled = value; if (!value) { down.clear(); jumpQueued = false; } },
```

Add `setEnabled(value: boolean): void;` to the `InputState` interface. Also gate the follow camera:
`createHubScene` should expose the ability to suspend camera look — simplest is to call
`input.setEnabled(false)` and additionally `follow.setEnabled?.(false)` if present; if the camera has
no such flag, add an `enabled` guard in `followCamera.ts`'s pointer-move handler mirroring the input
pattern.

- [ ] **Step 4: Mount the overlay in App.svelte and wire the handoff**

```svelte
<!-- src/app/App.svelte (add to existing) -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { createHubScene, type HubScene } from '../presentation/babylon/hubScene';
  import { parse } from '../domain/dialogue/script/parser';
  import { createDialogueSession } from '../presentation/dialogue/dialogueSession.svelte';
  import DialogueOverlay from '../presentation/dialogue/DialogueOverlay.svelte';
  import { createGameMode } from './gameMode.svelte';
  import introSource from '../content/dialogue/intro.dlg?raw';

  let canvas: HTMLCanvasElement;
  let hub: HubScene | undefined;
  const gameMode = createGameMode();
  const { graph, errors } = parse(introSource);
  if (errors.length) console.error('intro.dlg authoring errors:', errors);
  const session = graph ? createDialogueSession(graph) : undefined;

  onMount(() => {
    let disposed = false;
    createHubScene(canvas).then((h) => {
      if (disposed) { h.dispose(); return; }
      hub = h;
      // Gate, don't unconditionally suspend: createHubScene() resolves asynchronously (Havok +
      // glTF load), and SKIP — or a parse failure that leaves `session` undefined — can already
      // have finished the intro (gameMode.isPlaying === true) before this .then() runs. An
      // unconditional suspendInput(true) here would disable input with no overlay left to ever
      // re-enable it (fail-open: only suspend if there's a session that can still release it).
      hub.suspendInput(session !== undefined && !gameMode.isPlaying);
      if (import.meta.env.DEV) (window as unknown as { hub: unknown }).hub = h;
    });
    return () => { disposed = true; hub?.dispose(); };
  });

  function finishIntro() {
    gameMode.toPlaying();
    hub?.suspendInput(false);                     // hand control back to gameplay
  }
</script>

<canvas bind:this={canvas} style="width:100vw;height:100vh;display:block"></canvas>
{#if session && !gameMode.isPlaying}
  <DialogueOverlay {session} onFinished={finishIntro} />
{/if}
```

Add `suspendInput(on: boolean): void` to `HubScene` (in `hubScene.ts`): it calls
`input.setEnabled(!on)` and the camera guard from Step 3.

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm run typecheck` → Expected: exit 0.

```bash
git add src/content/dialogue/intro.dlg src/app/gameMode.svelte.ts src/presentation/babylon/input.ts src/presentation/babylon/hubScene.ts src/app/App.svelte
git commit -m "feat(dialogue): hub-intro overlay with AVG/gameplay mode handoff"
```

---

### Task 12: End-to-end in-browser verification

**Files:** none (verification only).

- [ ] **Step 1: Start the preview**

`preview_start { name: "dev" }`, wait ~8s for Havok + scene.

- [ ] **Step 2: Verify the intro plays and input is suspended**

In the browser: the overlay shows over the 3D scene with 里昂's first line typing out. Confirm WASD
does nothing yet (via `window.hub`): dispatch `keydown w`, force a few `scene.render()`, and assert
`hub.player.motion` planar speed stays 0 while in intro mode.

- [ ] **Step 3: Verify advance, typewriter, choices, branch**

Click the box: first click completes the typewriter, second advances. Advance to the choice; assert
`session.choices` has 3 labels; click one; assert the line updates to that branch's node.

- [ ] **Step 4: Verify AUTO / SKIP / LOG**

Toggle AUTO and confirm lines auto-advance after the reveal; open LOG and confirm the backlog lists
the shown lines; press SKIP on a fresh run and confirm it reaches the end.

- [ ] **Step 5: Verify handoff**

When the dialogue ends (or SKIP), the overlay unmounts and gameplay resumes: dispatch `keydown w`,
force frames, and assert planar speed ramps up again (mirrors the existing character test). Capture a
screenshot of the intro overlay for the record.

- [ ] **Step 6: Full suite + commit (if any fixups were needed)**

Run: `pnpm test` (all dialogue + existing tests green) and `pnpm run typecheck` (exit 0).

```bash
git commit -am "test(dialogue): end-to-end intro verification fixups" # only if changes were needed
```

---

## Self-review coverage map

- Spec §4 domain port → Tasks 1–5. §5 DSL → Tasks 6–7. §6 session+backlog → Task 8. §7 AVG UI
  (nameplate/typewriter/choices/LOG/AUTO/SKIP) → Tasks 9–10. §8 hub-intro + mode handoff → Task 11.
  §9 testing → per-task Vitest + Task 12 in-browser. §11 title-rail 1a / placeholder portraits →
  Nameplate clip-path + `normal` default.
- Deferred per spec (not in plan): Save/Load, MENU, chapter-title card, NPC triggers.
