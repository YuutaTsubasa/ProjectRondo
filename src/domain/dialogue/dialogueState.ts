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
