import { type NodeId } from './nodeId';

/** A branch option: a label the player picks, and the node it leads to. */
export interface DialogueChoice {
  readonly label: string;
  readonly target: NodeId;
}
export const dialogueChoice = (label: string, target: NodeId): DialogueChoice => ({ label, target });
