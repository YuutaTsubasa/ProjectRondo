import { type NodeId } from './nodeId';
import { type DialogueChoice } from './dialogueChoice';

/** Where a node leads: the linear next, a set of branch choices, or the end. */
export type NodeExit =
  | { readonly kind: 'linear'; readonly next: NodeId }
  | { readonly kind: 'branch'; readonly choices: readonly DialogueChoice[] }
  | { readonly kind: 'end' };

export const linearExit = (next: NodeId): NodeExit => ({ kind: 'linear', next });
/** A branch must offer at least one choice; an empty branch would strand playback (every select is out of range). */
export const branchExit = (choices: readonly DialogueChoice[]): NodeExit => {
  if (choices.length === 0) throw new Error('A branch exit needs at least one choice.');
  return { kind: 'branch', choices };
};
export const END_EXIT: NodeExit = { kind: 'end' };
