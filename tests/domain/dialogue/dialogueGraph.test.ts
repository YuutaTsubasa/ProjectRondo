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
