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
