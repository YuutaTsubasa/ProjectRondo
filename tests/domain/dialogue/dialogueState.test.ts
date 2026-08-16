import { describe, it, expect } from 'vitest';
import { currentNode, type DialogueState } from '../../../src/domain/dialogue/dialogueState';
import { type DialogueNode } from '../../../src/domain/dialogue/dialogueNode';
import { nodeId } from '../../../src/domain/dialogue/nodeId';
import { speaker } from '../../../src/domain/dialogue/speaker';
import { portraitKey } from '../../../src/domain/dialogue/portraitKey';
import { END_EXIT } from '../../../src/domain/dialogue/nodeExit';
import { dialogueChoice } from '../../../src/domain/dialogue/dialogueChoice';

const node = (id: string): DialogueNode =>
  ({ id: nodeId(id), speaker: speaker('N'), line: id, portrait: portraitKey('normal'), exit: END_EXIT });

describe('currentNode', () => {
  it('returns the current node while speaking', () => {
    const n = node('a');
    expect(currentNode({ kind: 'speaking', current: n } satisfies DialogueState)).toBe(n);
  });
  it('returns the current node while awaiting a choice', () => {
    const n = node('a');
    const state: DialogueState = { kind: 'awaitingChoice', current: n, choices: [dialogueChoice('x', nodeId('b'))] };
    expect(currentNode(state)).toBe(n);
  });
  it('returns the last node when ended', () => {
    const n = node('z');
    expect(currentNode({ kind: 'ended', last: n } satisfies DialogueState)).toBe(n);
  });
});
