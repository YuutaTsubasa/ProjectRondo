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
