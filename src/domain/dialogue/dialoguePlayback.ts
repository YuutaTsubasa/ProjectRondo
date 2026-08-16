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
    default: { const _exhaustive: never = state; return _exhaustive; }
  }
};
