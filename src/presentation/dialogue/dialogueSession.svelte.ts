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
  const initial = start(graph);
  let state = $state<DialogueState>(initial);
  const backlog = $state<BacklogEntry[]>([]);
  const record = (s: DialogueState) => {
    const node = currentNode(s);
    backlog.push({ speaker: node.speaker, line: node.line });
  };
  record(initial); // seed from the plain local, not the $state rune (avoids a top-level reactive read)

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
