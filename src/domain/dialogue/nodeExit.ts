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
